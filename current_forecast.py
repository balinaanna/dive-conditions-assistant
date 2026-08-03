"""Current forecast provider orchestration and confidence assessment."""

from datetime import datetime, timedelta

import requests

from chs_currents import FIRST_NARROWS_STATION, fetch_chs_current_events
from salishsea_currents import (
    DATASET_ID,
    GRID_DATASET_ID,
    currents_for_local_date,
    fetch_salishsea_currents,
    resolve_nearest_water_cell,
)


PROVIDER_ORDER = (
    "salishseacast",
    "ciops",
    "chs_estimate",
    "unavailable",
)
PHASE_HIGH_CONFIDENCE_MINUTES = 60
PHASE_MEDIUM_CONFIDENCE_MINUTES = 120


class CurrentProviderUnavailable(Exception):
    """Raised when a current provider cannot supply the requested forecast."""


def _parse_time(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _local_day_bounds(forecast_date, local_timezone):
    start = datetime.combine(
        forecast_date,
        datetime.min.time(),
        tzinfo=local_timezone,
    )
    return start, start + timedelta(days=1)


def _events_for_local_date(events, forecast_date, local_timezone):
    return [
        event
        for event in events
        if _parse_time(event["time"]).astimezone(local_timezone).date()
        == forecast_date
    ]


def _slack_times(events):
    return [
        _parse_time(event["time"])
        for event in events
        if event.get("qualifier") == "SLACK"
    ]


def compare_chs_phase(
    model_points,
    chs_events,
    forecast_date=None,
    local_timezone=None,
):
    """Compare modelled reversals with CHS slacks one-to-one.

    CHS requests intentionally include surrounding events. When the local day
    is known, exclude those adjacent-day events before assessing phase.
    """
    relevant_chs_events = chs_events
    if forecast_date is not None and local_timezone is not None:
        relevant_chs_events = _events_for_local_date(
            chs_events,
            forecast_date,
            local_timezone,
        )

    chs_slacks = sorted(_slack_times(relevant_chs_events))
    reversals = sorted(
        (
            point
            for point in model_points
            if point.get("qualifier") == "ESTIMATED_REVERSAL"
        ),
        key=lambda point: _parse_time(point.get("event_time", point["time"])),
    )
    comparisons = []
    remaining_chs_slacks = list(chs_slacks)

    for reversal in reversals:
        model_time = _parse_time(reversal.get("event_time", reversal["time"]))
        if not remaining_chs_slacks:
            break
        chs_time = min(
            remaining_chs_slacks,
            key=lambda value: abs(value - model_time),
        )
        remaining_chs_slacks.remove(chs_time)
        delta_minutes = round(abs((chs_time - model_time).total_seconds()) / 60)
        comparisons.append({
            "model_time": model_time.isoformat().replace("+00:00", "Z"),
            "chs_time": chs_time.isoformat().replace("+00:00", "Z"),
            "delta_minutes": delta_minutes,
        })

    matched_model_times = {item["model_time"] for item in comparisons}
    unmatched_model_times = [
        _parse_time(point.get("event_time", point["time"]))
        .isoformat()
        .replace("+00:00", "Z")
        for point in reversals
        if _parse_time(point.get("event_time", point["time"]))
        .isoformat()
        .replace("+00:00", "Z") not in matched_model_times
    ]
    unmatched_chs_times = [
        value.isoformat().replace("+00:00", "Z")
        for value in remaining_chs_slacks
    ]
    event_counts_match = len(reversals) == len(chs_slacks)

    base_result = {
        "model_reversal_count": len(reversals),
        "chs_slack_count": len(chs_slacks),
        "unmatched_model_times": unmatched_model_times,
        "unmatched_chs_times": unmatched_chs_times,
    }

    if not comparisons:
        return {
            "status": "not_comparable",
            "confidence": "low",
            "max_delta_minutes": None,
            "comparisons": [],
            **base_result,
        }

    maximum_delta = max(item["delta_minutes"] for item in comparisons)
    if not event_counts_match:
        confidence = "low"
        status = "divergent"
    elif maximum_delta <= PHASE_HIGH_CONFIDENCE_MINUTES:
        confidence = "high"
        status = "aligned"
    elif maximum_delta <= PHASE_MEDIUM_CONFIDENCE_MINUTES:
        confidence = "medium"
        status = "partially_aligned"
    else:
        confidence = "low"
        status = "divergent"

    return {
        "status": status,
        "confidence": confidence,
        "max_delta_minutes": maximum_delta,
        "comparisons": comparisons,
        **base_result,
    }


def _overall_confidence(points, cell, phase):
    if (
        len(points) < 20
        or cell["distance_km"] > 2
        or phase["confidence"] == "low"
    ):
        return "low"
    if phase["confidence"] == "high" and cell["distance_km"] <= 1:
        return "high"
    return "medium"


def _coverage(points):
    return {
        "available": bool(points),
        "first_point": points[0]["time"] if points else None,
        "last_point": points[-1]["time"] if points else None,
        "partial_day": len(points) < 20,
    }


def _fully_covered_local_dates(points, local_timezone):
    points_by_date = {}
    for point in points:
        point_time = _parse_time(point["time"]).astimezone(local_timezone)
        points_by_date.setdefault(point_time.date(), []).append(point_time)

    fully_covered = []
    for local_date, times in sorted(points_by_date.items()):
        day_start = datetime.combine(
            local_date,
            datetime.min.time(),
            tzinfo=local_timezone,
        )
        day_end = day_start + timedelta(days=1)
        if (
            len(times) >= 23
            and min(times) <= day_start + timedelta(hours=1)
            and max(times) >= day_end - timedelta(hours=1)
        ):
            fully_covered.append(local_date.isoformat())

    return fully_covered


def _salishsea_payload(location, forecast_date, local_timezone, chs_events):
    model = location["current_model"]
    cell = resolve_nearest_water_cell(
        location["latitude"],
        location["longitude"],
        model["seed_grid_y"],
        model["seed_grid_x"],
        model.get("search_radius", 4),
    )
    rolling_points = fetch_salishsea_currents(cell["grid_y"], cell["grid_x"])
    points = currents_for_local_date(rolling_points, forecast_date)
    if not points:
        raise CurrentProviderUnavailable(
            "SalishSeaCast has no coverage for the requested local date."
        )

    phase = compare_chs_phase(
        points,
        chs_events,
        forecast_date,
        local_timezone,
    )
    return {
        "source": "UBC SalishSeaCast",
        "provider": "salishseacast",
        "dataset_id": DATASET_ID,
        "grid_dataset_id": GRID_DATASET_ID,
        "model_grid": cell,
        "depth_average": "upper 5 model levels, nominally 5 m",
        "points": points,
        "fully_available_dates": _fully_covered_local_dates(
            rolling_points,
            local_timezone,
        ),
        "coverage": _coverage(points),
        "phase_comparison": phase,
        "confidence": _overall_confidence(points, cell, phase),
    }


def _ciops_payload(*_args, **_kwargs):
    # The fallback seam is intentional. CIOPS requires a separately validated
    # data-access adapter before it can be used for safety-related output.
    raise CurrentProviderUnavailable("CIOPS provider is not configured.")


def _chs_payload(chs_events, forecast_date, local_timezone):
    points = _events_for_local_date(chs_events, forecast_date, local_timezone)
    if not points:
        raise CurrentProviderUnavailable(
            "CHS has no current events for the requested local date."
        )

    return {
        "source": "CHS First Narrows event-based estimate",
        "provider": "chs_estimate",
        "station": FIRST_NARROWS_STATION["name"],
        "station_id": FIRST_NARROWS_STATION["id"],
        "time_series_code": "wcp1-events",
        "depth_average": None,
        "points": points,
        "coverage": _coverage(points),
        "phase_comparison": {
            "status": "fallback_source",
            "confidence": "low",
            "max_delta_minutes": None,
            "comparisons": [],
        },
        "confidence": "low",
    }


def build_current_forecast(location, forecast_date, local_timezone):
    """Return the best available current series and transparent provenance."""
    start_local, end_local = _local_day_bounds(forecast_date, local_timezone)
    attempts = []

    try:
        chs_events = fetch_chs_current_events(start_local, end_local)
    except (requests.RequestException, KeyError, TypeError, ValueError) as error:
        chs_events = []
        attempts.append({
            "provider": "chs_phase",
            "status": "unavailable",
            "reason": type(error).__name__,
        })

    providers = (
        ("salishseacast", lambda: _salishsea_payload(
            location,
            forecast_date,
            local_timezone,
            chs_events,
        )),
        ("ciops", lambda: _ciops_payload(
            location,
            forecast_date,
            local_timezone,
        )),
        ("chs_estimate", lambda: _chs_payload(
            chs_events,
            forecast_date,
            local_timezone,
        )),
    )

    for provider_name, load in providers:
        try:
            payload = load()
            attempts.append({"provider": provider_name, "status": "selected"})
            payload.update({
                "location": location["name"],
                "unit": "kn",
                "start_time": start_local.isoformat(),
                "end_time": end_local.isoformat(),
                "provider_order": list(PROVIDER_ORDER),
                "provider_attempts": attempts,
            })
            return payload
        except (
            CurrentProviderUnavailable,
            requests.RequestException,
            KeyError,
            TypeError,
            ValueError,
        ) as error:
            attempts.append({
                "provider": provider_name,
                "status": "unavailable",
                "reason": type(error).__name__,
            })

    return {
        "location": location["name"],
        "source": "Current unavailable",
        "provider": "unavailable",
        "unit": "kn",
        "start_time": start_local.isoformat(),
        "end_time": end_local.isoformat(),
        "depth_average": None,
        "points": [],
        "coverage": _coverage([]),
        "phase_comparison": {
            "status": "unavailable",
            "confidence": "low",
            "max_delta_minutes": None,
            "comparisons": [],
        },
        "confidence": "unavailable",
        "provider_order": list(PROVIDER_ORDER),
        "provider_attempts": attempts + [
            {"provider": "unavailable", "status": "selected"},
        ],
    }
