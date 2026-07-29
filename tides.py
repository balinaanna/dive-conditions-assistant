import requests
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

LOCAL_TIMEZONE = ZoneInfo("America/Vancouver")

def to_utc(date, hour, minute=0):
    local = datetime.strptime(
        f"{date} {hour:02d}:{minute:02d}:00",
        "%Y-%m-%d %H:%M:%S",
    ).replace(tzinfo=LOCAL_TIMEZONE)
    return local.astimezone(timezone.utc)


def utc_to_local_string(utc_string):
    event_utc = datetime.fromisoformat(utc_string.replace("Z", "+00:00"))

    if event_utc.tzinfo is None:
        event_utc = event_utc.replace(tzinfo=timezone.utc)

    event_local = event_utc.astimezone(LOCAL_TIMEZONE)
    return event_local.strftime("%Y-%m-%dT%H:%M")


def fetch_station_data(station_id, time_series_code, date):
    start_utc = to_utc(date, 0)
    end_utc = to_utc(date, 23, 59)

    url = f"https://api-iwls.dfo-mpo.gc.ca/api/v1/stations/{station_id}/data"

    params = {
        "time-series-code": time_series_code,
        "from": start_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "to": end_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
    }

    response = requests.get(url, params=params, timeout=10)
    response.raise_for_status()

    return response.json()


def fetch_tides_for_location(session):
    date = session["daily"]["date"]
    station_id = session["tide_station_id"]
    station_name = session["tide_station_name"]

    curve_data = fetch_station_data(station_id, "wlp", date)
    hilo_data = fetch_station_data(station_id, "wlp-hilo", date)

    curve = []

    for item in curve_data:
        curve.append({
            "time": utc_to_local_string(item["eventDate"]),
            "height_m": item["value"]
        })

    events = []

    for item in hilo_data:
        events.append({
            "time": utc_to_local_string(item["eventDate"]),
            "type": item.get("eventType", "tide"),
            "height_m": item["value"]
        })

    return {
        "status": "connected",
        "station": station_name,
        "curve": curve,
        "events": events
    }
