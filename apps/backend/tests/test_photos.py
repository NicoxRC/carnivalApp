import uuid
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.devices import issue_device
from app.repositories.parades import ParadesMemory
from app.repositories.photos import PhotosMemory
from app.storage import DiskStorage, S3Storage
from tests.conftest import MakeUser, auth

JPEG = b"\xff\xd8\xff\xe0" + b"a small photo" * 10
PNG = b"\x89PNG\r\n\x1a\n" + b"not a jpeg" * 10
ADMIN = "/api/admin/photos"


def upload(client: TestClient, data: bytes = JPEG, device: str | None = None, **form: str) -> Any:
    return client.post(
        "/api/photos",
        data={"device": device if device is not None else issue_device(), **form},
        files={"photo": ("photo.jpg", data, "image/jpeg")},
    )


# --- storage ---------------------------------------------------------------


async def test_save_and_read_ok(tmp_path: Path) -> None:
    storage = DiskStorage(tmp_path)

    await storage.save("photos/a.jpg", JPEG)

    assert await storage.read("photos/a.jpg") == JPEG
    assert (tmp_path / "photos" / "a.jpg").read_bytes() == JPEG
    await storage.delete("photos/a.jpg")
    assert await storage.read("photos/a.jpg") is None
    # Deleting what is not there is not an error.
    await storage.delete("photos/a.jpg")


async def test_read_fails(tmp_path: Path) -> None:
    storage = DiskStorage(tmp_path)

    assert await storage.read("photos/missing.jpg") is None
    # A path never gets out of the folder.
    for save_or_read in (storage.read("../outside.jpg"), storage.save("/etc/outside.jpg", JPEG)):
        try:
            await save_or_read
        except ValueError:
            continue
        raise AssertionError("a path left the storage")


class FakeS3:
    """Stands in for the boto3 client: a dictionary with the three calls used."""

    class exceptions:  # noqa: N801
        class NoSuchKey(Exception):
            pass

    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], dict[str, Any]] = {}

    def put_object(self, *, Bucket: str, Key: str, Body: bytes, ContentType: str) -> None:  # noqa: N803
        self.objects[(Bucket, Key)] = {"Body": Body, "ContentType": ContentType}

    def get_object(self, *, Bucket: str, Key: str) -> dict[str, Any]:  # noqa: N803
        if (Bucket, Key) not in self.objects:
            raise self.exceptions.NoSuchKey()
        body = self.objects[(Bucket, Key)]["Body"]
        return {"Body": type("Stream", (), {"read": lambda self: body})()}

    def delete_object(self, *, Bucket: str, Key: str) -> None:  # noqa: N803
        self.objects.pop((Bucket, Key), None)


async def test_s3_storage_ok() -> None:
    fake = FakeS3()
    storage = S3Storage(fake, "the-bucket")  # type: ignore[arg-type]

    await storage.save("photos/a.jpg", JPEG)

    assert fake.objects[("the-bucket", "photos/a.jpg")]["ContentType"] == "image/jpeg"
    assert await storage.read("photos/a.jpg") == JPEG
    assert await storage.read("photos/missing.jpg") is None
    await storage.delete("photos/a.jpg")
    assert fake.objects == {}


# --- upload ----------------------------------------------------------------


async def test_upload_photo_ok(
    client: TestClient, parades: ParadesMemory, photos: PhotosMemory, storage: DiskStorage
) -> None:
    await parades.save(
        id="d6-1", name="Desfile Magno", date="2999-01-06", start_time="10:00", course_id="c"
    )

    response = upload(client, metres="1234.5")

    assert response.status_code == 201
    assert response.json()["ok"] is True
    photo = await photos.by_id(uuid.UUID(response.json()["id"]))
    assert photo is not None
    assert photo.state == "pending"
    assert photo.parade_id == "d6-1"
    assert photo.course_m == 1234.5
    assert await storage.read(photo.storage_path) == JPEG


