"""
Relay helper stubs and small utilities.

This module purposefully provides a couple of small helpers that higher-level
relay code or unit tests can import. Keep it minimal and safe for the mock relay.
"""
from typing import Any, Dict, Optional
from .memory_manager import MemoryManager

# Simple shared memory manager instance for in-process use.
_shared_memory: Optional[MemoryManager] = None


def get_memory_manager() -> MemoryManager:
    global _shared_memory
    if _shared_memory is None:
        _shared_memory = MemoryManager()
    return _shared_memory


def store_agent_state(agent_id: str, data: Dict[str, Any]) -> None:
    """
    Convenience wrapper to persist an agent's small state inside the in-memory manager.
    """
    mm = get_memory_manager()
    mm.set(f"agent:{agent_id}:state", data)


def load_agent_state(agent_id: str) -> Optional[Dict[str, Any]]:
    mm = get_memory_manager()
    return mm.get(f"agent:{agent_id}:state")