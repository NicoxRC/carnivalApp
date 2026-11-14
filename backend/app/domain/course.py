"""The course is 1D.

Any point of the world is projected onto the line of the course and becomes a
single number: metres from the start. Everything else (where the parade is,
how far it is from someone, how full a stretch is) is arithmetic on it.

Degrees are not metres, so the line is first moved to a flat plane measured in
metres, centred on the course, and there `shapely` does the geometry.

The plane is built on a sphere of the radius turf uses, and not on UTM 18N:
the web still projects the user's own position with turf, and both sides have
to give the same number. UTM measures on the ellipsoid, which around Pasto is
about 0.3 % shorter (11 m at the end of this course).
"""

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from pyproj import Transformer
from shapely.geometry import LineString, Point

# How far from the course a user may be for "the parade arrives in X" to mean
# anything. Same as DESVIO_MAX_USUARIO_M in src/lib/senda.ts.
MAX_USER_OFFSET_M = 600

# turf's earth radius, in metres.
EARTH_RADIUS_M = 6371008.8


@dataclass(frozen=True, slots=True)
class Projection:
    # Metres from the start of the course.
    metres: float
    # How far from the course the original point was.
    offset_m: float
    # The point already snapped onto the course.
    lat: float
    lng: float


@dataclass(frozen=True, slots=True)
class Waypoint:
    """A place people know (a church, a mall), to say where the parade is."""

    id: str
    name: str
    # Short name for the map, where the long one does not fit.
    short: str
    kind: str
    lat: float
    lng: float
    metres: float
    offset_m: float


class Course:
    def __init__(
        self,
        *,
        id: str,
        name: str,
        official: bool,
        warning: str | None,
        geojson: Mapping[str, Any],
        waypoints: Sequence[Mapping[str, Any]] = (),
    ) -> None:
        self.id = id
        self.name = name
        self.official = official
        self.warning = warning
        self.geojson = geojson

        coordinates = _line_coordinates(geojson)
        centre_lng = sum(lng for lng, _ in coordinates) / len(coordinates)
        centre_lat = sum(lat for _, lat in coordinates) / len(coordinates)
        plane = f"+proj=aeqd +lat_0={centre_lat} +lon_0={centre_lng} +R={EARTH_RADIUS_M} +units=m"
        self._to_plane = Transformer.from_crs("EPSG:4326", plane, always_xy=True)
        self._to_degrees = Transformer.from_crs(plane, "EPSG:4326", always_xy=True)
        self._line = LineString([self._to_plane.transform(lng, lat) for lng, lat in coordinates])
        self.length_metres: float = self._line.length

        # Each waypoint is projected like any other point; sorted by progress
        # to be able to say "it is between X and Y".
        self.waypoints: tuple[Waypoint, ...] = tuple(
            sorted((self._waypoint(raw) for raw in waypoints), key=lambda w: w.metres)
        )
        self._waypoints_by_id = {waypoint.id: waypoint for waypoint in self.waypoints}

    @classmethod
    def from_geojson(
        cls,
        geojson: Mapping[str, Any],
        *,
        id: str,
        name: str,
        official: bool = False,
        warning: str | None = None,
        waypoints: Sequence[Mapping[str, Any]] = (),
    ) -> "Course":
        return cls(
            id=id,
            name=name,
            official=official,
            warning=warning,
            geojson=geojson,
            waypoints=waypoints,
        )

    def course_metres(self, lat: float, lng: float) -> Projection:
        """Projects any point onto the course.

        It is the only function that turns (lat, lng) into the number
        everything else uses. Raises `ValueError` if they are not coordinates.
        """
        if not (
            math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180
        ):
            raise ValueError(f"Not coordinates: lat={lat!r}, lng={lng!r}")
        point = Point(self._to_plane.transform(lng, lat))
        metres = self._line.project(point)
        snapped = self._line.interpolate(metres)
        snapped_lng, snapped_lat = self._to_degrees.transform(snapped.x, snapped.y)
        return Projection(
            metres=metres, offset_m=self._line.distance(point), lat=snapped_lat, lng=snapped_lng
        )

    def point_at_metre(self, metres: float) -> tuple[float, float]:
        """The inverse: the (lat, lng) of a number of metres, clamped to the course."""
        clamped = min(max(metres, 0.0), self.length_metres)
        point = self._line.interpolate(clamped)
        lng, lat = self._to_degrees.transform(point.x, point.y)
        return lat, lng

    def waypoint_by_id(self, waypoint_id: str) -> Waypoint | None:
        return self._waypoints_by_id.get(waypoint_id)

    def _waypoint(self, raw: Mapping[str, Any]) -> Waypoint:
        projection = self.course_metres(float(raw["lat"]), float(raw["lng"]))
        return Waypoint(
            id=str(raw["id"]),
            name=str(raw["name"]),
            short=str(raw.get("short") or raw["name"]),
            kind=str(raw["kind"]),
            lat=float(raw["lat"]),
            lng=float(raw["lng"]),
            metres=projection.metres,
            offset_m=projection.offset_m,
        )


def _line_coordinates(geojson: Mapping[str, Any]) -> list[tuple[float, float]]:
    """The (lng, lat) pairs of a GeoJSON LineString, bare or inside a Feature."""
    try:
        geometry = geojson["geometry"] if geojson.get("type") == "Feature" else geojson
        if geometry["type"] != "LineString":
            raise ValueError("The course has to be a LineString.")
        coordinates = [(float(lng), float(lat)) for lng, lat, *_ in geometry["coordinates"]]
    except (KeyError, TypeError, AttributeError) as error:
        raise ValueError("The course is not a valid GeoJSON LineString.") from error
    if len(coordinates) < 2:
        raise ValueError("The course needs at least two points.")
    return coordinates
