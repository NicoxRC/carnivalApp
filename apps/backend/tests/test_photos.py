import uuid
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

import boto3
import pytest
from botocore.config import Config
from fastapi.testclient import TestClient

from app.devices import issue_device
from app.main import app
from app.repositories.parades import ParadesMemory
from app.repositories.photos import PhotosMemory
from app.storage import DiskStorage, S3Storage, get_storage
from app.uploads import UploadGrant, issue_upload, read_upload
from tests.conftest import MakeUser, auth

JPEG = b"\xff\xd8\xff\xe0" + b"a small photo" * 10
PNG = b"\x89PNG\r\n\x1a\n" + b"not a jpeg" * 10
ADMIN = "/api/admin/photos"


def start(client: TestClient, size: int, device: str | None = None) -> Any:
    return client.post(
        "/api/photos/uploads",
        json={"device": device if device is not None else issue_device(), "size": size},
    )


def upload(
    client: TestClient,
    data: bytes = JPEG,
    device: str | None = None,
    metres: object = None,
    size: int | None = None,
) -> Any:
    """The three steps the phone takes: ask, PUT the file, say it is done."""
    started = start(client, len(data) if size is None else size, device)
    if started.status_code != 201:
        return started
    grant = started.json()
    put = client.put(grant["uploadUrl"], content=data, headers={"Content-Type": "image/jpeg"})
    if put.status_code != 200:
        return put
    return client.post(
        f"/api/photos/uploads/{grant['id']}/done", json={"token": grant["token"], "metres": metres}
    )


# --- storage ---------------------------------------------------------------


async def test_disk_storage_ok(tmp_path: Path) -> None:
    storage = DiskStorage(tmp_path)

    await storage.save("incoming/a.jpg", JPEG)

    assert await storage.size("incoming/a.jpg") == len(JPEG)
    assert await storage.read_start("incoming/a.jpg", 3) == JPEG[:3]
    await storage.move("incoming/a.jpg", "photos/a.jpg")
    assert await storage.read("incoming/a.jpg") is None
    assert (tmp_path / "photos" / "a.jpg").read_bytes() == JPEG
    # Without a bucket there is nothing to sign: the API carries the files.
    assert storage.upload_url("incoming/b.jpg", 10, 60) is None
    assert storage.download_url("photos/a.jpg", 60) is None
    await storage.delete("photos/a.jpg")
    assert await storage.read("photos/a.jpg") is None
    # Deleting what is not there is not an error.
    await storage.delete("photos/a.jpg")


async def test_disk_storage_fails(tmp_path: Path) -> None:
    storage = DiskStorage(tmp_path)

    assert await storage.read("photos/missing.jpg") is None
    assert await storage.size("photos/missing.jpg") is None
    assert await storage.read_start("photos/missing.jpg", 3) is None
    # A path never gets out of the folder.
    for save_or_read in (storage.read("../outside.jpg"), storage.save("/etc/outside.jpg", JPEG)):
        try:
            await save_or_read
        except ValueError:
            continue
        raise AssertionError("a path left the storage")


class FakeS3:
    """Stands in for the boto3 client: a dictionary with the calls used."""

    class exceptions:  # noqa: N801
        class NoSuchKey(Exception):
            pass

        class ClientError(Exception):
            def __init__(self, code: str) -> None:
                self.response = {"Error": {"Code": code}}

    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], dict[str, Any]] = {}

    def put_object(self, *, Bucket: str, Key: str, Body: bytes, ContentType: str) -> None:  # noqa: N803
        self.objects[(Bucket, Key)] = {"Body": Body, "ContentType": ContentType}

    def get_object(self, *, Bucket: str, Key: str, Range: str | None = None) -> dict[str, Any]:  # noqa: N803
        if (Bucket, Key) not in self.objects:
            raise self.exceptions.NoSuchKey()
        body = self.objects[(Bucket, Key)]["Body"]
        if Range is not None:
            body = body[: int(Range.rsplit("-", 1)[1]) + 1]
        return {"Body": type("Stream", (), {"read": lambda self: body})()}

    def head_object(self, *, Bucket: str, Key: str) -> dict[str, Any]:  # noqa: N803
        if (Bucket, Key) not in self.objects:
            raise self.exceptions.ClientError("404")
        return {"ContentLength": len(self.objects[(Bucket, Key)]["Body"])}

    def copy_object(self, *, Bucket: str, Key: str, CopySource: dict[str, str], **_: Any) -> None:  # noqa: N803
        self.objects[(Bucket, Key)] = dict(self.objects[(CopySource["Bucket"], CopySource["Key"])])

    def delete_object(self, *, Bucket: str, Key: str) -> None:  # noqa: N803
        self.objects.pop((Bucket, Key), None)