async def test_upload_photo_fails(client: TestClient, photos: PhotosMemory) -> None:
    response = upload(client, PNG)

    # The file says "image/jpeg", its bytes say otherwise.
    assert response.status_code == 415
    assert response.json() == {"error": "Solo se aceptan fotos JPEG."}
    too_heavy = upload(client, JPEG + b"x" * (1024 * 1024 * 3 // 2))
    assert too_heavy.status_code == 413
    assert too_heavy.json() == {"error": "La foto pesa demasiado."}
    assert upload(client, b"").json() == {"error": "Falta la foto."}
    assert client.post("/api/photos", data={"device": issue_device()}).status_code == 400
    unknown = upload(client, device="made-up.signature")
    assert unknown.status_code == 401
    assert unknown.json() == {"error": "Dispositivo no reconocido."}
    assert photos.rows == {}


async def test_metres_off_the_course_are_dropped(client: TestClient, photos: PhotosMemory) -> None:
    for metres in ("99999", "-5", "here", ""):
        response = upload(client, metres=metres)

        assert response.status_code == 201
        photo = await photos.by_id(uuid.UUID(response.json()["id"]))
        assert photo is not None and photo.course_m is None
    # With no parade at all the photo is still taken.
    assert {photo.parade_id for photo in photos.rows.values()} == {None}


def test_ninth_photo_in_an_hour_is_429(client: TestClient) -> None:
    device = issue_device()
    # A file that is turned down does not use up one of the eight.
    assert upload(client, PNG, device=device).status_code == 415
    for _ in range(8):
        assert upload(client, device=device).status_code == 201

    response = upload(client, device=device)

    assert response.status_code == 429
    assert response.json() == {"error": "Ya subiste varias fotos. Probá más tarde."}
    # Another device is not affected.
    assert upload(client).status_code == 201


# --- what the public sees --------------------------------------------------


async def test_pending_photo_is_not_public(
    client: TestClient, photos: PhotosMemory, make_user: MakeUser
) -> None:
    photo_id = upload(client).json()["id"]
    moderator = await make_user("moderator")

    # Pending: not in the list, and the image does not exist for the public.
    assert client.get("/api/photos").json() == {"photos": []}
    hidden = client.get(f"/api/photos/{photo_id}")
    assert hidden.status_code == 404
    assert hidden.json() == {"error": "No existe esa foto."}
    # Nor for someone logged in whose job is another.
    assert (
        client.get(f"/api/photos/{photo_id}", headers=auth(await make_user("editor"))).status_code
        == 404
    )
    # Whoever moderates has to be able to see it.
    seen = client.get(f"/api/photos/{photo_id}", headers=auth(moderator))
    assert seen.status_code == 200
    assert seen.content == JPEG
    assert seen.headers["Cache-Control"] == "private, no-store"

    client.patch(f"{ADMIN}/{photo_id}", json={"state": "approved"}, headers=auth(moderator))

    public = client.get(f"/api/photos/{photo_id}")
    assert public.status_code == 200
    assert public.content == JPEG
    assert public.headers["content-type"] == "image/jpeg"
    assert public.headers["X-Content-Type-Options"] == "nosniff"
    assert public.headers["Cache-Control"] == "public, max-age=86400"
    listed = client.get("/api/photos")
    assert listed.headers["Cache-Control"] == "public, max-age=30, stale-while-revalidate=300"
    (only,) = listed.json()["photos"]
    assert set(only) == {"id", "paradeId", "metres", "state", "createdAt", "url"}
    assert (only["id"], only["state"], only["url"]) == (
        photo_id,
        "approved",
        f"/api/photos/{photo_id}",
    )

    # Rejected afterwards: it disappears again.
    client.patch(f"{ADMIN}/{photo_id}", json={"state": "rejected"}, headers=auth(moderator))
    assert client.get(f"/api/photos/{photo_id}").status_code == 404
    assert client.get("/api/photos").json() == {"photos": []}


def test_photo_that_does_not_exist_is_404(client: TestClient) -> None:
    assert client.get(f"/api/photos/{uuid.uuid4()}").status_code == 404
    assert client.get("/api/photos/not-a-uuid").status_code == 400


async def test_photo_whose_file_is_gone_is_404(
    client: TestClient, photos: PhotosMemory, storage: DiskStorage, make_user: MakeUser
) -> None:
    photo_id = upload(client).json()["id"]
    photo = await photos.by_id(uuid.UUID(photo_id))
    assert photo is not None
    await storage.delete(photo.storage_path)

    response = client.get(f"/api/photos/{photo_id}", headers=auth(await make_user("moderator")))

    assert response.status_code == 404


# --- moderation ------------------------------------------------------------


async def test_moderate_photo_ok(client: TestClient, make_user: MakeUser) -> None:
    headers = auth(await make_user("moderator"))
    first = upload(client).json()["id"]
    second = upload(client).json()["id"]
    third = upload(client).json()["id"]

    assert client.patch(f"{ADMIN}/{first}", json={"state": "approved"}, headers=headers).json() == {
        "ok": True
    }
    client.patch(f"{ADMIN}/{second}", json={"state": "rejected"}, headers=headers)

    response = client.get(ADMIN, headers=headers)
    assert response.headers["Cache-Control"] == "no-store"
    queue = [(photo["id"], photo["state"]) for photo in response.json()["photos"]]
    # The pending one first; then the rest, newest first.
    assert queue == [(third, "pending"), (second, "rejected"), (first, "approved")]
    # Back to pending is allowed too.
    client.patch(f"{ADMIN}/{first}", json={"state": "pending"}, headers=headers)
    assert client.get("/api/photos").json() == {"photos": []}


async def test_moderate_photo_fails(
    client: TestClient, photos: PhotosMemory, make_user: MakeUser
) -> None:
    photo_id = upload(client).json()["id"]
    reporter = await make_user("reporter", post="head")

    response = client.patch(
        f"{ADMIN}/{photo_id}", json={"state": "approved"}, headers=auth(reporter)
    )

    assert response.status_code == 403
    assert client.get(ADMIN, headers=auth(reporter)).status_code == 403
    assert client.delete(f"{ADMIN}/{photo_id}", headers=auth(reporter)).status_code == 403
    assert client.get(ADMIN).status_code == 401
    stored = await photos.by_id(uuid.UUID(photo_id))
    assert stored is not None and stored.state == "pending"
    moderator = auth(await make_user("moderator"))
    assert (
        client.patch(f"{ADMIN}/{photo_id}", json={"state": "nice"}, headers=moderator).status_code
        == 400
    )
    assert (
        client.patch(
            f"{ADMIN}/{uuid.uuid4()}", json={"state": "approved"}, headers=moderator
        ).status_code
        == 404
    )


async def test_delete_photo_deletes_the_file_too(
    client: TestClient, photos: PhotosMemory, storage: DiskStorage, make_user: MakeUser
) -> None:
    headers = auth(await make_user("moderator"))
    photo_id = upload(client).json()["id"]
    photo = await photos.by_id(uuid.UUID(photo_id))
    assert photo is not None

    assert client.delete(f"{ADMIN}/{photo_id}", headers=headers).status_code == 204

    assert photos.rows == {}
    assert await storage.read(photo.storage_path) is None
    assert client.delete(f"{ADMIN}/{photo_id}", headers=headers).status_code == 404
