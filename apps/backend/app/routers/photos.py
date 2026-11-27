"""Photos from the public. Nothing is shown until a moderator approves it."""

import logging
import math
import time
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse

from app.devices import valid_device
from app.permissions import Permission, permissions_for
from app.rate_limits import PhotoUploadLimitDep
from app.repositories.courses import CourseDep
from app.repositories.parades import ParadeListDep, ParadesRepoDep, resolve_parade
from app.repositories.photos import Photo, PhotoNotFound, PhotosRepoDep, PhotoState
from app.schemas import Schema, to_ms
from app.security import OptionalUserDep, require
from app.storage import Storage, StorageDep
from app.uploads import UploadGrant, issue_upload, read_upload

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["photos"])
moderation = APIRouter(
    prefix="/api/admin/photos",
    tags=["admin: photos"],
    dependencies=[require(Permission.PHOTOS_MODERATE)],
)

# The client already shrinks it to about 1600 px: a photo heavier than this
# did not go through the app.
MAX_BYTES = int(1.5 * 1024 * 1024)
# The first three bytes of every JPEG.
JPEG_START = b"\xff\xd8\xff"
# How long the phone has to upload once it was allowed to.
UPLOAD_EXPIRES_S = 5 * 60
# How long a signed URL to see a photo lasts. Longer than the wall's cache.
DOWNLOAD_EXPIRES_S = 60 * 60

NOT_FOUND = HTTPException(status.HTTP_404_NOT_FOUND, "No existe esa foto.")
UNKNOWN_DEVICE = HTTPException(status.HTTP_401_UNAUTHORIZED, "Dispositivo no reconocido.")
TOO_HEAVY = HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "La foto pesa demasiado.")
NOT_JPEG = HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Solo se aceptan fotos JPEG.")
BAD_UPLOAD = HTTPException(
    status.HTTP_403_FORBIDDEN, "Ese permiso para subir no vale o ya venció. Probá otra vez."
)


class PhotoOut(Schema):
    """Web: `Photo`."""

    id: uuid.UUID
    parade_id: str | None
    # The stretch of the course it was taken on, if it was shared.
    metres: float | None
    state: PhotoState
    created_at: int
    # Where to ask for the image: a signed URL of the bucket, or a path of the API.
    url: str


class Photos(Schema):
    photos: list[PhotoOut]


class UploadBody(Schema):
    device: str = ""
    size: Any = None


class UploadOut(Schema):
    id: uuid.UUID
    # Absolute when it is the bucket, relative to the API without one.
    upload_url: str
    # The upload must send exactly this Content-Type: it is part of the signature.
    content_type: str = "image/jpeg"
    token: str
    expires_at: int


class DoneBody(Schema):
    token: str = ""
    metres: Any = None


class Uploaded(Schema):
    ok: bool = True
    id: uuid.UUID


class StateBody(Schema):
    state: PhotoState


class Ok(Schema):
    ok: bool = True


def incoming_path(photo_id: uuid.UUID) -> str:
    # Uploads land here and only move to photos/ once checked. A bucket rule
    # deletes what is left in incoming/ after a day.
    return f"incoming/{photo_id}.jpg"


def photo_out(photo: Photo, storage: Storage) -> PhotoOut:
    return PhotoOut(
        id=photo.id,
        parade_id=photo.parade_id,
        metres=photo.course_m,
        state=photo.state,
        created_at=to_ms(photo.created_at),
        url=storage.download_url(photo.storage_path, DOWNLOAD_EXPIRES_S)
        or f"/api/photos/{photo.id}",
    )


def _metres_on_course(value: object, length_metres: float) -> float | None:
    try:
        asked = float(value) if isinstance(value, int | float | str) else math.nan
    except ValueError:
        return None
    return asked if math.isfinite(asked) and 0 <= asked <= length_metres else None


@router.get("/photos")
async def list_photos(photos: PhotosRepoDep, storage: StorageDep, response: Response) -> Photos:
    """The photos already moderated, newest first."""
    response.headers["Cache-Control"] = "public, max-age=30, stale-while-revalidate=300"
    return Photos(photos=[photo_out(photo, storage) for photo in await photos.list("approved")])


@router.post("/photos/uploads", status_code=status.HTTP_201_CREATED)
async def start_upload(
    body: UploadBody, storage: StorageDep, limit: PhotoUploadLimitDep
) -> UploadOut:
    """Allows one upload: answers where to PUT the photo and a token to finish it.

    There are no accounts: a device id issued by the server is required, and
    how many each one may send per hour is capped.
    """
    device_id = valid_device(body.device)
    if device_id is None:
        raise UNKNOWN_DEVICE
    if not limit.allowed(device_id):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "Ya subiste varias fotos. Probá más tarde."
        )
    size = body.size
    if not isinstance(size, int) or isinstance(size, bool) or size <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Falta la foto.")
    if size > MAX_BYTES:
        raise TOO_HEAVY

    photo_id = uuid.uuid4()
    grant = UploadGrant(photo_id, device_id, size, int(time.time()) + UPLOAD_EXPIRES_S)
    token = issue_upload(grant)
    url = storage.upload_url(incoming_path(photo_id), size, UPLOAD_EXPIRES_S)
    return UploadOut(
        id=photo_id,
        upload_url=url or f"/api/photos/uploads/{photo_id}?token={token}",
        token=token,
        expires_at=grant.expires_at * 1000,
    )


