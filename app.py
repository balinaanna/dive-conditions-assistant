import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from flask import Flask, jsonify, render_template, request

from chs_currents import fetch_chs_time_series, format_current_event
from conditions_service import build_conditions_response, create_session
from config import LOCATIONS
from weather import fetch_temperature_summary

app = Flask(__name__)

LOCAL_TIMEZONE = ZoneInfo("America/Vancouver")

FIRST_NARROWS_STATION = {
    "id": "5dd30650e0fdc4b9b4be6d24",
    "name": "First Narrows",
}

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

    event_points = fetch_chs_time_series(
        station_id,
        "wcp1-events",
        fetch_start_time,
        fetch_end_time,
    )

    events = [format_current_event(point) for point in event_points]

    return jsonify({
        "station": station_name.strip(),
        "station_id": station_id,
        "source": "CHS",
        "unit": "kn",
        "time_series_code": "wcp1-events",
        "start_time": start_local.isoformat(),
        "end_time": end_local.isoformat(),
        "points": events,
    })

@app.route("/api/conditions")
def get_conditions():
    location_id = request.args.get("location", "whytecliff")
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

    session = create_session(location_id, forecast_date.isoformat())
    result = build_conditions_response(session)

    return jsonify(result)


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

    temperatures = fetch_temperature_summary(
        location,
        forecast_date.isoformat(),
    )

    return jsonify({
        "location": location["name"],
        "date": forecast_date.isoformat(),
        **temperatures,
    })

if __name__ == "__main__":
    app.run(
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "5001")),
        debug=os.getenv("FLASK_DEBUG", "").lower() in {"1", "true", "yes"},
    )
