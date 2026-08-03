"""Shared, cached Open-Meteo client with bounded transient retries."""

import os
import time

import requests

from response_cache import TTLCache


REQUEST_TIMEOUT_SECONDS = 10
MAX_ATTEMPTS = 3
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
RETRY_DELAYS_SECONDS = (0.25, 0.75)

OPEN_METEO_CACHE = TTLCache(
    ttl_seconds=int(os.getenv("PROVIDER_CACHE_TTL_SECONDS", "900")),
    max_entries=int(os.getenv("PROVIDER_CACHE_MAX_ENTRIES", "32")),
)


def _cache_key(url, params):
    normalized_params = tuple(
        sorted((key, str(value)) for key, value in params.items())
    )
    return url, normalized_params


def _retry_delay(response, attempt):
    retry_after = response.headers.get("Retry-After")
    if retry_after:
        try:
            return min(max(float(retry_after), 0), 2)
        except ValueError:
            pass
    return RETRY_DELAYS_SECONDS[attempt]


def _load_json(url, params):
    for attempt in range(MAX_ATTEMPTS):
        response = requests.get(
            url,
            params=params,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        if (
            response.status_code in RETRYABLE_STATUS_CODES
            and attempt < MAX_ATTEMPTS - 1
        ):
            time.sleep(_retry_delay(response, attempt))
            continue

        response.raise_for_status()
        return response.json()

    raise RuntimeError("Open-Meteo retry loop completed without a response.")


def fetch_open_meteo_json(url, params):
    payload, _ = OPEN_METEO_CACHE.get_or_load(
        _cache_key(url, params),
        lambda: _load_json(url, params),
    )
    return payload
