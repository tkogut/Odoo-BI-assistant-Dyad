from typing import Any, Dict, Optional


class MemoryManager:
    """
    Very small in-memory store used as a placeholder for
    agent memory. Not persistent — just a process-local dict.
    """

    def __init__(self) -> None:
        self._store: Dict[str, Any] = {}

    def set(self, key: str, value: Any) -> None:
        """Store a value under `key`."""
        self._store[key] = value

    def get(self, key: str, default: Optional[Any] = None) -> Any:
        """Retrieve a stored value or default if missing."""
        return self._store.get(key, default)

    def delete(self, key: str) -> bool:
        """Delete a key. Returns True if deleted, False if not present."""
        return self._store.pop(key, None) is not None

    def clear(self) -> None:
        """Clear all stored memory."""
        self._store.clear()

    def keys(self):
        """Return list of keys currently stored."""
        return list(self._store.keys())