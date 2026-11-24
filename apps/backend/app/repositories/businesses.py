"""Businesses repository, with the counters of how much each one is used."""

import datetime as dt
from collections.abc import Sequence
from dataclasses import asdict
from typing import Annotated, Protocol, cast

from fastapi import Depends
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionDep
from app.domain.businesses import Business, MenuItem, MetricType, OfferTiming, Plan
from app.domain.dates import today_in_pasto
from app.models import Business as BusinessRow
from app.models import BusinessMetric as MetricRow

# business id -> type -> how many times, over every day.
Metrics = dict[str, dict[str, int]]


class BusinessNotFound(Exception):
    """No business has that id."""


class BusinessesRepo(Protocol):
    async def list(self) -> Sequence[Business]:
        """Every business, hidden ones included, by name."""
        ...

    async def save(self, business: Business) -> None:
        """Creates it or replaces the one with the same id."""
        ...

    async def delete(self, business_id: str) -> None:
        """Raises `BusinessNotFound`. Its counters go with it."""
        ...

    async def add_metric(self, business_id: str, type: MetricType) -> None:
        """One more for today's counter. A business that does not exist is ignored."""
        ...

    async def metrics(self) -> Metrics: ...


class BusinessesPostgres:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list(self) -> Sequence[Business]:
        rows = await self._session.scalars(
            select(BusinessRow).order_by(BusinessRow.name, BusinessRow.id)
        )
        return [
            Business(
                id=row.id,
                name=row.name,
                category=row.category,
                description=row.description,
                address=row.address,
                hours=row.hours,
                lat=row.lat,
                lng=row.lng,
                plan=cast(Plan | None, row.plan),
                offer=row.offer,
                offer_timing=cast(OfferTiming, row.offer_timing),
                menu=[
                    MenuItem(name=item["name"], price=item.get("price", "")) for item in row.menu
                ],
                whatsapp=row.whatsapp,
                link=row.link,
                visible=row.visible,
            )
            for row in rows
        ]

    async def save(self, business: Business) -> None:
        values = asdict(business)
        del values["id"]
        values["updated_at"] = func.now()
        await self._session.execute(
            insert(BusinessRow)
            .values(id=business.id, **values)
            .on_conflict_do_update(index_elements=[BusinessRow.id], set_=values)
        )
        await self._session.commit()

    async def delete(self, business_id: str) -> None:
        deleted = await self._session.scalar(
            delete(BusinessRow).where(BusinessRow.id == business_id).returning(BusinessRow.id)
        )
        await self._session.commit()
        if deleted is None:
            raise BusinessNotFound(business_id)

    async def add_metric(self, business_id: str, type: MetricType) -> None:
        exists = await self._session.scalar(
            select(BusinessRow.id).where(BusinessRow.id == business_id)
        )
        if exists is None:
            return
        await self._session.execute(
            insert(MetricRow)
            .values(
                business_id=business_id,
                day=dt.date.fromisoformat(today_in_pasto()),
                type=type,
                count=1,
            )
            .on_conflict_do_update(
                index_elements=[MetricRow.business_id, MetricRow.day, MetricRow.type],
                set_={"count": MetricRow.count + 1},
            )
        )
        await self._session.commit()

    async def metrics(self) -> Metrics:
        rows = await self._session.execute(
            select(MetricRow.business_id, MetricRow.type, func.sum(MetricRow.count)).group_by(
                MetricRow.business_id, MetricRow.type
            )
        )
        result: Metrics = {}
        for business_id, type, total in rows:
            result.setdefault(business_id, {})[type] = int(total)
        return result


class BusinessesMemory:
    def __init__(self) -> None:
        self.rows: dict[str, Business] = {}
        self.counters: Metrics = {}

    async def list(self) -> Sequence[Business]:
        return sorted(self.rows.values(), key=lambda b: (b.name, b.id))

    async def save(self, business: Business) -> None:
        self.rows[business.id] = business

    async def delete(self, business_id: str) -> None:
        if self.rows.pop(business_id, None) is None:
            raise BusinessNotFound(business_id)
        self.counters.pop(business_id, None)

    async def add_metric(self, business_id: str, type: MetricType) -> None:
        if business_id not in self.rows:
            return
        counters = self.counters.setdefault(business_id, {})
        counters[type] = counters.get(type, 0) + 1

    async def metrics(self) -> Metrics:
        return {business_id: dict(counters) for business_id, counters in self.counters.items()}


def get_businesses_repo(session: SessionDep) -> BusinessesRepo:
    return BusinessesPostgres(session)


BusinessesRepoDep = Annotated[BusinessesRepo, Depends(get_businesses_repo)]
