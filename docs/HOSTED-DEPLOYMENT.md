# Hosted backend publishing handoff

## Decision and current state

Keep the Next.js dashboard on Vercel and run the backend on one always-on Heroku web dyno. The backend container includes Python 3.12, Node 22, Bun 1.3.14, and the npm-lockfile version of OMP. FastAPI runs both the persistent OMP Manager and the Python scheduled-research worker; research does not run through OMP.

- Dashboard: https://ai-receptionist-kappa-one.vercel.app
- Heroku app: `aitx-royalpawz-agents`.
- GitHub: `HZapperz/ai-receptionist-`, branch `main`.
- CI currently contains Gitleaks only. **Pushing GitHub does not publish this backend.** This runbook uses manual container publishing from a credentialed machine; no deployment workflow has been added.
- No Heroku release, production database migration, or Vercel configuration change was performed on the development machine. Heroku and database-administration credentials were unavailable. Previously observed deployed health: API `ok: true`, Manager `unavailable` with `[Errno 2] No such file or directory`.

## Changes included

- `Dockerfile` / `.dockerignore`: backend-only image, non-root runtime, real OMP/Bun installation, `$PORT`, and exactly one Uvicorn worker. Environment files and developer dependencies/caches are excluded from the build context.
- `0005_manager_checkpoints.sql`: service-role-only OMP JSONL checkpoints in Supabase.
- Manager restores its checkpoint before resuming, preserves session identity, and writes a checkpoint before marking a turn completed. A brand-new OMP session does not store a nonexistent resume path. Lost legacy sessions without a backup fail explicitly rather than silently dropping history.
- Default OMP model configuration uses existing `LLM_BASE_URL`, `LLM_API_KEY` (or `FEATHERLESS_API`), and `LLM_MODEL`; no interactive OMP login or developer home directory is needed. `MANAGER_MODEL` may explicitly select a native provider with that provider's API-key environment variable. OMP has the receptionist extension tools, not its built-in coding tools.
- Removed the automatic SQLite Manager fallback. Missing Supabase migrations now fail visibly; queues, approvals, messages, and transcripts must not fall back to ephemeral dyno storage.

## Verification already completed locally

- Built the Linux amd64 container with `--provenance=false`; the image launched the actual OMP executable and registered the receptionist extension.
- Verified the final exported image uses `application/vnd.docker.distribution.manifest.v2+json`, and launched actual OMP RPC under arbitrary UID/GID `12345:12345`: runtime writes succeeded and the receptionist tools registered. This exercises Heroku's user override rather than relying on the image's named user.
- Applied migrations `0001`–`0005` to an isolated PostgreSQL 17 database behind PostgREST. Confirmed checkpoint SELECT privileges were `false / false / true` for anon / authenticated / service_role.
- Ran 36 focused Manager queue/session and research tests successfully:
  ```bash
  .venv/bin/python -m unittest agents.tests.test_queue agents.tests.test_manager_persistence agents.tests.test_report_scheduler agents.tests.test_reports_research
  ```
- The container completed a real model chat turn and saved a Supabase-compatible checkpoint. Destroyed/recreated the container **without a filesystem volume**, then asked for the earlier phrase without including it in the question. The model remembered `cobalt otter`; both events completed and the OMP session ID stayed unchanged.
- After recreation, `/health` reported Manager `idle`; `/outbound/reports` reported worker `running: true`, `lock_held: true`, `error: null`.
- These were local container checks, not a Heroku deployment. No paid Apify research was launched in this hosting smoke check. Production model credentials, Apify execution, scheduled unattended runs, public access controls, and Heroku restart behavior still require the acceptance steps below.

## Required access and safety gates

The publishing machine needs Git, Docker with Linux amd64 builds, Heroku CLI access to the app, PostgreSQL `psql` with a Supabase database connection (or Supabase SQL Editor access), and Vercel project access. A Supabase service-role API key is **not** a database migration credential.

Before publishing:

1. **API access:** the agents service and Vercel `/agents/*` rewrite currently have no application authentication. `REQUIRE_LOGIN=true` protects dashboard pages, not those APIs. Put an authenticated gateway/trusted-access boundary in front of both backend access paths before public owner use. This deployment change does not implement authentication.
2. **Existing data:** inspect the current `manager_sessions.session_file` and determine whether the old app used SQLite fallback. Preserve any valuable legacy SQLite queue/history and OMP JSONL from the *running old dyno* before replacing it. A new `heroku run` dyno cannot read another dyno's filesystem. Do not reset a missing legacy session or delete its mapping without an explicit owner decision; import its original JSONL checkpoint first.
3. **Single instance:** keep one web dyno and one worker. Disable Preboot/rolling overlap and autoscaling. Local process locks are not distributed leases; a second backend must never point at the same Manager session or research schedule. Stop any local development backend using this production database before enabling the hosted worker.
4. **Live SMS:** do not repoint the Twilio number or change the production webhook as part of this deployment. Follow `TWILIO-833-CUTOVER.md` separately if the owner authorizes cutover.

