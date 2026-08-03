from datetime import datetime
from zoneinfo import ZoneInfo

import requests

from open_meteo import fetch_open_meteo_json
from tides import fetch_tides_for_location

LOCAL_TIMEZONE = ZoneInfo("America/Vancouver")
FORECAST_DAYS = 3


def fetch_temperature_summary(location, target_date):
    latitude = location["latitude"]
    longitude = location["longitude"]
    is_freshwater = location.get("is_freshwater", False)
    marine_latitude = location.get("marine_latitude", latitude)
    marine_longitude = location.get("marine_longitude", longitude)

    if is_freshwater:
        return {"water_temp_c": None}

    marine_data = fetch_open_meteo_json(
        "https://marine-api.open-meteo.com/v1/marine",
        {
            "latitude": marine_latitude,
            "longitude": marine_longitude,
            "current": "sea_surface_temperature",
            "hourly": "sea_surface_temperature",
            "forecast_days": FORECAST_DAYS,
            "timezone": "America/Vancouver",
        },
    )
    marine_times = marine_data.get("hourly", {}).get("time", [])
    marine_noon_time = f"{target_date}T12:00"
    marine_noon_index = (
        marine_times.index(marine_noon_time)
        if marine_noon_time in marine_times
        else None
    )
    is_today = marine_data.get("current", {}).get("time", "").startswith(
        target_date,
    )
    water_temp_c = (
        marine_data.get("current", {}).get("sea_surface_temperature")
        if is_today
        else (
            marine_data["hourly"]["sea_surface_temperature"][marine_noon_index]
            if marine_noon_index is not None
            else None
        )
    )

    return {
        "water_temp_c": water_temp_c,
    }

def estimate_current_at_time(session, time_string):
    tides = session.get("tides", {})
    events = tides.get("events", [])

    if not events:
        return "unknown"

    target_time = datetime.strptime(time_string, "%Y-%m-%dT%H:%M")

    closest_minutes = None

    for event in events:
        tide_time = datetime.strptime(event["time"], "%Y-%m-%dT%H:%M")
        minutes = abs((tide_time - target_time).total_seconds()) / 60

        if closest_minutes is None or minutes < closest_minutes:
            closest_minutes = minutes

    if closest_minutes <= 30:
        return "slack"

    if closest_minutes <= 90:
        return "mild"

    return "moderate"

def estimate_current_from_tides(session):
    return estimate_current_at_time(session, session["current_time"])

