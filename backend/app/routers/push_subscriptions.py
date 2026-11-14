""" "Tell me when the parade is close." No name, no account."""

from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.push import PushConfigDep
from app.repositories.courses import CourseDep
from app.repositories.parades import ParadeListDep, ParadesRepoDep, resolve_parade
from app.repositories.push_subscriptions import PushSubscription, PushSubscriptionsRepoDep
from app.schemas import Schema

router = APIRouter(prefix="/api/push-subscriptions", tags=["push"])

MAX_ENDPOINT = 1000
DEFAULT_THRESHOLD_MIN = 10
MIN_THRESHOLD_MIN = 5
MAX_THRESHOLD_MIN = 60


class PushStatus(Schema):
    # Can this server send notifications with the app closed?
    configured: bool
    # The VAPID public key the browser subscribes with.
    key: str | None


class SubscribeBody(Schema):
    """Checked by hand in the endpoint: any problem is the same 400."""

    # What the browser's `PushSubscription.toJSON()` gives.
    subscription: Any = None
    # Where the person waits, in metres along the course.
    metres: Any = None
    # With how many minutes to go they want to be told: 5 to 60, 10 by default.
    threshold_min: Any = None


class Subscribed(Schema):
    ok: bool = True
    threshold_min: int


class UnsubscribeBody(Schema):
    endpoint: Any = None


class Ok(Schema):
    ok: bool = True


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float | str):
        return None
    try:
        number = float(value)
    except ValueError:
        return None
    return number if number == number and abs(number) != float("inf") else None


@router.get("")
async def read_status(config: PushConfigDep) -> PushStatus:
    return PushStatus(configured=config is not None, key=config.public_key if config else None)


@router.post("")
async def subscribe(
    body: SubscribeBody,
    config: PushConfigDep,
    subscriptions: PushSubscriptionsRepoDep,
    parades: ParadesRepoDep,
    parade_list: ParadeListDep,
    course: CourseDep,
) -> Subscribed:
    """Stores where to send the notification and at which metre the person waits."""
    if config is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Los avisos no están configurados en este servidor.",
        )
    subscription: dict[str, Any] = body.subscription if isinstance(body.subscription, dict) else {}
    raw_keys = subscription.get("keys")
    keys: dict[str, Any] = raw_keys if isinstance(raw_keys, dict) else {}
    endpoint, p256dh, auth = subscription.get("endpoint"), keys.get("p256dh"), keys.get("auth")
    metres = _number(body.metres)
    if (
        not isinstance(endpoint, str)
        or not endpoint.startswith("https://")
        or len(endpoint) > MAX_ENDPOINT
        or not isinstance(p256dh, str)
        or not isinstance(auth, str)
        or not p256dh
        or not auth
        or metres is None
        or not 0 <= metres <= course.length_metres
    ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Suscripción inválida.")
    asked = _number(body.threshold_min) or DEFAULT_THRESHOLD_MIN
    threshold_min = min(max(int(asked + 0.5), MIN_THRESHOLD_MIN), MAX_THRESHOLD_MIN)

    parade = await resolve_parade(parades, parade_list)
    if parade is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No hay desfile.")
    await subscriptions.save(
        PushSubscription(
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
            parade_id=parade.id,
            course_m=metres,
            threshold_min=threshold_min,
        )
    )
    return Subscribed(threshold_min=threshold_min)


@router.delete("")
async def unsubscribe(body: UnsubscribeBody, subscriptions: PushSubscriptionsRepoDep) -> Ok:
    if not isinstance(body.endpoint, str):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Falta el endpoint.")
    await subscriptions.delete(body.endpoint)
    return Ok()