## Publishing procedure

Run from the repository root. Do not enable shell tracing or paste credentials into committed files.

### 1. Pull and build

```bash
git switch main
git pull --ff-only origin main
export HEROKU_APP_NAME=aitx-royalpawz-agents
heroku login
heroku apps:info --app "$HEROKU_APP_NAME"
docker buildx build --platform linux/amd64 --provenance=false --output type=docker,oci-mediatypes=false -t "registry.heroku.com/$HEROKU_APP_NAME/web" .
```

This replaces the old Python-buildpack deployment; a Python-only buildpack cannot install this OMP runtime. Root `Procfile` remains useful for Python/local launch but is not the container entrypoint.

The explicit Docker exporter is required because [Heroku Container Registry](https://devcenter.heroku.com/articles/container-registry-and-runtime#known-issues-and-limitations) accepts Docker V2 Schema 2, not OCI manifests or multi-platform indexes. This runbook targets the existing Cedar-generation app; confirm its generation before switching stacks. Heroku overrides the Dockerfile `USER`, so the image uses `/tmp` for writable runtime state instead of relying on ownership of a developer home directory.

### 2. Apply missing database migrations

Use the Supabase SQL Editor or the database connection string from the project Connect panel. Prefer the session-pooler connection if the machine cannot reach direct IPv6. Inspect the existing schema first; do not blindly rerun the non-idempotent initial migrations or reseed a live business.

```bash
read -rsp 'Supabase database URL: ' DATABASE_URL; echo
export DATABASE_URL
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "select to_regclass('public.business_config'), to_regclass('public.ai_sessions'), to_regclass('public.manager_sessions'), to_regclass('public.manager_session_checkpoints');"
```

For a fresh database, apply `0001_init.sql`, `0002_ai_gate.sql`, `0003_auth_read.sql`, `0004_manager.sql`, then `0005_manager_checkpoints.sql`, in order; initialize approved business data afterward. For the existing deployment, determine which earlier migrations are absent and apply those first. Once `0004_manager.sql` is present and checkpoint storage is absent:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0005_manager_checkpoints.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "select has_table_privilege('anon','manager_session_checkpoints','SELECT') as anon_read, has_table_privilege('authenticated','manager_session_checkpoints','SELECT') as authenticated_read, has_table_privilege('service_role','manager_session_checkpoints','SELECT') as service_read;"
```

Expected privileges: `false`, `false`, `true`. Do not expose raw transcripts via the dashboard or grant browser roles access.

### 3. Configure the backend and dashboard

Use Heroku Dashboard → Settings → Config Vars for secrets. Preserve existing production settings; do not import a developer `.env` wholesale.

Backend minimum:

| Variable | Value / purpose |
| --- | --- |
| `SUPABASE_URL` | Production project API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Production service-role key, backend only |
| `LLM_API_KEY` | Real OpenAI-compatible provider key; `FEATHERLESS_API` is accepted as fallback |
| `LLM_BASE_URL` | Provider API URL, currently `https://api.featherless.ai/v1` |
| `LLM_MODEL` | Actual available model ID, currently configured as `Qwen/Qwen3.8-27B` |
| `LLM_FAKE` | `false`; this setting affects Python agents, not OMP |
| `LLM_DISABLE_THINKING` | Use the provider-appropriate setting; `true` sends `chat_template_kwargs.enable_thinking=false` to the default Manager provider |
| `APIFY_TOKEN` | Required for real scheduled research |
| `MANAGER_SESSION_ID` | Preserve `00000000-0000-0000-0000-000000000001` unless deliberately creating a different workspace |
| `MANAGER_RUNTIME_DIR` | `/tmp/ai-receptionist` (writable by Heroku's assigned UID; disposable cache, transcripts restore from Supabase) |
| `MANAGER_MODEL` | Leave unset for shared LLM configuration; otherwise use a native OMP provider/model selector and its provider API-key variable |
| `OMP_BINARY` | `/app/node_modules/.bin/omp` |
| `PUBLIC_AGENTS_URL` | Actual public backend URL, matching Twilio signature validation |

Keep Twilio credentials, owner number, gate settings, email settings, and send allowlist from the existing approved production setup. Do not disable signature validation for production. Heroku supplies `PORT`; do not pin it yourself.

Vercel needs `AGENTS_URL` pointing to the Heroku URL, the existing Supabase dashboard variables, and the chosen login setting. Redeploy Vercel if changing `AGENTS_URL`, because the rewrite is built into the Next deployment. Do not put model, Apify, or Twilio keys in `NEXT_PUBLIC_*` variables.

### 4. Publish with no overlapping workers

Pause research schedules and wait for active report jobs and Manager turns to finish. An interrupted job is marked failed/interrupted, not automatically replayed; this avoids duplicate paid scraping and customer-facing actions.

```bash
heroku container:login
heroku features:disable preboot --app "$HEROKU_APP_NAME"
heroku ps:scale web=0 --app "$HEROKU_APP_NAME"
heroku stack:set container --app "$HEROKU_APP_NAME"
docker push "registry.heroku.com/$HEROKU_APP_NAME/web"
heroku container:release web --app "$HEROKU_APP_NAME"
heroku ps:scale web=1:basic --app "$HEROKU_APP_NAME"
heroku ps --app "$HEROKU_APP_NAME"
heroku logs --tail --app "$HEROKU_APP_NAME"
```

This intentionally allows deployment downtime instead of overlapping owners of the same queue. Monitor memory/R14 events: Basic sizing is the existing configuration, not a capacity guarantee for OMP plus a large research job. Increase the dyno size if needed, **not** the worker count.

## Acceptance: do not declare success at API `ok: true`

Set `BACKEND_URL` to the app URL reported by `heroku apps:info`. Run requests through your authenticated access boundary if one is configured.

```bash
curl --fail --silent --show-error "$BACKEND_URL/health" | python -m json.tool
curl --fail --silent --show-error "$BACKEND_URL/outbound/reports" | python -m json.tool
```

Required: Manager `idle` or `running`, not `unavailable`; report worker running with no startup error. No missing executable, model credential, database RPC, or checkpoint-table error in logs.

### OMP restart recovery

1. In Manager chat, send a harmless instruction: “Remember the deployment check phrase cobalt otter. Acknowledge only; do not use tools, book anything, or send messages.” Wait for a completed event and assistant reply.
2. In SQL, inspect metadata only:
   ```sql
   select session_id, file_name, length(content) as checkpoint_chars, updated_at
   from manager_session_checkpoints;
   ```
   Expect a nonempty checkpoint for the existing session. Do not publish its content.
3. Restart the web dyno:
   ```bash
   heroku ps:restart web --app "$HEROKU_APP_NAME"
   ```
4. Wait for healthy Manager status, then ask “What was the deployment check phrase? Do not use tools.” The response must retain the phrase, with the same OMP session identity and existing dashboard history.
5. Confirm the checkpoint timestamp advances after the follow-up turn. A fresh conversation without the prior context is a failure even if health is green.

### Research hosting

1. Keep the existing schedule paused. Run one small, owner-approved research report (limit 1–2) from the dashboard; this spends Apify/model credits. Verify the saved report has actual sources/findings and survives a dyno restart.
2. Configure a near-future schedule, close the browser, and verify the backend creates and completes its run without a browser session. Restore the owner's intended schedule afterward.
3. Confirm no emails/SMS/bookings were created by the report path and no duplicate running task exists. Research is Python-based; OMP health alone does not prove research readiness.

## Failure handling / rollback

- Stop the web dyno first if duplicate workers, unexpected customer actions, or persistent checkpoint errors appear. Preserve durable rows and logs; never “fix” recovery by truncating queues or deleting session mappings.
- The checkpoint migration is additive. Keep it during a code rollback.
- Use `heroku releases --app "$HEROKU_APP_NAME"` to identify a known-good **container** release. With web scaled to zero, `heroku rollback vNN --app "$HEROKU_APP_NAME"` can restore that code, then scale back to one and repeat health checks. The first buildpack-to-container cutover may require restoring the prior stack/buildpack and rebuilding; do not assume a previous slug is a compatible container rollback.
- If only credentials or model availability are wrong, correct Config Vars rather than erase session state.
- No deployment automation is installed by this handoff. Future CI needs least-privileged Heroku credentials, protected release approval, image validation, migration gates, singleton rollout, and Manager/research health checks—not just a successful Docker push.
