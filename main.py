import os
import json
import asyncio
import logging
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse, urlunparse, urlencode

import httpx
import websockets

from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, JSONResponse, Response
from pydantic import BaseModel

# Local helpers (in-repo)
from backend import observability as observability  # simple metrics helpers
from backend.relay_api import get_memory_manager  # memory manager stub

# Basic logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("relay-proxy")

# Environment configuration
RELAY_API_KEY = os.getenv("RELAY_API_KEY", "super_rooster")
RELAY_UPSTREAM = os.getenv("RELAY_UPSTREAM")
if not RELAY_UPSTREAM:
    raise RuntimeError("RELAY_UPSTREAM must be set for proxy mode (e.g. http://localhost:8001)")

RELAY_PORT = int(os.getenv("RELAY_PORT", os.getenv("PORT", "8000")))
FRONTEND_ORIGIN = os.getenv(
    "FRONTEND_ORIGIN",
    "http://localhost:3000,http://localhost:5173,http://localhost:8000,http://localhost:8080,http://localhost:32100",
)

# Build a de-duplicated list of allowed origins
ALLOWED_ORIGINS: List[str] = []
for part in (FRONTEND_ORIGIN or "").split(","):
    p = part.strip()
    if p and p not in ALLOWED_ORIGINS:
        ALLOWED_ORIGINS.append(p)

# Ensure common fallbacks
for fallback in [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8000",
    "http://localhost:8080",
    "http://localhost:32100",
]:
    if fallback not in ALLOWED_ORIGINS:
        ALLOWED_ORIGINS.append(fallback)

logger.info("CORS allowed origins: %s", ALLOWED_ORIGINS)
logger.info("Proxying requests to RELAY_UPSTREAM=%s", RELAY_UPSTREAM)

app = FastAPI(title="Relay Proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_memory = get_memory_manager()

# Utility: filter hop-by-hop headers that should not be forwarded back to client
HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "content-length",
}


def require_master(x_api_key: Optional[str]):
    if x_api_key != RELAY_API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


class ExecuteMethodRequest(BaseModel):
    model: str
    method: str
    args: Optional[List[Any]] = []
    kwargs: Optional[Dict[str, Any]] = {}


@app.on_event("startup")
async def on_startup():
    logger.info("Relay proxy starting up (port=%s)", RELAY_PORT)


@app.on_event("shutdown")
async def on_shutdown():
    logger.info("Relay proxy shutting down")


# --- Proxy for /api/execute_method (OPTIONS + POST) ---
@app.api_route("/api/execute_method", methods=["OPTIONS", "POST"])
async def proxy_execute_method(request: Request, x_api_key: Optional[str] = Header(None)):
    """
    Forward OPTIONS and POST to the configured RELAY_UPSTREAM /api/execute_method endpoint.
    Preserves key headers like Origin and X-API-Key and returns upstream's response status/content.
    """
    upstream_url = RELAY_UPSTREAM.rstrip("/") + "/api/execute_method"

    # Build headers to forward — include common CORS preflight headers and the API key
    incoming = {k.lower(): v for k, v in request.headers.items()}
    headers_to_send = {}
    if "origin" in incoming:
        headers_to_send["Origin"] = incoming["origin"]
    if "access-control-request-method" in incoming:
        headers_to_send["Access-Control-Request-Method"] = incoming["access-control-request-method"]
    if "access-control-request-headers" in incoming:
        headers_to_send["Access-Control-Request-Headers"] = incoming["access-control-request-headers"]
    # Content-Type for POST
    if incoming.get("content-type"):
        headers_to_send["Content-Type"] = incoming["content-type"]
    # Forward X-API-Key if present (explicitly)
    if x_api_key:
        headers_to_send["X-API-Key"] = x_api_key

    logger.debug("Proxying %s %s to upstream %s headers=%s", request.method, request.url.path, upstream_url, headers_to_send)

    async with httpx.AsyncClient() as client:
        if request.method == "OPTIONS":
            try:
                resp = await client.options(upstream_url, headers=headers_to_send, timeout=10.0)
            except httpx.HTTPError as e:
                logger.warning("Upstream OPTIONS failed: %s", e)
                raise HTTPException(status_code=502, detail="Upstream OPTIONS failed")
            # Forward relevant headers (filter hop-by-hop)
            out_headers = {k: v for k, v in resp.headers.items() if k.lower() not in HOP_BY_HOP}
            return Response(status_code=resp.status_code, headers=out_headers, content=resp.content)
        else:
            body = await request.body()
            try:
                resp = await client.post(upstream_url, headers=headers_to_send, content=body, timeout=30.0)
            except httpx.HTTPError as e:
                logger.warning("Upstream POST failed: %s", e)
                raise HTTPException(status_code=502, detail="Upstream POST failed")
            out_headers = {k: v for k, v in resp.headers.items() if k.lower() not in HOP_BY_HOP}
            return Response(status_code=resp.status_code, headers=out_headers, content=resp.content)


