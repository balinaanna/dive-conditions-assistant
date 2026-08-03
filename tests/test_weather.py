import unittest
from unittest.mock import patch

from weather import fetch_temperature_summary


class WeatherTests(unittest.TestCase):
    @patch("weather.fetch_open_meteo_json")
    def test_temperature_summary_only_requests_marine_water_data(self, fetch):
        fetch.return_value = {
            "current": {
                "time": "2026-08-02T12:00",
                "sea_surface_temperature": 18.4,
            },
            "hourly": {
                "time": ["2026-08-02T12:00"],
                "sea_surface_temperature": [18.4],
            },
        }

        result = fetch_temperature_summary(
            {
                "latitude": 49.3729,
                "longitude": -123.2909,
                "marine_latitude": 49.375,
                "marine_longitude": -123.2917,
            },
            "2026-08-02",
        )

        self.assertEqual(result, {"water_temp_c": 18.4})
        self.assertIn("marine-api.open-meteo.com", fetch.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
