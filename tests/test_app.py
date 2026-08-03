import json
import unittest
from datetime import datetime, timedelta
from pathlib import Path
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
        self.assertNotIn(b"cdn.jsdelivr.net", page.data)
        self.assertIn(
            b"/static/vendor/bootstrap/bootstrap.min.css",
            page.data,
        )
        self.assertIn(
            b"/static/vendor/chart.js/chart.umd.min.js",
            page.data,
        )
        self.assertIn(
            (
                b"/static/vendor/chartjs-adapter-date-fns/"
                b"chartjs-adapter-date-fns.bundle.min.js"
            ),
            page.data,
        )

        project_root = Path(app_module.app.root_path)
        vendor_files = (
            "static/vendor/bootstrap/bootstrap.min.css",
            "static/vendor/bootstrap/LICENSE",
            "static/vendor/chart.js/chart.umd.min.js",
            "static/vendor/chart.js/LICENSE.md",
            (
                "static/vendor/chartjs-adapter-date-fns/"
                "chartjs-adapter-date-fns.bundle.min.js"
            ),
            "static/vendor/chartjs-adapter-date-fns/LICENSE.md",
        )
        for relative_path in vendor_files:
            with self.subTest(relative_path=relative_path):
                self.assertTrue((project_root / relative_path).is_file())

        health = self.client.get("/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.get_json(), {"status": "ok"})

        ready = self.client.get("/ready")
        self.assertEqual(ready.status_code, 200)
        self.assertEqual(ready.get_json(), {"status": "ready"})

    def test_responses_include_request_ids_and_structured_logs(self):
        with self.assertLogs(app_module.app.logger, level="INFO") as logs:
            response = self.client.get("/health")

        request_id = response.headers["X-Request-ID"]
        self.assertEqual(len(request_id), 32)
        record = json.loads(logs.output[-1].split(":", 2)[2])
        self.assertEqual(record["event"], "request_completed")
        self.assertEqual(record["request_id"], request_id)
        self.assertEqual(record["method"], "GET")
        self.assertEqual(record["path"], "/health")
        self.assertEqual(record["status"], 200)
        self.assertIsInstance(record["duration_ms"], (int, float))
        self.assertIsNone(record["cache"])

    def test_responses_include_embed_compatible_security_headers(self):
        response = self.client.get("/")

        policy = response.headers["Content-Security-Policy"]
        self.assertIn("default-src 'self'", policy)
        self.assertIn("script-src 'self'", policy)
        self.assertNotIn("cdn.jsdelivr.net", policy)
        self.assertIn("frame-ancestors *", policy)
        self.assertEqual(
            response.headers["Permissions-Policy"],
            "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
        )
        self.assertEqual(
            response.headers["Referrer-Policy"],
            "strict-origin-when-cross-origin",
        )
        self.assertEqual(
            response.headers["X-Content-Type-Options"],
            "nosniff",
        )
        self.assertNotIn("X-Frame-Options", response.headers)

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
                self.assertEqual(len(response.headers["X-Request-ID"]), 32)

    def test_provider_failure_log_contains_safe_diagnostic_fields(self):
        with patch(
            "app.fetch_temperature_summary",
            side_effect=requests.Timeout("secret provider details"),
        ), self.assertLogs(app_module.app.logger, level="WARNING") as logs:
            response = self.client.get(
                "/api/temperatures"
                f"?location=whytecliff&date={self.today_string}",
            )

        failure_record = next(
            json.loads(line.split(":", 2)[2])
            for line in logs.output
            if "provider_request_failed" in line
        )
        self.assertEqual(response.status_code, 502)
        self.assertEqual(failure_record["event"], "provider_request_failed")
        self.assertEqual(failure_record["source"], "Temperature")
        self.assertEqual(failure_record["error_type"], "Timeout")
        self.assertEqual(
            failure_record["request_id"],
            response.headers["X-Request-ID"],
        )
        self.assertNotIn("secret provider details", logs.output[0])


if __name__ == "__main__":
    unittest.main()
