"""The agents service. Each lane owns its router; this file only mounts them."""
import logging

from fastapi import BackgroundTasks, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agents.inbound.routes import router as inbound_router
from agents.manager.routes import router as manager_router
from agents.outbound.routes import router as outbound_router
from agents.tasks import run_pending

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Royal Pawz AI employee")
# Production traffic arrives through the Next.js rewrite; CORS is for local tools only.
app.add_middleware(CORSMiddleware, allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
                   allow_methods=["*"], allow_headers=["*"])

app.include_router(inbound_router)   # POST /sms
app.include_router(outbound_router)  # POST /outbound/find, /outbound/draft, /outbound/send
app.include_router(manager_router)   # POST /manager


@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/tasks/run")
async def tasks_run(background: BackgroundTasks):
    background.add_task(run_pending)
    return {"ok": True}
