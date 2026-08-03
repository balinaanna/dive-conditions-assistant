import json
import os
import time
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import requests
from flask import Flask, g, jsonify, render_template, request

from conditions_service import build_conditions_response, create_session
from config import LOCATIONS
from current_forecast import build_current_forecast
from response_cache import TTLCache
from weather import fetch_temperature_summary

app = Flask(__name__)

LOCAL_TIMEZONE = ZoneInfo("America/Vancouver")

FORECAST_DAYS = 3
CURRENT_MODEL_CACHE_VERSION = "regional-chs-v2"
ASSET_VERSION = "regional-chs-v2"

FORECAST_RESPONSE_CACHE = TTLCache(
    ttl_seconds=int(os.getenv("SERVER_CACHE_TTL_SECONDS", "900")),
    max_entries=int(os.getenv("SERVER_CACHE_MAX_ENTRIES", "64")),
)

CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; "
    "font-src 'self' data:; "
    "connect-src 'self'; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    f"frame-ancestors {os.getenv('WIDGET_FRAME_ANCESTORS', '*')}"
)


@app.before_request
def start_request_observation():
    g.request_id = uuid.uuid4().hex
    g.request_started_at = time.perf_counter()


@app.after_request
def finish_request_observation(response):
    request_id = getattr(g, "request_id", uuid.uuid4().hex)
    started_at = getattr(g, "request_started_at", time.perf_counter())
    duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
    cache_status = response.headers.get("X-Cache")

    response.headers["X-Request-ID"] = request_id
    response.headers["Content-Security-Policy"] = CONTENT_SECURITY_POLICY
    response.headers["Permissions-Policy"] = (
        "camera=(), geolocation=(), microphone=(), payment=(), usb=()"
    )
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Content-Type-Options"] = "nosniff"
    app.logger.info(json.dumps({
        "event": "request_completed",
        "request_id": request_id,
        "method": request.method,
        "path": request.path,
        "status": response.status_code,
        "duration_ms": duration_ms,
        "cache": cache_status,
    }, separators=(",", ":")))
    return response


def upstream_unavailable(source, error):
    app.logger.warning(json.dumps({
        "event": "provider_request_failed",
        "request_id": getattr(g, "request_id", None),
        "source": source,
        "error_type": type(error).__name__,
    }, separators=(",", ":")))
    return jsonify({
        "error": f"{source} data is temporarily unavailable.",
    }), 502


def cached_json_response(payload, cache_hit):
    response = jsonify(payload)
    response.headers["X-Cache"] = "HIT" if cache_hit else "MISS"
    return response


@app.route("/")
def index():
    return render_template("index.html", asset_version=ASSET_VERSION)


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/ready")
def ready():
    return jsonify({"status": "ready"})


@app.route("/api/locations")
def get_locations():
    return jsonify([
        {
            "id": location_id,
            "name": location["name"],
            "area": location["area"],
        }
        for location_id, location in LOCATIONS.items()
    ])


@app.route("/api/current-speed")
def get_current_speed():
    location_id = request.args.get("location", "whytecliff")
    location = LOCATIONS.get(location_id)
    if location is None:
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

    if not today_local <= forecast_date <= today_local + timedelta(
        days=FORECAST_DAYS - 1,
    ):
        return jsonify({"error": "Date must be within the 3-day forecast."}), 400

    def load_current_payload():
        return build_current_forecast(
            location,
            forecast_date,
            LOCAL_TIMEZONE,
        )

    try:
        payload, cache_hit = FORECAST_RESPONSE_CACHE.get_or_load(
            (
                "current",
                CURRENT_MODEL_CACHE_VERSION,
                location_id,
                forecast_date.isoformat(),
            ),
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

    if not today_local <= forecast_date <= today_local + timedelta(
        days=FORECAST_DAYS - 1,
    ):
        return jsonify({"error": "Date must be within the 3-day forecast."}), 400

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

    if not today_local <= forecast_date <= today_local + timedelta(
        days=FORECAST_DAYS - 1,
    ):
        return jsonify({"error": "Date must be within the 3-day forecast."}), 400

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
