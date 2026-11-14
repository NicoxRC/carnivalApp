import json
import math

import pytest
from fastapi.testclient import TestClient

from app.domain.course import MAX_USER_OFFSET_M, Course
from app.repositories.courses import CoursesMemory
from app.seed import SEED_DIR, read_course

PROJECTIONS = json.loads((SEED_DIR / "projections.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def course() -> Course:
    return read_course(SEED_DIR).to_course()


def test_course_metres_ok(course: Course) -> None:
    start_lat, start_lng = course.point_at_metre(0)
    end_lat, end_lng = course.point_at_metre(course.length_metres)

    assert course.course_metres(start_lat, start_lng).metres == pytest.approx(0, abs=0.01)
    assert course.course_metres(end_lat, end_lng).metres == pytest.approx(
        course.length_metres, abs=0.01
    )
    # A point on the course is not off it, and comes back as itself.
    lat, lng = course.point_at_metre(1500)
    projection = course.course_metres(lat, lng)
    assert projection.metres == pytest.approx(1500, abs=0.01)
    assert projection.offset_m == pytest.approx(0, abs=0.01)
    assert (projection.lat, projection.lng) == pytest.approx((lat, lng), abs=1e-7)


def test_course_metres_fails(course: Course) -> None:
    for lat, lng in ((91.0, -77.28), (1.21, -181.0), (math.nan, -77.28), (1.21, math.inf)):
        with pytest.raises(ValueError):
            course.course_metres(lat, lng)


def test_parity_with_turf(course: Course) -> None:
    # The web projects with turf; both sides have to give the same number.
    assert course.length_metres == pytest.approx(PROJECTIONS["lengthM"], abs=2)
    assert len(PROJECTIONS["points"]) >= 10
    for point in PROJECTIONS["points"]:
        projection = course.course_metres(point["lat"], point["lng"])

        assert projection.metres == pytest.approx(point["metres"], abs=2), point["name"]
        assert projection.offset_m == pytest.approx(point["offsetM"], abs=2), point["name"]
        assert projection.lat == pytest.approx(point["snappedLat"], abs=2e-5), point["name"]
        assert projection.lng == pytest.approx(point["snappedLng"], abs=2e-5), point["name"]


def test_point_at_metre_is_clamped_to_the_course(course: Course) -> None:
    assert course.point_at_metre(-500) == course.point_at_metre(0)
    assert course.point_at_metre(course.length_metres + 500) == course.point_at_metre(
        course.length_metres
    )


def test_waypoints_are_projected_and_sorted(course: Course) -> None:
    exported = json.loads((SEED_DIR / "course.json").read_text(encoding="utf-8"))["waypoints"]
    metres = [waypoint.metres for waypoint in course.waypoints]

    assert metres == sorted(metres)
    assert len(course.waypoints) == len(exported)
    for raw in exported:
        waypoint = course.waypoint_by_id(raw["id"])
        assert waypoint is not None
        # The same metres turf gave the web.
        assert waypoint.metres == pytest.approx(raw["metres"], abs=2)
        assert waypoint.offset_m == pytest.approx(raw["offsetM"], abs=2)
    assert course.waypoint_by_id("w-nowhere") is None


def test_course_from_geojson_fails() -> None:
    for geojson in (
        {},
        {"type": "Point", "coordinates": [-77.28, 1.21]},
        {"type": "LineString", "coordinates": [[-77.28, 1.21]]},
        {"type": "Feature", "geometry": None},
    ):
        with pytest.raises(ValueError):
            Course.from_geojson(geojson, id="c", name="C")


def test_course_from_a_bare_linestring_ok() -> None:
    course = Course.from_geojson(
        {"type": "LineString", "coordinates": [[-77.28, 1.21], [-77.28, 1.22]]}, id="c", name="C"
    )

    # 0.01 degrees of latitude on turf's sphere.
    assert course.length_metres == pytest.approx(1111.95, abs=0.5)


def test_course_ok(client: TestClient) -> None:
    response = client.get("/api/course")

    assert response.status_code == 200
    assert "max-age" in response.headers["Cache-Control"]
    body = response.json()
    assert set(body) == {
        "id",
        "name",
        "official",
        "warning",
        "lengthM",
        "waypoints",
        "maxUserOffsetM",
        "geojson",
    }
    assert body["official"] is False
    assert body["maxUserOffsetM"] == MAX_USER_OFFSET_M
    assert body["lengthM"] == pytest.approx(PROJECTIONS["lengthM"], abs=2)
    assert body["geojson"]["geometry"]["type"] == "LineString"
    assert set(body["waypoints"][0]) == {
        "id",
        "name",
        "short",
        "kind",
        "lat",
        "lng",
        "metres",
        "offsetM",
    }


async def test_course_fails(client: TestClient, courses: CoursesMemory) -> None:
    courses._records.clear()

    response = client.get("/api/course")

    assert response.status_code == 503
    assert response.json() == {"error": "La senda no está cargada."}

    # It is not remembered as missing: once seeded, it shows up.
    await courses.save(read_course(SEED_DIR))
    assert client.get("/api/course").status_code == 200