async def test_s3_storage_ok() -> None:
    fake = FakeS3()
    storage = S3Storage(fake, "the-bucket")  # type: ignore[arg-type]

    await storage.save("incoming/a.jpg", JPEG)

    assert fake.objects[("the-bucket", "incoming/a.jpg")]["ContentType"] == "image/jpeg"
    assert await storage.size("incoming/a.jpg") == len(JPEG)
    assert await storage.read_start("incoming/a.jpg", 3) == JPEG[:3]
    await storage.move("incoming/a.jpg", "photos/a.jpg")
    assert set(fake.objects) == {("the-bucket", "photos/a.jpg")}
    assert await storage.read("photos/a.jpg") == JPEG
    assert await storage.read("photos/missing.jpg") is None
    assert await storage.size("photos/missing.jpg") is None
    await storage.delete("photos/a.jpg")
    assert fake.objects == {}


def test_s3_signed_urls_ok() -> None:
    # A real client with made-up keys: signing is local, nothing is sent.
    client = boto3.client(
        "s3",
        endpoint_url="https://account.r2.cloudflarestorage.com",
        region_name="auto",
        aws_access_key_id="key",
        aws_secret_access_key="secret",
        config=Config(signature_version="s3v4"),
    )
    storage = S3Storage(client, "photos-bucket")

    put = urlsplit(storage.upload_url("incoming/a.jpg", 1234, 300) or "")
    get = urlsplit(storage.download_url("photos/a.jpg", 3600) or "")

    assert put.path == "/photos-bucket/incoming/a.jpg"
    query = parse_qs(put.query)
    assert query["X-Amz-Expires"] == ["300"]
    # The type and the size are signed: the URL takes nothing else.
    signed_headers = query["X-Amz-SignedHeaders"][0].split(";")
    assert {"content-type", "content-length"} <= set(signed_headers)
    assert get.path == "/photos-bucket/photos/a.jpg"
    assert parse_qs(get.query)["X-Amz-Expires"] == ["3600"]


# --- the upload token ------------------------------------------------------


def test_upload_token_ok() -> None:
    photo_id = uuid.uuid4()
    grant = UploadGrant(photo_id, "device-1", 1234, 2_000_000_000)

    assert read_upload(issue_upload(grant), photo_id, now=1_900_000_000) == grant


def test_upload_token_fails() -> None:
    photo_id = uuid.uuid4()
    token = issue_upload(UploadGrant(photo_id, "device-1", 1234, 2_000_000_000))

    assert read_upload(token, photo_id, now=2_000_000_001) is None
    assert read_upload(token, uuid.uuid4(), now=1) is None
    assert read_upload(token.replace("1234", "9999"), photo_id, now=1) is None
    for bad in ("", "a.b.c", "x" * 500, None, 7):
        assert read_upload(bad, photo_id, now=1) is None


# --- upload ----------------------------------------------------------------


async def test_upload_photo_ok(
    client: TestClient, parades: ParadesMemory, photos: PhotosMemory, storage: DiskStorage
) -> None:
    await parades.save(
        id="d6-1", name="Desfile Magno", date="2999-01-06", start_time="10:00", course_id="c"
    )

    started = start(client, len(JPEG))
    grant = started.json()
    assert started.status_code == 201
    assert set(grant) == {"id", "uploadUrl", "contentType", "token", "expiresAt"}
    assert grant["contentType"] == "image/jpeg"
    # Without a bucket the phone PUTs to the API itself.
    assert grant["uploadUrl"].startswith(f"/api/photos/uploads/{grant['id']}?token=")
    # Nothing exists until the upload is finished.
    assert photos.rows == {}

    response = upload(client, metres=1234.5)

    assert response.status_code == 201
    assert response.json()["ok"] is True
    photo = await photos.by_id(uuid.UUID(response.json()["id"]))
    assert photo is not None
    assert photo.state == "pending"
    assert photo.parade_id == "d6-1"
    assert photo.course_m == 1234.5
    assert await storage.read(photo.storage_path) == JPEG
    assert await storage.read(f"incoming/{photo.id}.jpg") is None


async def test_upload_photo_fails(
    client: TestClient, photos: PhotosMemory, storage: DiskStorage
) -> None:
    # The phone says it is a JPEG; its bytes say otherwise. The file is deleted.
    png = start(client, len(PNG)).json()
    client.put(png["uploadUrl"], content=PNG)
    response = client.post(f"/api/photos/uploads/{png['id']}/done", json={"token": png["token"]})
    assert response.status_code == 415
    assert response.json() == {"error": "Solo se aceptan fotos JPEG."}
    assert await storage.read(f"incoming/{png['id']}.jpg") is None

    too_heavy = start(client, 1024 * 1024 * 2)
    assert too_heavy.status_code == 413
    assert too_heavy.json() == {"error": "La foto pesa demasiado."}
    # More bytes than allowed: cut off while arriving.
    assert upload(client, JPEG + b"x", size=len(JPEG)).status_code == 413
    # Fewer bytes than allowed.
    short = upload(client, JPEG[:-1], size=len(JPEG))
    assert short.status_code == 409
    assert short.json() == {"error": "La foto no llegó completa. Probá otra vez."}
    for size in (0, -1, "12", None, True):
        assert start(client, size).json() == {"error": "Falta la foto."}  # type: ignore[arg-type]
    unknown = start(client, 10, device="made-up.signature")
    assert unknown.status_code == 401
    assert unknown.json() == {"error": "Dispositivo no reconocido."}
    assert photos.rows == {}