def fetch_conditions_for_location(session):
    latitude = session["latitude"]
    longitude = session["longitude"]

    marine_latitude = session.get("marine_latitude", latitude)
    marine_longitude = session.get("marine_longitude", longitude)

    session["tide_station_id"] = session.get(
        "tide_station_id",
        "5cebf1de3d0f4a073c4bb94c"
    )

    session["tide_station_name"] = session.get(
        "tide_station_name",
        "Point Atkinson"
    )

    session["is_freshwater"] = session.get("is_freshwater", False)
    target_date = session.get("forecast_date")

    if not target_date:
        target_date = datetime.now(LOCAL_TIMEZONE).date().isoformat()

    session["forecast_date"] = target_date

    try:
        weather_url = "https://api.open-meteo.com/v1/forecast"
        weather_params = {
            "latitude": latitude,
            "longitude": longitude,
            "current": "wind_speed_10m,temperature_2m,precipitation",
            "hourly": "wind_speed_10m,temperature_2m,precipitation",
            "daily": "sunrise,sunset",
            "forecast_days": FORECAST_DAYS,
            "wind_speed_unit": "kmh",
            "timezone": "America/Vancouver"
        }

        weather_data = fetch_open_meteo_json(weather_url, weather_params)

        marine_data = {
            "current": {}
        }

        if not session["is_freshwater"]:
            marine_url = "https://marine-api.open-meteo.com/v1/marine"
            marine_params = {
                "latitude": marine_latitude,
                "longitude": marine_longitude,
                "current": "sea_surface_temperature",
                "hourly": "sea_surface_temperature",
                "forecast_days": FORECAST_DAYS,
                "timezone": "America/Vancouver"
            }

            marine_data = fetch_open_meteo_json(marine_url, marine_params)

        weather_hourly = weather_data["hourly"]
        daily_dates = weather_data["daily"]["time"]

        if target_date not in daily_dates:
            raise ValueError(
                f"Forecast date {target_date} is outside the available range."
            )

        daily_index = daily_dates.index(target_date)
        target_hour_indices = [
            index
            for index, time_value in enumerate(weather_hourly["time"])
            if time_value.startswith(target_date)
        ]

        if not target_hour_indices:
            raise ValueError(
                f"No hourly forecast is available for {target_date}."
            )

        noon_index = min(
            target_hour_indices,
            key=lambda index: abs(
                int(weather_hourly["time"][index][11:13]) - 12
            ),
        )
        is_today = weather_data["current"]["time"].startswith(target_date)

        session["current_time"] = (
            weather_data["current"]["time"]
            if is_today
            else weather_hourly["time"][noon_index]
        )
        session["wind_kmh"] = (
            weather_data["current"].get("wind_speed_10m")
            if is_today
            else weather_hourly["wind_speed_10m"][noon_index]
        )
        session["air_temp_c"] = (
            weather_data["current"].get("temperature_2m")
            if is_today
            else weather_hourly["temperature_2m"][noon_index]
        )
        session["precipitation_mm"] = (
            weather_data["current"].get("precipitation")
            if is_today
            else weather_hourly["precipitation"][noon_index]
        )

        marine_hourly = marine_data.get("hourly", {})
        marine_times = marine_hourly.get("time", [])
        marine_temperatures = marine_hourly.get(
            "sea_surface_temperature",
            [],
        )
        marine_noon_time = f"{target_date}T12:00"
        marine_noon_index = (
            marine_times.index(marine_noon_time)
            if marine_noon_time in marine_times
            else None
        )
        session["water_temp_c"] = (
            marine_data.get("current", {}).get("sea_surface_temperature")
            if is_today
            else (
                marine_temperatures[marine_noon_index]
                if marine_noon_index is not None
                else None
            )
        )

        session["hourly_forecast"] = {
            "time": weather_hourly["time"],
            "wind_kmh": weather_hourly["wind_speed_10m"],
            "air_temp_c": weather_hourly["temperature_2m"],
            "precipitation_mm": weather_hourly["precipitation"]
        }

        session["daily"] = {
            "date": target_date,
            "sunrise": weather_data["daily"]["sunrise"][daily_index],
            "sunset": weather_data["daily"]["sunset"][daily_index]
        }

        if session["is_freshwater"]:
            session["tides"] = {
                "status": "not_applicable",
                "station": "Freshwater site",
                "curve": [],
                "events": [],
                "message": "Tides are not applicable for this freshwater location."
            }
            session["current"] = "unknown"
        else:
            session["tides"] = fetch_tides_for_location(session)
            session["current"] = estimate_current_from_tides(session)

        return session

    except requests.RequestException as error:
        print("Could not fetch live conditions.")
        print(error)
        raise


def build_hourly_sessions(session):
    hourly = session["hourly_forecast"]
    hourly_sessions = []

    target_date = session["daily"]["date"]

    for index, time_value in enumerate(hourly["time"]):
        if not time_value.startswith(target_date):
            continue

        hourly_session = session.copy()

        hourly_session["forecast_time"] = time_value
        hourly_session["wind_kmh"] = hourly["wind_kmh"][index]
        hourly_session["air_temp_c"] = hourly["air_temp_c"][index]
        hourly_session["precipitation_mm"] = hourly["precipitation_mm"][index]

        if session.get("is_freshwater"):
            hourly_session["current"] = "unknown"
        else:
            hourly_session["current"] = estimate_current_at_time(
                session,
                hourly_session["forecast_time"]
            )

        hourly_sessions.append(hourly_session)

    return hourly_sessions
