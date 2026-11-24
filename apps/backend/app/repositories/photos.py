"""Photos repository: the rows. The files are in `app/storage.py`."""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from typing import Annotated, Literal, Protocol, cast

from fastapi import Depends
from sqlalchemy import case, delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionDep
from app.models import Photo as PhotoRow

PhotoState = Literal["pending", "approved", "rejected"]


class PhotoNotFound(Exception):
    """No photo has that id."""


@dataclass(frozen=True, slots=True)
class Photo:
    id: uuid.UUID
    parade_id: str | None
    storage_path: str
    course_m: float | None
    state: PhotoState
    created_at: datetime


class PhotosRepo(Protocol):
    async def create(
        self, *, id: uuid.UUID, parade_id: str | None, storage_path: str, course_m: float | None
    ) -> Photo:
        """Always as `pending`."""
        ...

    async def by_id(self, photo_id: uuid.UUID) -> Photo | None: ...

    async def list(self, state: PhotoState | None = None) -> Sequence[Photo]:
        """With a state, those, newest first. Without, all: pending first."""
        ...

    async def set_state(self, photo_id: uuid.UUID, state: PhotoState) -> Photo:
        """Raises `PhotoNotFound`."""
        ...

    async def delete(self, photo_id: uuid.UUID) -> Photo:
        """Returns what was deleted, so its file can go too. Raises `PhotoNotFound`."""
        ...


def _photo(row: PhotoRow) -> Photo:
    return Photo(
        id=row.id,
        parade_id=row.parade_id,
        storage_path=row.storage_path,
        course_m=row.course_m,
        state=cast(PhotoState, row.state),
        created_at=row.created_at,
    )


class PhotosPostgres:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self, *, id: uuid.UUID, parade_id: str | None, storage_path: str, course_m: float | None
    ) -> Photo:
        row = PhotoRow(id=id, parade_id=parade_id, storage_path=storage_path, course_m=course_m)
        self._session.add(row)
        await self._session.commit()
        await self._session.refresh(row)
        return _photo(row)

    async def by_id(self, photo_id: uuid.UUID) -> Photo | None:
        row = await self._session.scalar(select(PhotoRow).where(PhotoRow.id == photo_id))
        return _photo(row) if row else None

    async def list(self, state: PhotoState | None = None) -> Sequence[Photo]:
        query = select(PhotoRow)
        if state is not None:
            query = query.where(PhotoRow.state == state).order_by(PhotoRow.created_at.desc())
        else:
            pending_first = case((PhotoRow.state == "pending", 0), else_=1)
            query = query.order_by(pending_first, PhotoRow.created_at.desc())
        return [_photo(row) for row in await self._session.scalars(query)]

    async def set_state(self, photo_id: uuid.UUID, state: PhotoState) -> Photo:
        row = await self._session.scalar(
            update(PhotoRow).where(PhotoRow.id == photo_id).values(state=state).returning(PhotoRow),
            execution_options={"populate_existing": True},
        )
        await self._session.commit()
        if row is None:
            raise PhotoNotFound(photo_id)
        return _photo(row)

    async def delete(self, photo_id: uuid.UUID) -> Photo:
        row = await self._session.scalar(
            delete(PhotoRow).where(PhotoRow.id == photo_id).returning(PhotoRow)
        )
        photo = _photo(row) if row else None
        await self._session.commit()
        if photo is None:
            raise PhotoNotFound(photo_id)
        return photo


class PhotosMemory:
    def __init__(self) -> None:
        self.rows: dict[uuid.UUID, Photo] = {}

    async def create(
        self, *, id: uuid.UUID, parade_id: str | None, storage_path: str, course_m: float | None
    ) -> Photo:
        self.rows[id] = Photo(
            id=id,
            parade_id=parade_id,
            storage_path=storage_path,
            course_m=course_m,
            state="pending",
            created_at=datetime.now(UTC),
        )
        return self.rows[id]

    async def by_id(self, photo_id: uuid.UUID) -> Photo | None:
        return self.rows.get(photo_id)

    async def list(self, state: PhotoState | None = None) -> Sequence[Photo]:
        newest_first = sorted(self.rows.values(), key=lambda p: p.created_at, reverse=True)
        if state is not None:
            return [photo for photo in newest_first if photo.state == state]
        return sorted(newest_first, key=lambda p: p.state != "pending")

    async def set_state(self, photo_id: uuid.UUID, state: PhotoState) -> Photo:
        photo = self.rows.get(photo_id)
        if photo is None:
            raise PhotoNotFound(photo_id)
        self.rows[photo_id] = replace(photo, state=state)
        return self.rows[photo_id]

    async def delete(self, photo_id: uuid.UUID) -> Photo:
        photo = self.rows.pop(photo_id, None)
        if photo is None:
            raise PhotoNotFound(photo_id)
        return photo


def get_photos_repo(session: SessionDep) -> PhotosRepo:
    return PhotosPostgres(session)


PhotosRepoDep = Annotated[PhotosRepo, Depends(get_photos_repo)]
