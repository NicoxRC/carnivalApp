"""Limits per IP. They live in the memory of the process: one replica only.

If the service ever runs several replicas, these have to move to Postgres.
"""

import asyncio
import time
from collections.abc import Awaitable, Callable
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Request

from app.domain.constants import DEVICES_PER_IP_PER_HOUR


def ip_of(request: Request) -> str:
    """The caller's IP, for the limits.

    The header the platform sets is preferred (the client cannot forge it)
    and, from `X-Forwarded-For`, the LAST hop: the first one is written by
    whoever makes the request.
    """
    real = request.headers.get("x-real-ip")
    if real:
        return real.split(",")[0].strip()
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


class LoginRateLimit:
    """Brake on guessing passwords: each recent failure slows the next answer.

    It blocks no one. Blocking an IP left the real admin out when many people
    share the IP of a mobile carrier; with a wait, the worst an attacker gets
    is a login that takes 5 s.
    """

    WINDOW_S = 10 * 60
    PER_FAILURE_S = 0.5
    MAX_WAIT_S = 5.0
    PRUNE_ABOVE = 5000

    def __init__(
        self,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._clock = clock
        self._sleep = sleep
        # ip -> (failures, moment the count expires)
        self._failures: dict[str, tuple[int, float]] = {}

    def delay(self, ip: str) -> float:
        """Seconds the next attempt from that IP has to wait."""
        failures, until = self._failures.get(ip, (0, 0.0))
        if until < self._clock():
            return 0.0
        return min(failures * self.PER_FAILURE_S, self.MAX_WAIT_S)

    async def wait(self, ip: str) -> None:
        delay = self.delay(ip)
        if delay:
            await self._sleep(delay)

    def record(self, ip: str, ok: bool) -> None:
        if ok:
            self._failures.pop(ip, None)
            return
        now = self._clock()
        failures, until = self._failures.get(ip, (0, 0.0))
        self._failures[ip] = (failures + 1 if until > now else 1, now + self.WINDOW_S)
        # So the map does not grow forever if someone rotates IPs.
        if len(self._failures) > self.PRUNE_ABOVE:
            self._failures = {k: v for k, v in self._failures.items() if v[1] >= now}


@lru_cache
def get_login_rate_limit() -> LoginRateLimit:
    return LoginRateLimit()


LoginRateLimitDep = Annotated[LoginRateLimit, Depends(get_login_rate_limit)]


class DeviceIssueLimit:
    """Cap on how many device ids one IP may be issued per hour."""

    WINDOW_S = 60 * 60
    PRUNE_ABOVE = 5000

    def __init__(
        self, limit: int = DEVICES_PER_IP_PER_HOUR, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self._limit = limit
        self._clock = clock
        # ip -> (issued, moment the count expires)
        self._issued: dict[str, tuple[int, float]] = {}

    def allow(self, ip: str) -> bool:
        """Counts one more for that IP. False: it is over the cap."""
        now = self._clock()
        issued, until = self._issued.get(ip, (0, 0.0))
        if until > now:
            if issued >= self._limit:
                return False
            self._issued[ip] = (issued + 1, until)
        else:
            self._issued[ip] = (1, now + self.WINDOW_S)
        if len(self._issued) > self.PRUNE_ABOVE:
            self._issued = {k: v for k, v in self._issued.items() if v[1] >= now}
        return True


@lru_cache
def get_device_issue_limit() -> DeviceIssueLimit:
    return DeviceIssueLimit()


DeviceIssueLimitDep = Annotated[DeviceIssueLimit, Depends(get_device_issue_limit)]


class PhotoUploadLimit:
    """Cap on how many photos one device may upload per hour."""

    WINDOW_S = 60 * 60
    PRUNE_ABOVE = 5000

    # src/app/api/fotos/route.ts · FOTOS_POR_HORA
    def __init__(self, limit: int = 8, clock: Callable[[], float] = time.monotonic) -> None:
        self._limit = limit
        self._clock = clock
        # device -> (uploaded, moment the count expires)
        self._uploaded: dict[str, tuple[int, float]] = {}

    def allowed(self, device_id: str) -> bool:
        uploaded, until = self._uploaded.get(device_id, (0, 0.0))
        return until <= self._clock() or uploaded < self._limit

    def record(self, device_id: str) -> None:
        """Counts an upload that went through: a rejected file does not use one up."""
        now = self._clock()
        uploaded, until = self._uploaded.get(device_id, (0, 0.0))
        self._uploaded[device_id] = (
            (uploaded + 1, until) if until > now else (1, now + self.WINDOW_S)
        )
        if len(self._uploaded) > self.PRUNE_ABOVE:
            self._uploaded = {k: v for k, v in self._uploaded.items() if v[1] >= now}


@lru_cache
def get_photo_upload_limit() -> PhotoUploadLimit:
    return PhotoUploadLimit()


PhotoUploadLimitDep = Annotated[PhotoUploadLimit, Depends(get_photo_upload_limit)]
