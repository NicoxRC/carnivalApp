from fastapi import APIRouter, Response

from app.domain.course import MAX_USER_OFFSET_M, Course
from app.repositories.courses import CourseDep
from app.schemas import Schema

router = APIRouter(prefix="/api", tags=["course"])


class WaypointOut(Schema):
    id: str
    name: str
    short: str
    kind: str
    lat: float
    lng: float
    # Metres from the start of the course.
    metres: float
    # How far from the course it is.
    offset_m: float


class CourseOut(Schema):
    id: str
    name: str
    official: bool
    warning: str | None
    length_m: float
    waypoints: list[WaypointOut]
    max_user_offset_m: int
    geojson: dict[str, object]


def course_out(course: Course) -> CourseOut:
    return CourseOut(
        id=course.id,
        name=course.name,
        official=course.official,
        warning=course.warning,
        length_m=course.length_metres,
        waypoints=[
            WaypointOut(
                id=w.id,
                name=w.name,
                short=w.short,
                kind=w.kind,
                lat=w.lat,
                lng=w.lng,
                metres=w.metres,
                offset_m=w.offset_m,
            )
            for w in course.waypoints
        ],
        max_user_offset_m=MAX_USER_OFFSET_M,
        geojson=dict(course.geojson),
    )


@router.get("/course")
async def read_course(course: CourseDep, response: Response) -> CourseOut:
    """The line of the course and its waypoints.

    It almost never changes: it is served apart from the live state so the
    browser and the service worker keep it and it does not travel every time.
    """
    response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=86400"
    return course_out(course)
