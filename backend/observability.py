from typing import Dict
from threading import Lock

# Simple in-process counters. This is intentionally tiny — suitable for local/dev relay mocks.
# For production you'd integrate with Prometheus, StatsD, or similar.

_metrics_lock = Lock()
_metrics: Dict[str, int] = {
    "api_calls_total": 0,
    "ws_connections_total": 0,
}


def increment_api_calls(amount: int = 1) -> None:
    with _metrics_lock:
        _metrics["api_calls_total"] += int(amount)


def increment_ws_connections(amount: int = 1) -> None:
    with _metrics_lock:
        _metrics["ws_connections_total"] += int(amount)


def get_metrics_text() -> str:
    """
    Return metrics in a simple Prometheus exposition format (text/plain).
    Consumers (like Prometheus) can scrape this endpoint.
    """
    with _metrics_lock:
        lines = [
            "# HELP relay_api_calls_total Number of /api/execute_method calls received",
            "# TYPE relay_api_calls_total counter",
            f"relay_api_calls_total {_metrics['api_calls_total']}",
            "",
            "# HELP relay_ws_connections_total Number of WebSocket connections accepted",
            "# TYPE relay_ws_connections_total counter",
            f"relay_ws_connections_total {_metrics['ws_connections_total']}",
            "",
        ]
    return "\n".join(lines)