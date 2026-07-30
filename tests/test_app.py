import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

import requests

import app as app_module


class AppRouteTests(unittest.TestCase):
    def setUp(self):
        app_module.app.config.update(TESTING=True)
        app_module.FORECAST_RESPONSE_CACHE.clear()
        self.client = app_module.app.test_client()
        self.today = datetime.now(app_module.LOCAL_TIMEZONE).date()
        self.today_string = self.today.isoformat()

    def test_page_and_health_routes(self):
        page = self.client.get("/")
        self.assertEqual(page.status_code, 200)
        self.assertIn(b"conditionsSection", page.data)

        health = self.client.get("/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.get_json(), {"status": "ok"})

        ready = self.client.get("/ready")
        self.assertEqual(ready.status_code, 200)
        self.assertEqual(ready.get_json(), {"status": "ready"})

    def test_forecast_routes_reject_invalid_dates(self):
        paths = (
            "/api/chs-current-speed",
            "/api/conditions?location=whytecliff",
            "/api/temperatures?location=whytecliff",
        )

        for path in paths:
            separator = "&" if "?" in path else "?"
            with self.subTest(path=path):
                response = self.client.get(f"{path}{separator}date=not-a-date")
                self.assertEqual(response.status_code, 400)
                self.assertEqual(
                    response.get_json(),
                    {"error": "Invalid date format. Use YYYY-MM-DD."},
                )

    def test_forecast_routes_reject_dates_outside_seven_day_range(self):
        outside_date = (self.today + timedelta(days=7)).isoformat()
        paths = (
            "/api/chs-current-speed",
            "/api/conditions?location=whytecliff",
            "/api/temperatures?location=whytecliff",
        )

        for path in paths:
            separator = "&" if "?" in path else "?"
            with self.subTest(path=path):
                response = self.client.get(
                    f"{path}{separator}date={outside_date}",
                )
                self.assertEqual(response.status_code, 400)
                self.assertEqual(
                    response.get_json(),
                    {"error": "Date must be within the 7-day forecast."},
                )

    def test_location_routes_reject_unknown_locations(self):
        for route in ("/api/conditions", "/api/temperatures"):
            with self.subTest(route=route):
                response = self.client.get(
                    f"{route}?location=missing&date={self.today_string}",
                )
                self.assertEqual(response.status_code, 404)
                self.assertEqual(
                    response.get_json(),
                    {"error": "Unknown location."},
                )

    @patch("app.fetch_chs_time_series")
    def test_current_endpoint_formats_provider_events(self, fetch_series):
        fetch_series.return_value = [
            {
                "eventDate": f"{self.today_string}T12:00:00Z",
                "qualifier": "SLACK",
                "value": 0,
            },
        ]

        response = self.client.get(
            f"/api/chs-current-speed?date={self.today_string}",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["source"], "CHS")
        self.assertEqual(payload["unit"], "kn")
        self.assertEqual(payload["points"][0]["speed"], 0)
        self.assertEqual(response.headers["X-Cache"], "MISS")

    @patch("app.build_conditions_response")
    @patch("app.create_session")
    def test_conditions_endpoint_returns_normalized_response(
        self,
        create_session,
        build_response,
    ):
        create_session.return_value = {"location": "Whytecliff Park"}
        build_response.return_value = {
            "location": "Whytecliff Park",
            "daily": {"date": self.today_string},
        }

        response = self.client.get(
            "/api/conditions"
            f"?location=whytecliff&date={self.today_string}",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), build_response.return_value)
        self.assertEqual(response.headers["X-Cache"], "MISS")
        create_session.assert_called_once_with(
            "whytecliff",
            self.today_string,
        )

    @patch("app.fetch_temperature_summary")
    def test_temperature_endpoint_returns_summary(self, fetch_summary):
        fetch_summary.return_value = {
            "air_temp_c": 18.5,
            "water_temp_c": 12.4,
        }

        response = self.client.get(
            "/api/temperatures"
            f"?location=whytecliff&date={self.today_string}",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["location"], "Whytecliff Park")
        self.assertEqual(payload["water_temp_c"], 12.4)
        self.assertEqual(response.headers["X-Cache"], "MISS")

    @patch("app.build_conditions_response")
    @patch("app.create_session")
    def test_successful_api_response_is_cached(
        self,
        create_session,
        build_response,
    ):
        create_session.return_value = {"location": "Whytecliff Park"}
        build_response.return_value = {
            "location": "Whytecliff Park",
            "daily": {"date": self.today_string},
        }
        path = (
            "/api/conditions"
            f"?location=whytecliff&date={self.today_string}"
        )

        first = self.client.get(path)
        second = self.client.get(path)

        self.assertEqual(first.headers["X-Cache"], "MISS")
        self.assertEqual(second.headers["X-Cache"], "HIT")
        self.assertEqual(first.get_json(), second.get_json())
        create_session.assert_called_once()
        build_response.assert_called_once()

    def test_provider_timeouts_return_structured_502_responses(self):
        cases = (
            (
                "app.fetch_chs_time_series",
                f"/api/chs-current-speed?date={self.today_string}",
                "Current",
            ),
            (
                "app.create_session",
                "/api/conditions"
                f"?location=whytecliff&date={self.today_string}",
                "Conditions",
            ),
            (
                "app.fetch_temperature_summary",
                "/api/temperatures"
                f"?location=whytecliff&date={self.today_string}",
                "Temperature",
            ),
        )

        for target, path, source in cases:
            with self.subTest(path=path), patch(
                target,
                side_effect=requests.Timeout("provider timeout"),
            ):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 502)
                self.assertEqual(
                    response.get_json(),
                    {
                        "error": (
                            f"{source} data is temporarily unavailable."
                        ),
                    },
                )


if __name__ == "__main__":
    unittest.main()
