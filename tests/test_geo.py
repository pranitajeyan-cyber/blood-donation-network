"""Geospatial maths."""

from __future__ import annotations

import pytest

from app.geo import bounding_box, haversine_km


def test_zero_distance():
    assert haversine_km(11.0168, 76.9558, 11.0168, 76.9558) == pytest.approx(0.0, abs=1e-9)


def test_known_city_distance():
    """Coimbatore to Chennai is roughly 425 km as the crow flies."""
    distance = haversine_km(11.0168, 76.9558, 13.0827, 80.2707)
    assert 415 < distance < 440


def test_distance_is_symmetric():
    forward = haversine_km(11.0, 77.0, 12.0, 78.0)
    backward = haversine_km(12.0, 78.0, 11.0, 77.0)
    assert forward == pytest.approx(backward)


def test_bounding_box_contains_centre():
    min_lat, max_lat, min_lon, max_lon = bounding_box(11.0168, 76.9558, 5)
    assert min_lat < 11.0168 < max_lat
    assert min_lon < 76.9558 < max_lon


def test_bounding_box_covers_a_point_at_the_radius():
    """A donor exactly 5 km north must fall inside a 5 km bounding box."""
    lat, lon, radius = 11.0168, 76.9558, 5
    min_lat, max_lat, _, _ = bounding_box(lat, lon, radius)
    north = lat + (radius / 111.32)
    assert min_lat <= north <= max_lat


def test_bounding_box_clamps_at_the_pole():
    min_lat, max_lat, min_lon, max_lon = bounding_box(89.9, 10.0, 50)
    assert max_lat <= 90.0
    assert min_lat >= -90.0
    assert min_lon < max_lon
