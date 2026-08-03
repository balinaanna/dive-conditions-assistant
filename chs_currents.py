from datetime import timedelta, timezone

import requests

CHS_BASE_URL = "https://api-iwls.dfo-mpo.gc.ca/api/v1"
REQUEST_TIMEOUT_SECONDS = 10
MPS_TO_KNOTS = 1.943844

# First Narrows is used for tidal-phase comparison and as a last-resort,
# low-confidence event-curve fallback. It is not treated as a local speed
# measurement for Whytecliff Park.
FIRST_NARROWS_STATION = {
    "id": "5dd30650e0fdc4b9b4be6d24",
    "name": "First Narrows",
}


def fetch_chs_current_events(start_local, end_local, station=None):
    """Fetch CHS current events around a local-day comparison window."""
    station = station or FIRST_NARROWS_STATION
    fetch_start = (start_local - timedelta(hours=8)).astimezone(timezone.utc)
    fetch_end = (end_local + timedelta(hours=8)).astimezone(timezone.utc)
    rows = fetch_chs_time_series(
        station["id"],
        "wcp1-events",
        fetch_start,
        fetch_end,
    )
    return [format_current_event(row) for row in rows]

def format_current_event(point):
    qualifier = point["qualifier"]
    value = float(point["value"])

    if qualifier == "EXTREMA_EBB":
        signed_value = -value
    elif qualifier == "EXTREMA_FLOOD":
        signed_value = value
    else:
        signed_value = 0

    return {
        "time": point["eventDate"],
        "qualifier": qualifier,
        "speed": round(signed_value, 2),
    }

def fetch_chs_time_series(
    station_id,
    time_series_code,
    start_time,
    end_time,
):
    url = f"{CHS_BASE_URL}/stations/{station_id}/data"

    params = {
        "time-series-code": time_series_code,
        "from": start_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "to": end_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    response = requests.get(
        url,
        params=params,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )

    response.raise_for_status()

    points = response.json()
  
    if time_series_code.startswith("wcsp"):
        for point in points:
            point["value"] = round(point["value"] * MPS_TO_KNOTS, 2)

    return points
