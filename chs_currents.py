import requests

CHS_BASE_URL = "https://api-iwls.dfo-mpo.gc.ca/api/v1"
REQUEST_TIMEOUT_SECONDS = 10
MPS_TO_KNOTS = 1.943844

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
