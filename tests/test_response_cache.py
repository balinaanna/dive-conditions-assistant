import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Event, Lock

from response_cache import TTLCache


class TTLCacheTests(unittest.TestCase):
    def test_value_is_reused_until_ttl_expires(self):
        current_time = [100.0]
        calls = []
        cache = TTLCache(
            ttl_seconds=15,
            clock=lambda: current_time[0],
        )

        def load():
            calls.append(True)
            return {"version": len(calls)}

        first, first_hit = cache.get_or_load("forecast", load)
        second, second_hit = cache.get_or_load("forecast", load)

        self.assertEqual(first, {"version": 1})
        self.assertEqual(second, first)
        self.assertFalse(first_hit)
        self.assertTrue(second_hit)
        self.assertEqual(len(calls), 1)

        current_time[0] += 16
        third, third_hit = cache.get_or_load("forecast", load)

        self.assertEqual(third, {"version": 2})
        self.assertFalse(third_hit)
        self.assertEqual(len(calls), 2)

    def test_simultaneous_requests_share_one_loader(self):
        cache = TTLCache(ttl_seconds=15)
        loader_started = Event()
        release_loader = Event()
        calls_lock = Lock()
        calls = 0

        def load():
            nonlocal calls
            with calls_lock:
                calls += 1
            loader_started.set()
            release_loader.wait(timeout=2)
            return {"status": "loaded"}

        with ThreadPoolExecutor(max_workers=2) as executor:
            first_future = executor.submit(
                cache.get_or_load,
                "forecast",
                load,
            )
            self.assertTrue(loader_started.wait(timeout=2))
            second_future = executor.submit(
                cache.get_or_load,
                "forecast",
                load,
            )
            release_loader.set()
            first = first_future.result(timeout=2)
            second = second_future.result(timeout=2)

        self.assertEqual(calls, 1)
        self.assertEqual(first[0], {"status": "loaded"})
        self.assertEqual(second[0], {"status": "loaded"})
        self.assertEqual({first[1], second[1]}, {False, True})

    def test_failed_load_is_not_cached(self):
        cache = TTLCache(ttl_seconds=15)
        calls = 0

        def load():
            nonlocal calls
            calls += 1
            if calls == 1:
                raise RuntimeError("temporary failure")
            return "recovered"

        with self.assertRaisesRegex(RuntimeError, "temporary failure"):
            cache.get_or_load("forecast", load)

        value, cache_hit = cache.get_or_load("forecast", load)

        self.assertEqual(value, "recovered")
        self.assertFalse(cache_hit)
        self.assertEqual(calls, 2)

    def test_cache_is_bounded(self):
        cache = TTLCache(ttl_seconds=15, max_entries=2)

        cache.get_or_load("first", lambda: 1)
        cache.get_or_load("second", lambda: 2)
        cache.get_or_load("third", lambda: 3)

        second, second_hit = cache.get_or_load("second", lambda: 20)
        third, third_hit = cache.get_or_load("third", lambda: 30)
        _, first_hit = cache.get_or_load("first", lambda: 10)

        self.assertEqual(second, 2)
        self.assertEqual(third, 3)
        self.assertTrue(second_hit)
        self.assertTrue(third_hit)
        self.assertFalse(first_hit)


if __name__ == "__main__":
    unittest.main()
