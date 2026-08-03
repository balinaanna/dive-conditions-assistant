import csv
import io
import math
from datetime import datetime, timedelta
from functools import lru_cache
from zoneinfo import ZoneInfo

import requests


ERDDAP_BASE_URL = (
    "https://salishsea.eos.ubc.ca/erddap/griddap/"
    "ubcSSfDepthAvgdCurrents1h.csv"
)
GRID_BASE_URL = (
    "https://salishsea.eos.ubc.ca/erddap/griddap/"
    "ubcSSn2DMeshMaskV21-08.csv"
)
DATASET_ID = "ubcSSfDepthAvgdCurrents1h"
GRID_DATASET_ID = "ubcSSn2DMeshMaskV21-08"
REQUEST_TIMEOUT_SECONDS = 15
MPS_TO_KNOTS = 1.943844
LOCAL_TIMEZONE = ZoneInfo("America/Vancouver")
ROLLING_HOURS = 72
LOW_CURRENT_THRESHOLD_KNOTS = 0.35


def _haversine_km(latitude_a, longitude_a, latitude_b, longitude_b):
    earth_radius_km = 6371.0088
    latitude_a_radians = math.radians(latitude_a)
    latitude_b_radians = math.radians(latitude_b)
    latitude_delta = math.radians(latitude_b - latitude_a)
    longitude_delta = math.radians(longitude_b - longitude_a)
    haversine = (
        math.sin(latitude_delta / 2) ** 2
        + math.cos(latitude_a_radians)
        * math.cos(latitude_b_radians)
        * math.sin(longitude_delta / 2) ** 2
    )
    return 2 * earth_radius_km * math.asin(math.sqrt(haversine))


def _grid_query(seed_y, seed_x, radius):
    minimum_y = max(0, seed_y - radius)
    maximum_y = min(897, seed_y + radius)
    minimum_x = max(0, seed_x - radius)
    maximum_x = min(397, seed_x + radius)
    subset = (
        f"[0][{minimum_y}:1:{maximum_y}]"
        f"[{minimum_x}:1:{maximum_x}]"
    )
    return ",".join(
        f"{variable}{subset}"
        for variable in ("glamt", "gphit", "tmaskutil")
    )


