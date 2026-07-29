from config import DEFAULT_LOCATION_ID, LOCATIONS
from weather import build_hourly_sessions, fetch_conditions_for_location


def create_session(location_id=DEFAULT_LOCATION_ID, forecast_date=None):
    location = LOCATIONS.get(location_id, LOCATIONS[DEFAULT_LOCATION_ID])

    session_input = {
        **location,
        "forecast_date": forecast_date,
    }
    session = fetch_conditions_for_location(session_input)

    session["location_id"] = location_id
    session["location"] = location["name"]
    session["region"] = location.get("region")

    return session

def build_conditions_response(session):
    hourly_sessions = build_hourly_sessions(session)

    hourly_forecast = [
        {
            "time": hourly_session["forecast_time"],
            "wind_kmh": hourly_session["wind_kmh"],
            "air_temp_c": hourly_session["air_temp_c"],
            "precipitation_mm": hourly_session["precipitation_mm"],
        }
        for hourly_session in hourly_sessions
    ]

    return {
        "location": session["location"],
        "daily": session["daily"],
        "tides": session["tides"],
        "current": {
            "water_temp_c": session["water_temp_c"],
        },
        "hourly_forecast": hourly_forecast
    }
