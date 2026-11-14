"""Crowd along the course, always of the current parade."""

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request, Response, status

from app.devices import issue_device, valid_device
from app.domain.density import CrowdLevel, classify, total_bins
from app.rate_limits import DeviceIssueLimitDep, ip_of
from app.repositories.courses import CourseDep
from app.repositories.parades import ParadeListDep, ParadesRepoDep, resolve_parade
from app.repositories.presences import PresencesRepoDep
from app.schemas import Schema, to_ms

router = APIRouter(prefix="/api", tags=["density"])

NO_PARADE = HTTPException(status.HTTP_404_NOT_FOUND, "No hay desfile.")


class DeviceOut(Schema):
    device: str


class DensityBinOut(Schema):
    """Web: `BinDensidad`."""

    bin: int
    from_m: float
    to_m: float
    count: int
    level: CrowdLevel


class DensityOut(Schema):
    """Web: `Densidad`."""

    # Only the stretches with enough samples.
    bins: list[DensityBinOut]
    total: int
    # False: there is no sample to say anything.
    enough: bool
    window_min: int
    server_ts: int


class PresenceBody(Schema):
    device: str = ""
    bin: int


class Ok(Schema):
    ok: bool = True


@router.post("/device")
async def create_device(request: Request, limit: DeviceIssueLimitDep) -> DeviceOut:
    """Issues a signed device id.

    It is anonymous: it says nothing about the person, only that this server
    handed it out. The crowd map and the photo upload use it so devices cannot
    be made up by the thousand.
    """
    if not limit.allow(ip_of(request)):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "Demasiados dispositivos desde esta red."
        )
    return DeviceOut(device=issue_device())


@router.get("/density")
async def read_density(
    parades: ParadesRepoDep,
    parade_list: ParadeListDep,
    presences: PresencesRepoDep,
    course: CourseDep,
    response: Response,
) -> DensityOut:
    """The aggregate per stretch.

    It is the only thing that leaves here: never the raw rows, so the answer
    does not let anyone work out where a given device has been.
    """
    parade = await resolve_parade(parades, parade_list)
    if parade is None:
        raise NO_PARADE
    counts, total = await presences.counts(parade.id)
    density = classify(counts, total, course.length_metres)
    response.headers["Cache-Control"] = "no-store"
    return DensityOut(
        bins=[
            DensityBinOut(bin=b.bin, from_m=b.from_m, to_m=b.to_m, count=b.count, level=b.level)
            for b in density.bins
        ],
        total=density.total,
        enough=density.enough,
        window_min=density.window_min,
        server_ts=to_ms(datetime.now(UTC)),
    )


@router.post("/density")
async def report_presence(
    body: PresenceBody,
    parades: ParadesRepoDep,
    parade_list: ParadeListDep,
    presences: PresencesRepoDep,
    course: CourseDep,
) -> Ok:
    """A phone says which STRETCH it is on. It does not send lat/lng."""
    device_id = valid_device(body.device)
    if device_id is None:
        # 401 and not 400: the client takes it as "ask for a new id".
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Dispositivo no reconocido.")
    if not 0 <= body.bin < total_bins(course.length_metres):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "bin fuera de la senda.")
    parade = await resolve_parade(parades, parade_list)
    if parade is None:
        raise NO_PARADE
    await presences.record(parade.id, device_id, body.bin)
    return Ok()