@lru_cache(maxsize=32)
def resolve_nearest_water_cell(
    latitude,
    longitude,
    seed_y,
    seed_x,
    search_radius=4,
):
    """Resolve the closest wet model cell near a configured grid seed."""
    response = requests.get(
        GRID_BASE_URL,
        params=_grid_query(seed_y, seed_x, search_radius),
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()

    candidates = []
    for row in csv.DictReader(io.StringIO(response.text)):
        try:
            if int(row["tmaskutil"]) != 1:
                continue
            candidate_latitude = float(row["gphit"])
            candidate_longitude = float(row["glamt"])
            grid_y = int(row["gridY"])
            grid_x = int(row["gridX"])
        except (KeyError, TypeError, ValueError):
            continue

        distance_km = _haversine_km(
            latitude,
            longitude,
            candidate_latitude,
            candidate_longitude,
        )
        candidates.append({
            "grid_y": grid_y,
            "grid_x": grid_x,
            "latitude": candidate_latitude,
            "longitude": candidate_longitude,
            "distance_km": round(distance_km, 3),
        })

    if not candidates:
        raise ValueError("No water cell found near the configured model seed.")

    return min(candidates, key=lambda candidate: candidate["distance_km"])


def _query(grid_y, grid_x):
    start_index = ROLLING_HOURS - 1
    return (
        f"VelEast5[last-{start_index}:1:last][{grid_y}][{grid_x}],"
        f"VelNorth5[last-{start_index}:1:last][{grid_y}][{grid_x}]"
    )


def _direction_degrees(east_mps, north_mps):
    return round((math.degrees(math.atan2(east_mps, north_mps)) + 360) % 360)


def _parse_rows(text):
    rows = csv.DictReader(io.StringIO(text))
    points = []

    for row in rows:
        try:
            east_mps = float(row["VelEast5"])
            north_mps = float(row["VelNorth5"])
        except (KeyError, TypeError, ValueError):
            continue

        if not math.isfinite(east_mps) or not math.isfinite(north_mps):
            continue

        speed_mps = math.hypot(east_mps, north_mps)
        points.append({
            "time": row["time"],
            "speed": round(speed_mps * MPS_TO_KNOTS, 2),
            "east_kn": round(east_mps * MPS_TO_KNOTS, 3),
            "north_kn": round(north_mps * MPS_TO_KNOTS, 3),
            "direction_degrees": _direction_degrees(east_mps, north_mps),
            "qualifier": None,
        })

    return points


def _dominant_flow_axis(points):
    east_squared = sum(point["east_kn"] ** 2 for point in points)
    north_squared = sum(point["north_kn"] ** 2 for point in points)
    east_north = sum(
        point["east_kn"] * point["north_kn"]
        for point in points
    )
    angle = 0.5 * math.atan2(
        2 * east_north,
        east_squared - north_squared,
    )
    return math.cos(angle), math.sin(angle)


def _estimated_reversal_time(previous, following, ratio):
    previous_time = datetime.fromisoformat(
        previous["time"].replace("Z", "+00:00")
    )
    following_time = datetime.fromisoformat(
        following["time"].replace("Z", "+00:00")
    )
    event_time = previous_time + (following_time - previous_time) * ratio
    return event_time.isoformat().replace("+00:00", "Z")


def _mark_estimated_reversals(points):
    if len(points) < 2:
        return points

    axis_east, axis_north = _dominant_flow_axis(points)
    last_reversal_time = None

    for previous, following in zip(points, points[1:]):
        previous_projection = (
            previous["east_kn"] * axis_east
            + previous["north_kn"] * axis_north
        )
        following_projection = (
            following["east_kn"] * axis_east
            + following["north_kn"] * axis_north
        )

        if previous_projection * following_projection >= 0:
            continue

        ratio = abs(previous_projection) / (
            abs(previous_projection) + abs(following_projection)
        )
        east_at_reversal = previous["east_kn"] + ratio * (
            following["east_kn"] - previous["east_kn"]
        )
        north_at_reversal = previous["north_kn"] + ratio * (
            following["north_kn"] - previous["north_kn"]
        )
        speed_at_reversal = math.hypot(east_at_reversal, north_at_reversal)

        # A sign change along the dominant axis can still be a fast rotary
        # current. Only expose it as a useful estimated reversal when the
        # interpolated total speed is also low.
        if speed_at_reversal > 0.5:
            continue

        event_time = _estimated_reversal_time(previous, following, ratio)
        parsed_event_time = datetime.fromisoformat(
            event_time.replace("Z", "+00:00")
        )
        if (
            last_reversal_time is not None
            and parsed_event_time - last_reversal_time < timedelta(hours=3)
        ):
            continue

        following["qualifier"] = "ESTIMATED_REVERSAL"
        following["event_time"] = event_time
        following["event_speed"] = round(speed_at_reversal, 2)
        last_reversal_time = parsed_event_time

    return points


def _mark_low_current_minima(points):
    window = []
    reversal_times = [
        datetime.fromisoformat(point["event_time"].replace("Z", "+00:00"))
        for point in points
        if point["qualifier"] == "ESTIMATED_REVERSAL"
    ]

    def mark_window_minimum():
        if not window:
            return

        minimum = min(window, key=lambda point: point["speed"])
        minimum_time = datetime.fromisoformat(
            minimum["time"].replace("Z", "+00:00")
        )
        near_reversal = any(
            abs((reversal_time - minimum_time).total_seconds())
            <= 90 * 60
            for reversal_time in reversal_times
        )
        if near_reversal:
            return

        if minimum["qualifier"] is None:
            minimum["qualifier"] = "LOW_CURRENT_MINIMUM"
            minimum["event_time"] = minimum["time"]
            minimum["event_speed"] = minimum["speed"]

    for point in points:
        if point["speed"] <= LOW_CURRENT_THRESHOLD_KNOTS:
            window.append(point)
            continue

        mark_window_minimum()
        window = []

    mark_window_minimum()
    return points


def fetch_salishsea_currents(grid_y, grid_x):
    response = requests.get(
        ERDDAP_BASE_URL,
        params=_query(grid_y, grid_x),
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    points = _mark_estimated_reversals(_parse_rows(response.text))
    return _mark_low_current_minima(points)


def currents_for_local_date(points, forecast_date):
    selected = []

    for point in points:
        point_time = datetime.fromisoformat(point["time"].replace("Z", "+00:00"))
        local_date = point_time.astimezone(LOCAL_TIMEZONE).date()
        if local_date == forecast_date:
            selected.append(point)

    return selected