async def test_finish_upload_fails(client: TestClient, photos: PhotosMemory) -> None:
    grant = start(client, len(JPEG)).json()
    done = f"/api/photos/uploads/{grant['id']}/done"

    # Done before the file arrived.
    never = client.post(done, json={"token": grant["token"]})
    assert never.status_code == 409
    assert never.json() == {"error": "La foto no llegó. Probá otra vez."}
    # A token for another photo, or made up.
    other = start(client, len(JPEG)).json()
    for token in (other["token"], "made-up", ""):
        forbidden = client.post(done, json={"token": token})
        assert forbidden.status_code == 403
        assert forbidden.json() == {
            "error": "Ese permiso para subir no vale o ya venció. Probá otra vez."
        }
        assert (
            client.put(f"/api/photos/uploads/{grant['id']}?token={token}", content=JPEG).status_code
            == 403
        )
    assert photos.rows == {}
    # Finishing twice does not make two photos.
    client.put(grant["uploadUrl"], content=JPEG)
    assert client.post(done, json={"token": grant["token"]}).status_code == 201
    assert client.post(done, json={"token": grant["token"]}).status_code == 201
    assert len(photos.rows) == 1


async def test_metres_off_the_course_are_dropped(client: TestClient, photos: PhotosMemory) -> None:
    for metres in (99999, -5, "here", "", None, [1]):
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

    response = start(client, len(JPEG), device=device)

    assert response.status_code == 429
    assert response.json() == {"error": "Ya subiste varias fotos. Probá más tarde."}
    # Another device is not affected.
    assert upload(client).status_code == 201


def test_api_does_not_receive_files_when_there_is_a_bucket(
    client: TestClient, storage: DiskStorage, monkeypatch: pytest.MonkeyPatch
) -> None:
    grant = start(client, len(JPEG)).json()
    monkeypatch.setattr(storage, "signs_urls", True)

    assert client.put(grant["uploadUrl"], content=JPEG).status_code == 404


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


class SigningFakeS3(FakeS3):
    def generate_presigned_url(self, method: str, Params: dict[str, Any], ExpiresIn: int) -> str:  # noqa: N803
        return f"https://bucket.example/{Params['Key']}?method={method}&expires={ExpiresIn}"


async def test_with_a_bucket_the_phone_talks_to_it(
    client: TestClient, photos: PhotosMemory, make_user: MakeUser
) -> None:
    fake = SigningFakeS3()
    app.dependency_overrides[get_storage] = lambda: S3Storage(fake, "b")  # type: ignore[arg-type]
    moderator = auth(await make_user("moderator"))

    grant = start(client, len(JPEG)).json()
    assert (
        grant["uploadUrl"]
        == f"https://bucket.example/incoming/{grant['id']}.jpg?method=put_object&expires=300"
    )
    # The phone PUTs straight to the bucket.
    fake.put_object(
        Bucket="b", Key=f"incoming/{grant['id']}.jpg", Body=JPEG, ContentType="image/jpeg"
    )
    done = client.post(f"/api/photos/uploads/{grant['id']}/done", json={"token": grant["token"]})
    assert done.status_code == 201
    assert set(fake.objects) == {("b", f"photos/{grant['id']}.jpg")}

    # Pending: no URL for the public, a signed one for whoever moderates.
    assert client.get("/api/photos").json() == {"photos": []}
    assert client.get(f"/api/photos/{grant['id']}", follow_redirects=False).status_code == 404
    (queued,) = client.get(ADMIN, headers=moderator).json()["photos"]
    assert queued["url"].startswith(
        f"https://bucket.example/photos/{grant['id']}.jpg?method=get_object"
    )

    client.patch(f"{ADMIN}/{grant['id']}", json={"state": "approved"}, headers=moderator)

    (public,) = client.get("/api/photos").json()["photos"]
    assert (
        public["url"]
        == f"https://bucket.example/photos/{grant['id']}.jpg?method=get_object&expires=3600"
    )
    redirect = client.get(f"/api/photos/{grant['id']}", follow_redirects=False)
    assert redirect.status_code == 307
    assert redirect.headers["location"] == public["url"]