# --- Proxy for WebSocket /ws/ai-chat ---
@app.websocket("/ws/ai-chat")
async def proxy_ws(websocket: WebSocket):
    """
    Accept a client WebSocket and proxy messages bidirectionally to the upstream websocket
    at RELAY_UPSTREAM/ws/ai-chat. Query params and X-API-Key are forwarded where appropriate.
    """
    await websocket.accept()
    incoming_query = dict(websocket.query_params)
    incoming_headers = {k.lower(): v for k, v in websocket.headers.items()}

    # Build upstream ws URL (ws:// or wss://)
    parsed = urlparse(RELAY_UPSTREAM)
    ws_scheme = "wss" if parsed.scheme == "https" else "ws"
    netloc = parsed.netloc
    upstream_path = "/ws/ai-chat"

    # Merge query params: preserve incoming and attach api_key if header present
    qparams = incoming_query.copy()
    # Prefer explicit api_key param if provided by client, else use x-api-key header
    if "api_key" not in qparams and "x-api-key" in incoming_headers:
        qparams["api_key"] = incoming_headers["x-api-key"]

    query_string = ("?" + urlencode(qparams)) if qparams else ""
    upstream_ws_url = urlunparse((ws_scheme, netloc, upstream_path, "", urlencode(qparams), ""))

    logger.info("Proxying WS client -> upstream: %s", upstream_ws_url)

    # Create connection to upstream websocket
    try:
        async with websockets.connect(upstream_ws_url) as upstream_ws:
            # Tasks to relay messages between client and upstream
            async def from_upstream():
                try:
                    async for message in upstream_ws:
                        # websockets lib yields str (text) or bytes
                        if isinstance(message, (bytes, bytearray)):
                            try:
                                await websocket.send_bytes(message)
                            except Exception:
                                # client likely disconnected
                                await upstream_ws.close()
                                break
                        else:
                            try:
                                await websocket.send_text(message)
                            except Exception:
                                await upstream_ws.close()
                                break
                except websockets.ConnectionClosed:
                    pass
                except Exception as e:
                    logger.debug("Error receiving from upstream WS: %s", e)
                finally:
                    # ensure client closed
                    try:
                        await websocket.close()
                    except Exception:
                        pass

            async def from_client():
                try:
                    while True:
                        data = await websocket.receive()
                        t = data.get("type")
                        if t == "websocket.disconnect":
                            # client requested disconnect
                            try:
                                await upstream_ws.close()
                            except Exception:
                                pass
                            break
                        if "text" in data and data["text"] is not None:
                            try:
                                await upstream_ws.send(data["text"])
                            except Exception:
                                break
                        elif "bytes" in data and data["bytes"] is not None:
                            try:
                                await upstream_ws.send(data["bytes"])
                            except Exception:
                                break
                except WebSocketDisconnect:
                    try:
                        await upstream_ws.close()
                    except Exception:
                        pass
                except Exception as e:
                    logger.debug("Error receiving from client WS: %s", e)
                    try:
                        await upstream_ws.close()
                    except Exception:
                        pass

            await asyncio.gather(from_upstream(), from_client())
    except Exception as e:
        logger.warning("Failed to connect to upstream WebSocket: %s", e)
        try:
            # Inform client of failure before closing
            await websocket.send_text(json.dumps({"type": "error", "error": "upstream_connection_failed"}))
        except Exception:
            pass
        try:
            await websocket.close()
        except Exception:
            pass


# --- Health and metrics endpoints remain local ---
@app.api_route("/", methods=["GET", "HEAD"])
async def root_health():
    return JSONResponse(content={"status": "ok"})


@app.get("/metrics")
async def metrics_get():
    text = observability.get_metrics_text()
    return PlainTextResponse(content=text, media_type="text/plain; version=0.0.4")