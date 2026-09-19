"""The agents service. Each lane owns its router; this file mounts them and manages lifecycle."""
import logging
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agents.inbound.routes import router as inbound_router
from agents.manager.routes import router as manager_router
from agents.outbound.routes import router as outbound_router
from agents.runtime.manager_runner import runner as manager_runner
from agents.tasks import run_pending

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.info("Starting up manager runner lifecycle...")
    try:
        await manager_runner.start()
    except Exception as exc:
        logging.error("Failed to start manager runner: %s", exc)
        await manager_runner.stop()
        manager_runner.last_error = str(exc)

    yield

    logging.info("Shutting down manager runner lifecycle...")
    try:
        await manager_runner.stop()
    except Exception as exc:
        logging.error("Error shutting down manager runner: %s", exc)


app = FastAPI(title="Royal Pawz AI employee", lifespan=lifespan)
# Production traffic arrives through the Next.js rewrite; CORS is for local tools only.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(inbound_router)   # POST /sms
app.include_router(outbound_router)  # POST /outbound/find, /outbound/draft, /outbound/send
app.include_router(manager_router)   # GET/POST /manager, POST /manager/approvals/{id}


@app.get("/health")
async def health():
    return {"ok": True, "manager": manager_runner.status_summary()}


@app.post("/tasks/run")
async def tasks_run(background: BackgroundTasks):
    background.add_task(run_pending)
    return {"ok": True}
