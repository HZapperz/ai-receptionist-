FROM node:22-bookworm-slim AS node-dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM oven/bun:1.3.14 AS bun

FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOME=/tmp \
    MANAGER_RUNTIME_DIR=/tmp/ai-receptionist \
    PORT=8000 \
    PATH=/app/node_modules/.bin:$PATH

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY agents/requirements.txt /app/agents/requirements.txt
RUN pip install --no-cache-dir -r agents/requirements.txt

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY --from=node-dependencies /usr/local/bin/node /usr/local/bin/node
COPY --from=node-dependencies /app/node_modules /app/node_modules
COPY agents/ /app/agents/

RUN useradd --create-home --user-group --shell /usr/sbin/nologin app

USER app

CMD ["/bin/sh", "-c", "exec uvicorn agents.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
