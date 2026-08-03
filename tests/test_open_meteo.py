import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock, patch

import requests

from open_meteo import OPEN_METEO_CACHE, fetch_open_meteo_json


class OpenMeteoClientTests(unittest.TestCase):
    def setUp(self):
        OPEN_METEO_CACHE.clear()

    @patch("open_meteo.time.sleep")
    @patch("open_meteo.requests.get")
    def test_retries_rate_limit_with_bounded_backoff(self, request_get, sleep):
        limited = Mock(status_code=429, headers={"Retry-After": "20"})
        limited.raise_for_status.side_effect = requests.HTTPError()
        successful = Mock(status_code=200, headers={})
        successful.raise_for_status.return_value = None
        successful.json.return_value = {"hourly": {"time": []}}
        request_get.side_effect = [limited, successful]

        result = fetch_open_meteo_json("https://weather.test", {"a": 1})

        self.assertEqual(result, {"hourly": {"time": []}})
        self.assertEqual(request_get.call_count, 2)
        sleep.assert_called_once_with(2)

    @patch("open_meteo.requests.get")
    def test_identical_concurrent_requests_share_one_upstream_call(
        self,
        request_get,
    ):
        response = Mock(status_code=200, headers={})
        response.raise_for_status.return_value = None
        response.json.return_value = {"value": 12}
        request_get.return_value = response

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(
                lambda _: fetch_open_meteo_json(
                    "https://weather.test",
                    {"latitude": 49.3},
                ),
                range(2),
            ))

        self.assertEqual(results, [{"value": 12}, {"value": 12}])
        request_get.assert_called_once()


if __name__ == "__main__":
    unittest.main()
