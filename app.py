import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import requests
from flask import Flask, jsonify, render_template, request

from chs_currents import fetch_chs_time_series, format_current_event
from conditions_service import build_conditions_response, create_session
from config import LOCATIONS
from response_cache import TTLCache
from weather import fetch_temperature_summary

app = Flask(__name__)

LOCAL_TIMEZONE = ZoneInfo("America/Vancouver")

FIRST_NARROWS_STATION = {
    "id": "5dd30650e0fdc4b9b4be6d24",
    "name": "First Narrows",
}

FORECAST_RESPONSE_CACHE = TTLCache(
    ttl_seconds=int(os.getenv("SERVER_CACHE_TTL_SECONDS", "900")),
    max_entries=int(os.getenv("SERVER_CACHE_MAX_ENTRIES", "64")),
)


def upstream_unavailable(source, error):
    app.logger.warning("%s request failed: %s", source, error)
    return jsonify({
        "error": f"{source} data is temporarily unavailable.",
    }), 502


def cached_json_response(payload, cache_hit):
    response = jsonify(payload)
    response.headers["X-Cache"] = "HIT" if cache_hit else "MISS"
    return response


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/ready")
def ready():
    return jsonify({"status": "ready"})


@app.route("/api/chs-current-speed")
def get_chs_current_speed():
    station_id = FIRST_NARROWS_STATION["id"]
    station_name = FIRST_NARROWS_STATION["name"]

    today_local = datetime.now(LOCAL_TIMEZONE).date()
    requested_date = request.args.get("date", today_local.isoformat())

    try:
        forecast_date = datetime.strptime(
            requested_date,
            "%Y-%m-%d",
        ).date()
    except ValueError:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD."}), 400

    if not today_local <= forecast_date <= today_local + timedelta(days=6):
        return jsonify({"error": "Date must be within the 7-day forecast."}), 400

    start_local = datetime.combine(
        forecast_date,
        datetime.min.time(),
        tzinfo=LOCAL_TIMEZONE,
    ).replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )

    end_local = start_local + timedelta(days=1)

    fetch_start_time = (start_local - timedelta(hours=8)).astimezone(timezone.utc)
    fetch_end_time = (end_local + timedelta(hours=8)).astimezone(timezone.utc)

    def load_current_payload():
        event_points = fetch_chs_time_series(
            station_id,
            "wcp1-events",
            fetch_start_time,
            fetch_end_time,
        )
        events = [format_current_event(point) for point in event_points]

        return {
            "station": station_name.strip(),
            "station_id": station_id,
            "source": "CHS",
            "unit": "kn",
            "time_series_code": "wcp1-events",
            "start_time": start_local.isoformat(),
            "end_time": end_local.isoformat(),
            "points": events,
        }

    try:
        payload, cache_hit = FORECAST_RESPONSE_CACHE.get_or_load(
            ("current", forecast_date.isoformat()),
            load_current_payload,
        )
    except requests.RequestException as error:
        return upstream_unavailable("Current", error)

    return cached_json_response(payload, cache_hit)

@app.route("/api/conditions")
def get_conditions():
    location_id = request.args.get("location", "whytecliff")
    if location_id not in LOCATIONS:
        return jsonify({"error": "Unknown location."}), 404

    today_local = datetime.now(LOCAL_TIMEZONE).date()
    requested_date = request.args.get("date", today_local.isoformat())

    try:
        forecast_date = datetime.strptime(
            requested_date,
            "%Y-%m-%d",
        ).date()
    except ValueError:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD."}), 400

    if not today_local <= forecast_date <= today_local + timedelta(days=6):
        return jsonify({"error": "Date must be within the 7-day forecast."}), 400

    def load_conditions_payload():
        session = create_session(location_id, forecast_date.isoformat())
        return build_conditions_response(session)

    try:
        payload, cache_hit = FORECAST_RESPONSE_CACHE.get_or_load(
            ("conditions", location_id, forecast_date.isoformat()),
            load_conditions_payload,
        )
    except requests.RequestException as error:
        return upstream_unavailable("Conditions", error)

    return cached_json_response(payload, cache_hit)


@app.route("/api/temperatures")
def get_temperatures():
    location_id = request.args.get("location", "whytecliff")
    location = LOCATIONS.get(location_id)

    if location is None:
        return jsonify({"error": "Unknown location."}), 404

    today_local = datetime.now(LOCAL_TIMEZONE).date()
    requested_date = request.args.get("date", today_local.isoformat())

    try:
        forecast_date = datetime.strptime(requested_date, "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD."}), 400

    if not today_local <= forecast_date <= today_local + timedelta(days=6):
        return jsonify({"error": "Date must be within the 7-day forecast."}), 400

    def load_temperature_payload():
        temperatures = fetch_temperature_summary(
            location,
            forecast_date.isoformat(),
        )
        return {
            "location": location["name"],
            "date": forecast_date.isoformat(),
            **temperatures,
        }

    try:
        payload, cache_hit = FORECAST_RESPONSE_CACHE.get_or_load(
            ("temperatures", location_id, forecast_date.isoformat()),
            load_temperature_payload,
        )
    except requests.RequestException as error:
        return upstream_unavailable("Temperature", error)

    return cached_json_response(payload, cache_hit)

if __name__ == "__main__":
    app.run(
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "5001")),
        debug=os.getenv("FLASK_DEBUG", "").lower() in {"1", "true", "yes"},
    )
