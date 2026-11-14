"""Courses repository, and the course the server keeps loaded in memory."""

from dataclasses import dataclass
from typing import Annotated, Any, Protocol

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionDep
from app.domain.course import Course
from app.models import Course as CourseRow


@dataclass(frozen=True, slots=True)
class CourseRecord:
    """A course as it is stored: the line and the raw waypoints."""

    id: str
    name: str
    geojson: dict[str, Any]
    waypoints: list[dict[str, Any]]
    official: bool = False
    warning: str | None = None

    def to_course(self) -> Course:
        return Course(
            id=self.id,
            name=self.name,
            official=self.official,
            warning=self.warning,
            geojson=self.geojson,
            waypoints=self.waypoints,
        )


class CoursesRepo(Protocol):
    async def current(self) -> CourseRecord | None:
        """The course in use: the last one loaded."""
        ...

    async def save(self, record: CourseRecord) -> None:
        """Creates it or replaces the one with the same id."""
        ...


class CoursesPostgres:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def current(self) -> CourseRecord | None:
        row = await self._session.scalar(
            select(CourseRow).order_by(CourseRow.created_at.desc(), CourseRow.id).limit(1)
        )
        if row is None:
            return None
        return CourseRecord(
            id=row.id,
            name=row.name,
            geojson=row.geojson,
            waypoints=row.waypoints,
            official=row.official,
            warning=row.warning,
        )

    async def save(self, record: CourseRecord) -> None:
        values = {
            "name": record.name,
            "geojson": record.geojson,
            "waypoints": record.waypoints,
            "length_m": record.to_course().length_metres,
            "official": record.official,
            "warning": record.warning,
        }
        await self._session.execute(
            insert(CourseRow)
            .values(id=record.id, **values)
            .on_conflict_do_update(index_elements=[CourseRow.id], set_=values)
        )
        await self._session.commit()


class CoursesMemory:
    def __init__(self) -> None:
        self._records: dict[str, CourseRecord] = {}

    async def current(self) -> CourseRecord | None:
        return next(reversed(self._records.values()), None)

    async def save(self, record: CourseRecord) -> None:
        self._records[record.id] = record


def get_courses_repo(session: SessionDep) -> CoursesRepo:
    return CoursesPostgres(session)


CoursesRepoDep = Annotated[CoursesRepo, Depends(get_courses_repo)]

# The course almost never changes and every position is measured against it:
# it is built once (reprojecting the line is not free) and kept in memory.
_loaded: Course | None = None


def forget_course() -> None:
    """Drops the course in memory, so the next request reads it again."""
    global _loaded
    _loaded = None


async def get_course(courses: CoursesRepoDep) -> Course:
    global _loaded
    if _loaded is None:
        record = await courses.current()
        if record is None:
            # Not kept: as soon as someone seeds the database it shows up.
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "La senda no está cargada.")
        _loaded = record.to_course()
    return _loaded


CourseDep = Annotated[Course, Depends(get_course)]
