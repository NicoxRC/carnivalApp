"""Who asked to be told when the parade gets close."""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Annotated, Protocol

from fastapi import Depends
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionDep
from app.models import PushSubscription as SubscriptionRow


@dataclass(frozen=True, slots=True)
class PushSubscription:
    endpoint: str
    p256dh: str
    auth: str
    parade_id: str
    course_m: float
    threshold_min: int


class PushSubscriptionsRepo(Protocol):
    async def save(self, subscription: PushSubscription) -> None:
        """One per device: asking again replaces the previous request."""
        ...

    async def list(self, parade_id: str) -> Sequence[PushSubscription]: ...

    async def delete(self, endpoint: str) -> None:
        """Deleting one that is not there is not an error."""
        ...


class PushSubscriptionsPostgres:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def save(self, subscription: PushSubscription) -> None:
        values = {
            "p256dh": subscription.p256dh,
            "auth": subscription.auth,
            "parade_id": subscription.parade_id,
            "course_m": subscription.course_m,
            "threshold_min": subscription.threshold_min,
        }
        await self._session.execute(
            insert(SubscriptionRow)
            .values(endpoint=subscription.endpoint, **values)
            .on_conflict_do_update(index_elements=[SubscriptionRow.endpoint], set_=values)
        )
        await self._session.commit()

    async def list(self, parade_id: str) -> Sequence[PushSubscription]:
        rows = await self._session.scalars(
            select(SubscriptionRow).where(SubscriptionRow.parade_id == parade_id)
        )
        return [
            PushSubscription(
                endpoint=row.endpoint,
                p256dh=row.p256dh,
                auth=row.auth,
                parade_id=row.parade_id,
                course_m=row.course_m,
                threshold_min=row.threshold_min,
            )
            for row in rows
        ]

    async def delete(self, endpoint: str) -> None:
        await self._session.execute(
            delete(SubscriptionRow).where(SubscriptionRow.endpoint == endpoint)
        )
        await self._session.commit()


class PushSubscriptionsMemory:
    def __init__(self) -> None:
        self.rows: dict[str, PushSubscription] = {}

    async def save(self, subscription: PushSubscription) -> None:
        self.rows[subscription.endpoint] = subscription

    async def list(self, parade_id: str) -> Sequence[PushSubscription]:
        return [s for s in self.rows.values() if s.parade_id == parade_id]

    async def delete(self, endpoint: str) -> None:
        self.rows.pop(endpoint, None)


def get_push_subscriptions_repo(session: SessionDep) -> PushSubscriptionsRepo:
    return PushSubscriptionsPostgres(session)


PushSubscriptionsRepoDep = Annotated[PushSubscriptionsRepo, Depends(get_push_subscriptions_repo)]
