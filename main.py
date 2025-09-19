import os
import json
import asyncio
from typing import Any, Dict, List, Optional
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Relay Mock")

RELAY_API_KEY = os.getenv('RELAY_API_KEY', 'mockkey')

# FRONTEND_ORIGIN can be a comma-separated list of allowed frontend origins.
# Default includes common dev ports plus the one reported by your browser.
FRONTEND_ORIGIN = os.getenv(
    'FRONTEND_ORIGIN',
    'http://localhost:3000,http://localhost:5173,http://localhost:8000,http://localhost:8080,http://localhost:32100'
)

# Build a de-duplicated list of allowed origins from the env var
ALLOWED_ORIGINS = []
for part in (FRONTEND_ORIGIN or "").split(","):
    p = part.strip()
    if p and p not in ALLOWED_ORIGINS:
        ALLOWED_ORIGINS.append(p)

# Always include localhost origins commonly used in development just in case
for fallback in ["http://localhost:3000", "http://localhost:5173", "http://localhost:8000", "http://localhost:8080", "http://localhost:32100"]:
    if fallback not in ALLOWED_ORIGINS:
        ALLOWED_ORIGINS.append(fallback)

# Debug: print allowed origins so you can verify on startup
print(f"[DEBUG] CORS allowed origins: {ALLOWED_ORIGINS}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory API key store for admin endpoints and quota enforcement
import uuid
from datetime import datetime

API_KEYS = {}

def today_str():
    return datetime.utcnow().strftime('%Y%m%d')

def require_master(x_api_key: Optional[str]):
    if x_api_key != RELAY_API_KEY:
        raise HTTPException(status_code=401, detail='Unauthorized')


class ExecuteMethodRequest(BaseModel):
    model: str
    method: str
    args: Optional[List[Any]] = []
    kwargs: Optional[Dict[str, Any]] = {}


@app.post('/api/execute_method')
async def execute_method(payload: ExecuteMethodRequest, x_api_key: Optional[str] = Header(None)):
    """Mock execute method endpoint. Requires X-API-Key header matching RELAY_API_KEY."""
    # Debug: log incoming key and known keys
    print(f"[DEBUG] execute_method called with x_api_key={x_api_key}")
    print(f"[DEBUG] known API_KEYS={list(API_KEYS.keys())}")
    # Accept master key or any created API key
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if x_api_key != RELAY_API_KEY and x_api_key not in API_KEYS:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Return a predictable mock result
    # Quota enforcement: if a key has quota_per_day set, enforce it
    key = x_api_key or 'anonymous'
    API_KEYS.setdefault(key, {'owner': key, 'quota_per_day': None, 'usage': {}})
    quota = API_KEYS[key].get('quota_per_day')
    today = today_str()
    current_usage = API_KEYS[key]['usage'].get(today, 0)
    if quota is not None:
        try:
            q = int(quota)
        except Exception:
            q = None
        if q is not None and current_usage >= q:
            # quota exceeded
            raise HTTPException(status_code=429, detail='Daily quota exceeded')
    # increment usage
    API_KEYS[key]['usage'][today] = current_usage + 1

    result = [{
        "model": payload.model,
        "method": payload.method,
        "args": payload.args,
        "kwargs": payload.kwargs,
    }]
    return {"success": True, "result": result}


@app.options('/api/execute_method')
async def execute_method_options(origin: Optional[str] = Header(None)):
    # Helpful for frontend preflight inspection
    return {
        "allowed_origin": FRONTEND_ORIGIN,
        "received_origin": origin,
        "allowed_methods": ["POST", "OPTIONS"],
        "allowed_headers": ["Content-Type", "X-API-Key"],
    }


@app.websocket('/ws/ai-chat')
async def ai_chat_ws(websocket: WebSocket):
    """Simple mock WebSocket that streams three JSON chunks then closes.

    Accepts query parameter `api_key` or header `x-api-key` (if provided by client).
    """
    await websocket.accept()
    # Read api_key from query params first, then headers as fallback
    api_key = websocket.query_params.get('api_key')
    if not api_key:
        # headers supports .get
        api_key = websocket.headers.get('x-api-key')

    # Accept if query param matches or header matches the configured key
    allowed_keys = {RELAY_API_KEY, 'mockkey'}
    if api_key not in allowed_keys:
        # send an explicit unauthorized message for debugging and close
        try:
            await websocket.send_text(json.dumps({"error": "unauthorized", "received_api_key": api_key, "expected": RELAY_API_KEY}))
        except Exception:
            pass
        await websocket.close(code=1008)
        return

    try:
        chunks = [
            {"type": "message", "text": "Hello — I am a mock AI assistant."},
            {"type": "message", "text": "This is chunk 2: processing results..."},
            {"type": "message", "text": "Final chunk: done."},
        ]
        for c in chunks:
            await websocket.send_text(json.dumps(c))
            await asyncio.sleep(0.4)
    except WebSocketDisconnect:
        return
    await websocket.close()


# Admin endpoints (in-memory)
class CreateKeyRequest(BaseModel):
    owner: str
    quota_per_day: Optional[int] = None


@app.post('/admin/create_key')
async def admin_create_key(payload: CreateKeyRequest, x_api_key: Optional[str] = Header(None)):
    require_master(x_api_key)
    new_key = uuid.uuid4().hex
    API_KEYS[new_key] = {'owner': payload.owner, 'quota_per_day': payload.quota_per_day, 'usage': {}}
    return {'api_key': new_key, 'owner': payload.owner, 'quota_per_day': payload.quota_per_day}


@app.get('/admin/keys')
async def admin_list_keys(x_api_key: Optional[str] = Header(None)):
    require_master(x_api_key)
    out = []
    for k, v in API_KEYS.items():
        out.append({'key': k, 'owner': v.get('owner'), 'quota_per_day': v.get('quota_per_day')})
    return {'keys': out}


@app.post('/admin/update_key/{api_key}')
async def admin_update_key(api_key: str, payload: CreateKeyRequest, x_api_key: Optional[str] = Header(None)):
    require_master(x_api_key)
    if api_key not in API_KEYS:
        raise HTTPException(status_code=404, detail='not found')
    API_KEYS[api_key]['quota_per_day'] = payload.quota_per_day
    return {'api_key': api_key, 'quota_per_day': payload.quota_per_day}


@app.post('/admin/delete_key/{api_key}')
async def admin_delete_key(api_key: str, x_api_key: Optional[str] = Header(None)):
    require_master(x_api_key)
    API_KEYS.pop(api_key, None)
    return {'deleted': True}



@app.get('/')
async def root_health():
    return {"status": "ok"}


if __name__ == '__main__':
    import uvicorn
    uvicorn.run('main:app', host='0.0.0.0', port=8001, reload=True)