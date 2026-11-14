"""Photos from the public. Nothing is shown until a moderator approves it."""

import logging
import math
import uuid
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile, status

from app.devices import valid_device
from app.permissions import Permission, permissions_for
from app.rate_limits import PhotoUploadLimitDep
from app.repositories.courses import CourseDep
from app.repositories.parades import ParadeListDep, ParadesRepoDep, resolve_parade
from app.repositories.photos import Photo, PhotoNotFound, PhotosRepoDep, PhotoState
from app.schemas import Schema, to_ms
from app.security import OptionalUserDep, require
from app.storage import StorageDep

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["photos"])
moderation = APIRouter(
    prefix="/api/admin/photos",
    tags=["admin: photos"],
    dependencies=[require(Permission.PHOTOS_MODERATE)],
)

# The client already shrinks it to about 1600 px: a photo heavier than this
# did not go through the app. src/app/api/fotos/route.ts · PESO_MAX
MAX_BYTES = int(1.5 * 1024 * 1024)
# The first three bytes of every JPEG.
JPEG_START = b"\xff\xd8\xff"

NOT_FOUND = HTTPException(status.HTTP_404_NOT_FOUND, "No existe esa foto.")


class PhotoOut(Schema):
    """Web: `Foto`."""

    id: uuid.UUID
    parade_id: str | None
    # The stretch of the course it was taken on, if it was shared.
    metres: float | None
    state: PhotoState
    created_at: int
    # Where to ask for the image, relative to the API.
    url: str


class Photos(Schema):
    photos: list[PhotoOut]


class Uploaded(Schema):
    ok: bool = True
    id: uuid.UUID


class StateBody(Schema):
    state: PhotoState


class Ok(Schema):
    ok: bool = True


def photo_out(photo: Photo) -> PhotoOut:
    return PhotoOut(
        id=photo.id,
        parade_id=photo.parade_id,
        metres=photo.course_m,
        state=photo.state,
        created_at=to_ms(photo.created_at),
        url=f"/api/photos/{photo.id}",
    )


@router.get("/photos")
async def list_photos(photos: PhotosRepoDep, response: Response) -> Photos:
    """The photos already moderated, newest first."""
    response.headers["Cache-Control"] = "public, max-age=30, stale-while-revalidate=300"
    return Photos(photos=[photo_out(photo) for photo in await photos.list("approved")])


@router.post("/photos", status_code=status.HTTP_201_CREATED)
async def upload_photo(
    photos: PhotosRepoDep,
    storage: StorageDep,
    limit: PhotoUploadLimitDep,
    parades: ParadesRepoDep,
    parade_list: ParadeListDep,
    course: CourseDep,
    device: Annotated[str, Form()] = "",
    photo: Annotated[UploadFile | None, File()] = None,
    metres: Annotated[str | None, Form()] = None,
) -> Uploaded:
    """Uploads a photo. It stays PENDING until someone on the team approves it.

    There are no accounts: a device id issued by the server is required, and
    how many each one may send per hour is capped.
    """
    device_id = valid_device(device)
    if device_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Dispositivo no reconocido.")
    if not limit.allowed(device_id):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "Ya subiste varias fotos. Probá más tarde."
        )

    data = await photo.read(MAX_BYTES + 1) if photo is not None else b""
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Falta la foto.")
    if len(data) > MAX_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "La foto pesa demasiado.")
    # What the browser says the type is, is not trusted.
    if not data.startswith(JPEG_START):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Solo se aceptan fotos JPEG.")

    course_m: float | None = None
    try:
        asked = float(metres) if metres is not None else math.nan
    except ValueError:
        asked = math.nan
    if math.isfinite(asked) and 0 <= asked <= course.length_metres:
        course_m = asked

    parade = await resolve_parade(parades, parade_list)
    photo_id = uuid.uuid4()
    path = f"photos/{photo_id}.jpg"
    await storage.save(path, data)
    try:
        await photos.create(
            id=photo_id,
            parade_id=parade.id if parade else None,
            storage_path=path,
            course_m=course_m,
        )
    except Exception:
        # No row, no file: nothing would ever find it.
        await storage.delete(path)
        raise
    limit.record(device_id)
    return Uploaded(id=photo_id)


@router.get(
    "/photos/{photo_id}",
    response_class=Response,
    responses={200: {"content": {"image/jpeg": {}}}},
)
async def read_photo(
    photo_id: uuid.UUID, user: OptionalUserDep, photos: PhotosRepoDep, storage: StorageDep
) -> Response:
    """The image.

    Only approved ones are public; a pending or rejected one is seen only by
    whoever moderates, and for everyone else it does not exist.
    """
    photo = await photos.by_id(photo_id)
    if photo is None:
        raise NOT_FOUND
    public = photo.state == "approved"
    moderator = user is not None and Permission.PHOTOS_MODERATE in permissions_for(user.roles)
    if not public and not moderator:
        raise NOT_FOUND
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
async def list_all_photos(photos: PhotosRepoDep, response: Response) -> Photos:
    """Every photo with its state. The moderation queue, the pending ones, comes first."""
    response.headers["Cache-Control"] = "no-store"
    return Photos(photos=[photo_out(photo) for photo in await photos.list()])


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
