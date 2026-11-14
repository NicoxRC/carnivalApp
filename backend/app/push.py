""" "The parade is getting close" notifications.

The person marks where they wait, asks to be told and puts the phone away.
Every time a position of the head arrives it is checked who has little time
left, they are sent the notification and their subscription is deleted: one
notification per request.

It needs VAPID keys (`npm run push:llaves`). Without them the feature turns
itself off and the app uses its local alert, which only sounds while open.
"""

import asyncio
import json
import logging
import math
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import lru_cache
from typing import Annotated, Protocol

from fastapi import Depends

# pywebpush ships no type information.
from pywebpush import WebPushException, webpush  # type: ignore[import-untyped]

from app.config import get_settings
from app.db import get_session_factory
from app.domain.eta import estimate_speed
from app.domain.parades import Parade
from app.repositories.parades import ParadesPostgres
from app.repositories.push_subscriptions import (
    PushSubscription,
    PushSubscriptionsPostgres,
    PushSubscriptionsRepo,
)
from app.repositories.state import LiveState, StatePostgres

log = logging.getLogger(__name__)

DEFAULT_CONTACT = "mailto:soporte@example.com"
# How long the push service keeps a notification the phone cannot take yet.
# After 10 minutes "it is getting close" is no longer true.
TTL_S = 600


@dataclass(frozen=True, slots=True)
class PushConfig:
    public_key: str
    private_key: str
    contact: str


@lru_cache
def get_push_config() -> PushConfig | None:
    """The VAPID keys, or `None` when this server cannot send notifications."""
    settings = get_settings()
    if not settings.vapid_public_key or not settings.vapid_private_key:
        return None
    return PushConfig(
        public_key=settings.vapid_public_key,
        private_key=settings.vapid_private_key.get_secret_value(),
        contact=settings.vapid_contact or DEFAULT_CONTACT,
    )


PushConfigDep = Annotated[PushConfig | None, Depends(get_push_config)]


@dataclass(frozen=True, slots=True)
class Notification:
    title: str
    body: str
    url: str = "/"


class PushSender(Protocol):
    async def send(self, subscription: PushSubscription, notification: Notification) -> None:
        """Hands the notification to the browser's push service. May raise."""
        ...


class WebPushSender:
    def __init__(self, config: PushConfig) -> None:
        self._config = config

    async def send(self, subscription: PushSubscription, notification: Notification) -> None:
        def send() -> None:
            webpush(
                subscription_info={
                    "endpoint": subscription.endpoint,
                    "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
                },
                data=json.dumps(
                    {
                        "title": notification.title,
                        "body": notification.body,
                        "url": notification.url,
                    }
                ),
                vapid_private_key=self._config.private_key,
                vapid_claims={"sub": self._config.contact},
                ttl=TTL_S,
                headers={"Urgency": "high"},
                timeout=10,
            )

        # pywebpush blocks on the network: off the event loop.
        await asyncio.to_thread(send)


def notification_for(parade: Parade, minutes: float) -> Notification:
    if minutes < 3:
        body = "Ya casi llega a donde estás. ¡Alistá la cámara!"
    else:
        # To the nearest 5, so it reads as an estimate and not as a stopwatch.
        rounded = max(5, math.floor(minutes / 5 + 0.5) * 5)
        body = f"Le faltan unos {rounded} min para llegar a donde estás."
    return Notification(title=f"{parade.name}: ya viene", body=body)


class NearbyNotifier:
    """Checks who has little time left and tells them. It never raises."""

    # So thousands of subscriptions are not gone through with every point: at
    # most once every 15 s per parade.
    EVERY_S = 15.0

    def __init__(self, sender: PushSender, clock: Callable[[], float] = time.monotonic) -> None:
        self._sender = sender
        self._clock = clock
        self._last_check: dict[str, float] = {}

    def due(self, parade_id: str) -> bool:
        """Whether it is time to check that parade. Saying yes starts the wait."""
        now = self._clock()
        last = self._last_check.get(parade_id)
        if last is not None and now - last < self.EVERY_S:
            return False
        self._last_check[parade_id] = now
        return True

    async def notify(
        self,
        parade: Parade,
        live: LiveState,
        subscriptions: PushSubscriptionsRepo,
        now: datetime | None = None,
    ) -> int:
        """Sends what is due. Returns how many notifications went out."""
        try:
            head = live.positions.get("head")
            if head is None:
                return 0
            speed = estimate_speed(live.head_history, now or datetime.now(UTC))
            if speed.stopped:
                # Stopped is not "about to arrive": they are told once it moves.
                return 0

            sent = 0
            for subscription in await subscriptions.list(parade.id):
                remaining_m = subscription.course_m - head.course_m
                minutes = remaining_m / speed.ms / 60
                if remaining_m > 0 and minutes > subscription.threshold_min:
                    continue  # Not yet.
                # It is their turn (or it already went past them): either way
                # the subscription is used up.
                await subscriptions.delete(subscription.endpoint)
                if remaining_m <= 0:
                    continue
                try:
                    await self._sender.send(subscription, notification_for(parade, minutes))
                    sent += 1
                except WebPushException:
                    # Expired subscription or push service down: it was
                    # already deleted, there is no retry.
                    pass
                except Exception:
                    log.exception("A notification could not be sent")
            return sent
        except Exception:
            log.exception("The nearby notifications could not be checked")
            return 0


@lru_cache
def get_notifier() -> NearbyNotifier | None:
    config = get_push_config()
    return NearbyNotifier(WebPushSender(config)) if config else None


# What `POST /api/positions` schedules after storing a position of the head.
NotifyNearby = Callable[[str], Awaitable[None]]


async def notify_nearby(parade_id: str) -> None:
    """Runs in the background, with a session of its own: the request's is gone.

    A failure sending notifications cannot bring ingestion down: it never raises.
    """
    notifier = get_notifier()
    if notifier is None or not notifier.due(parade_id):
        return
    try:
        async with get_session_factory()() as session:
            parade = await ParadesPostgres(session).by_id(parade_id)
            if parade is None:
                return
            live = await StatePostgres(session).read_state(parade)
            await notifier.notify(parade, live, PushSubscriptionsPostgres(session))
    except Exception:
        log.exception("The nearby notifications could not be checked")


def get_notify_nearby() -> NotifyNearby:
    return notify_nearby


NotifyNearbyDep = Annotated[NotifyNearby, Depends(get_notify_nearby)]
