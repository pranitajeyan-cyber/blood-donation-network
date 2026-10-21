"""Geospatial helpers.

The production system uses PostGIS (``ST_DWithin`` + a GIST index on a
``geography(POINT, 4324)`` column). To keep the local dev stack at zero
infrastructure we implement the same semantics on plain SQLite:

1. a cheap bounding-box pre-filter that can run inside SQL, then
2. an exact haversine distance computed in Python.

Swapping to Postgres only requires replacing :func:`bbox_filter_sql` with
``ST_DWithin(geom, ST_MakePoint(:lon, :lat), :radius_meters)`` — the service
layer above it does not change.
"""

from math import asin, cos, radians, sin, sqrt

EARTH_RADIUS_KM = 6371.0088


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two WGS84 points, in kilometres."""
    p1, p2 = radians(lat1), radians(lat2)
    d_phi = p2 - p1
    d_lambda = radians(lon2 - lon1)

    a = sin(d_phi / 2) ** 2 + cos(p1) * cos(p2) * sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * asin(sqrt(a))


def bounding_box(
    lat: float, lon: float, radius_km: float
) -> tuple[float, float, float, float]:
    """Return ``(min_lat, max_lat, min_lon, max_lon)`` covering the radius.

    Longitude degrees shrink towards the poles, so the longitude delta is
    divided by ``cos(lat)`` and clamped to avoid dividing by ~0.
    """
    lat_delta = radius_km / 111.32

    cos_lat = cos(radians(lat))
    # Guard against the pole singularity.
    lon_delta = radius_km / (111.32 * cos_lat) if abs(cos_lat) > 1e-6 else 180.0

    return (
        max(lat - lat_delta, -90.0),
        min(lat + lat_delta, 90.0),
        lon - lon_delta,
        lon + lon_delta,
    )