@router.put("/photos/uploads/{photo_id}")
async def receive_upload(
    photo_id: uuid.UUID,
    request: Request,
    storage: StorageDep,
    token: Annotated[str, Query()] = "",
) -> Ok:
    """Only without a bucket: the API receives the file the phone would PUT there."""
    if storage.signs_urls:
        raise NOT_FOUND
    grant = read_upload(token, photo_id)
    if grant is None:
        raise BAD_UPLOAD
    data = b""
    async for chunk in request.stream():
        data += chunk
        if len(data) > grant.size:
            raise TOO_HEAVY
    await storage.save(incoming_path(photo_id), data)
    return Ok()


@router.post("/photos/uploads/{photo_id}/done", status_code=status.HTTP_201_CREATED)
async def finish_upload(
    photo_id: uuid.UUID,
    body: DoneBody,
    photos: PhotosRepoDep,
    storage: StorageDep,
    limit: PhotoUploadLimitDep,
    parades: ParadesRepoDep,
    parade_list: ParadeListDep,
    course: CourseDep,
) -> Uploaded:
    """Checks the file that arrived and, if it is a JPEG of the size allowed,
    turns it into a photo PENDING moderation. Otherwise it is deleted."""
    grant = read_upload(body.token, photo_id)
    if grant is None:
        raise BAD_UPLOAD
    if await photos.by_id(photo_id) is not None:
        return Uploaded(id=photo_id)

    incoming = incoming_path(photo_id)
    size = await storage.size(incoming)
    if size is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "La foto no llegó. Probá otra vez.")
    # What the browser says the type is, is not trusted: the bytes are read.
    start = await storage.read_start(incoming, len(JPEG_START))
    failure = (
        TOO_HEAVY
        if size > min(grant.size, MAX_BYTES)
        else HTTPException(status.HTTP_409_CONFLICT, "La foto no llegó completa. Probá otra vez.")
        if size != grant.size
        else NOT_JPEG
        if start != JPEG_START
        else None
    )
    if failure is not None:
        await storage.delete(incoming)
        raise failure
    if not limit.allowed(grant.device_id):
        await storage.delete(incoming)
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "Ya subiste varias fotos. Probá más tarde."
        )

    parade = await resolve_parade(parades, parade_list)
    path = f"photos/{photo_id}.jpg"
    await storage.move(incoming, path)
    try:
        await photos.create(
            id=photo_id,
            parade_id=parade.id if parade else None,
            storage_path=path,
            course_m=_metres_on_course(body.metres, course.length_metres),
        )
    except Exception:
        # No row, no file: nothing would ever find it.
        await storage.delete(path)
        raise
    limit.record(grant.device_id)
    return Uploaded(id=photo_id)


@router.get(
    "/photos/{photo_id}",
    response_class=Response,
    responses={200: {"content": {"image/jpeg": {}}}, 307: {"description": "To the bucket"}},
)
async def read_photo(
    photo_id: uuid.UUID, user: OptionalUserDep, photos: PhotosRepoDep, storage: StorageDep
) -> Response:
    """The image.

    Only approved ones are public; a pending or rejected one is seen only by
    whoever moderates, and for everyone else it does not exist. With a bucket
    this redirects to a signed URL instead of carrying the bytes.
    """
    photo = await photos.by_id(photo_id)
    if photo is None:
        raise NOT_FOUND
    public = photo.state == "approved"
    moderator = user is not None and Permission.PHOTOS_MODERATE in permissions_for(user.roles)
    if not public and not moderator:
        raise NOT_FOUND
    signed = storage.download_url(photo.storage_path, DOWNLOAD_EXPIRES_S)
    if signed is not None:
        return RedirectResponse(signed, headers={"Cache-Control": "private, no-store"})
    data = await storage.read(photo.storage_path)
    if data is None:
        raise NOT_FOUND
    return Response(
        data,
        media_type="image/jpeg",
        headers={
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "public, max-age=86400" if public else "private, no-store",
        },
    )


@moderation.get("")
async def list_all_photos(photos: PhotosRepoDep, storage: StorageDep, response: Response) -> Photos:
    """Every photo with its state. The moderation queue, the pending ones, comes first.

    Behind a login, so pending photos get a signed URL too: that is how the
    moderator sees them.
    """
    response.headers["Cache-Control"] = "no-store"
    return Photos(photos=[photo_out(photo, storage) for photo in await photos.list()])


@moderation.patch("/{photo_id}")
async def moderate_photo(photo_id: uuid.UUID, body: StateBody, photos: PhotosRepoDep) -> Ok:
    try:
        await photos.set_state(photo_id, body.state)
    except PhotoNotFound as error:
        raise NOT_FOUND from error
    return Ok()


@moderation.delete("/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_photo(photo_id: uuid.UUID, photos: PhotosRepoDep, storage: StorageDep) -> None:
    """Deletes the photo and its file."""
    try:
        photo = await photos.delete(photo_id)
    except PhotoNotFound as error:
        raise NOT_FOUND from error
    try:
        await storage.delete(photo.storage_path)
    except Exception:
        # The row is gone, so nobody can reach the file: it is only litter.
        log.exception("Could not delete the file %s", photo.storage_path)
