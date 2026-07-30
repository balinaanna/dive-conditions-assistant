import time
from threading import Event, Lock


class TTLCache:
    def __init__(
        self,
        ttl_seconds,
        max_entries=64,
        clock=time.monotonic,
    ):
        if ttl_seconds <= 0:
            raise ValueError("ttl_seconds must be greater than zero")
        if max_entries <= 0:
            raise ValueError("max_entries must be greater than zero")

        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self._clock = clock
        self._entries = {}
        self._pending = {}
        self._lock = Lock()

    def _cached_value(self, key, now):
        entry = self._entries.get(key)
        if entry is None:
            return None

        expires_at, value = entry
        if expires_at <= now:
            self._entries.pop(key, None)
            return None

        return value

    def _purge_expired(self, now):
        expired_keys = [
            key
            for key, (expires_at, _) in self._entries.items()
            if expires_at <= now
        ]
        for key in expired_keys:
            self._entries.pop(key, None)

    def _store(self, key, value, now):
        self._purge_expired(now)

        if key not in self._entries and len(self._entries) >= self.max_entries:
            oldest_key = min(
                self._entries,
                key=lambda candidate: self._entries[candidate][0],
            )
            self._entries.pop(oldest_key, None)

        self._entries[key] = (now + self.ttl_seconds, value)

    def get_or_load(self, key, loader):
        while True:
            with self._lock:
                cached = self._cached_value(key, self._clock())
                if cached is not None:
                    return cached, True

                pending = self._pending.get(key)
                if pending is None:
                    pending = Event()
                    self._pending[key] = pending
                    should_load = True
                else:
                    should_load = False

            if should_load:
                break

            pending.wait()

        try:
            value = loader()
        except Exception:
            with self._lock:
                self._pending.pop(key, None)
                pending.set()
            raise

        with self._lock:
            self._store(key, value, self._clock())
            self._pending.pop(key, None)
            pending.set()

        return value, False

    def clear(self):
        with self._lock:
            self._entries.clear()
