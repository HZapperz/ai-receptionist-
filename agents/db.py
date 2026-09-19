# Shared area: announce in the team chat before editing (see CLAUDE.md).
import json
import logging
import sqlite3
import threading
import uuid
from functools import lru_cache
from typing import Any

from supabase import Client, create_client

from agents.settings import settings

logger = logging.getLogger(__name__)

_local_conn: sqlite3.Connection | None = None
_conn_lock = threading.RLock()
_has_supabase_manager_schema_cache: bool | None = None


def get_manager_sqlite_conn() -> sqlite3.Connection:
    global _local_conn
    with _conn_lock:
        if _local_conn is None:
            runtime_dir = settings.runtime_dir()
            runtime_dir.mkdir(parents=True, exist_ok=True)
            db_path = runtime_dir / "manager.sqlite3"
            _local_conn = sqlite3.connect(str(db_path), check_same_thread=False)
            _local_conn.row_factory = sqlite3.Row
            _local_conn.executescript("""
            CREATE TABLE IF NOT EXISTS manager_sessions (
                id TEXT PRIMARY KEY,
                session_file TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS manager_events (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                source TEXT,
                dedupe_key TEXT UNIQUE,
                payload TEXT DEFAULT '{}',
                status TEXT DEFAULT 'queued',
                error TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                started_at TEXT,
                completed_at TEXT
            );
            CREATE TABLE IF NOT EXISTS manager_messages (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                event_id TEXT,
                role TEXT,
                content TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS manager_tasks (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                title TEXT,
                status TEXT DEFAULT 'working',
                detail TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS manager_approvals (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                kind TEXT,
                payload TEXT DEFAULT '{}',
                status TEXT DEFAULT 'pending',
                result TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );
            """)
        return _local_conn


def has_supabase_manager_schema(client: Client) -> bool:
    global _has_supabase_manager_schema_cache
    if _has_supabase_manager_schema_cache is not None:
        return _has_supabase_manager_schema_cache
    try:
        client.table("manager_sessions").select("id").limit(1).execute()
        _has_supabase_manager_schema_cache = True
        return True
    except Exception as exc:
        logger.info(
            "Supabase does not have manager_* tables (0004_manager.sql not applied); using local SQLite fallback for manager queue: %s",
            exc,
        )
        _has_supabase_manager_schema_cache = False
        return False


class PostgrestResult:
    def __init__(self, data: Any):
        self.data = data


class SQLiteQueryBuilder:
    def __init__(self, conn_func, table_name: str):
        self._conn_func = conn_func
        self.table_name = table_name
        self._action = "select"
        self._select_cols = "*"
        self._values = None
        self._filters: list[tuple[str, str, Any]] = []
        self._order_by: tuple[str, bool] | None = None
        self._limit: int | None = None
        self._upsert_on_conflict = None

    def select(self, cols: str = "*"):
        self._action = "select"
        self._select_cols = cols
        return self

    def insert(self, values):
        self._action = "insert"
        self._values = values if isinstance(values, list) else [values]
        return self

    def update(self, values):
        self._action = "update"
        self._values = values
        return self

    def upsert(self, values, on_conflict=None, ignore_duplicates=False):
        self._action = "upsert"
        self._values = values if isinstance(values, list) else [values]
        return self

    def eq(self, column: str, value: Any):
        self._filters.append((column, "=", str(value) if isinstance(value, uuid.UUID) else value))
        return self

    def gte(self, column: str, value: Any):
        self._filters.append((column, ">=", value))
        return self

    def order(self, column: str, desc: bool = False):
        self._order_by = (column, desc)
        return self

    def limit(self, count: int):
        self._limit = count
        return self

    def execute(self) -> PostgrestResult:
        with _conn_lock:
            conn = self._conn_func()
            cursor = conn.cursor()
            if self._action in {"insert", "upsert"}:
                inserted_rows = []
                for row in self._values:
                    r = dict(row)
                    if "id" not in r:
                        r["id"] = str(uuid.uuid4())
                    for k, v in r.items():
                        if isinstance(v, (dict, list)):
                            r[k] = json.dumps(v)
                        elif isinstance(v, uuid.UUID):
                            r[k] = str(v)
                    cols = list(r.keys())
                    placeholders = [":" + c for c in cols]
                    kw = "INSERT OR IGNORE" if self._action == "upsert" else "INSERT"
                    sql = f"{kw} INTO {self.table_name} ({', '.join(cols)}) VALUES ({', '.join(placeholders)})"
                    cursor.execute(sql, r)
                    fetch_sql = f"SELECT * FROM {self.table_name} WHERE id = ?"
                    cur = cursor.execute(fetch_sql, (r["id"],))
                    res = cur.fetchone()
                    if res:
                        inserted_rows.append(self._deserialize_row(dict(res)))
                conn.commit()
                return PostgrestResult(inserted_rows)

            elif self._action == "update":
                where_clauses, params = [], {}
                for i, (col, op, val) in enumerate(self._filters):
                    key = f"w_{i}_{col}"
                    where_clauses.append(f"{col} {op} :{key}")
                    params[key] = val
                set_clauses = []
                for k, v in dict(self._values).items():
                    if v == "now()":
                        set_clauses.append(f"{k} = datetime('now')")
                    else:
                        key = f"s_{k}"
                        params[key] = json.dumps(v) if isinstance(v, (dict, list)) else (str(v) if isinstance(v, uuid.UUID) else v)
                        set_clauses.append(f"{k} = :{key}")
                where_str = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
                find_sql = f"SELECT id FROM {self.table_name} {where_str}"
                ids = [row["id"] for row in cursor.execute(find_sql, params).fetchall()]
                cursor.execute(f"UPDATE {self.table_name} SET {', '.join(set_clauses)} {where_str}", params)
                conn.commit()
                updated_rows = []
                for row_id in ids:
                    res = cursor.execute(f"SELECT * FROM {self.table_name} WHERE id = ?", (row_id,)).fetchone()
                    if res:
                        updated_rows.append(self._deserialize_row(dict(res)))
                return PostgrestResult(updated_rows)
            else:
                where_clauses, params = [], {}
                for i, (col, op, val) in enumerate(self._filters):
                    key = f"w_{i}_{col}"
                    where_clauses.append(f"{col} {op} :{key}")
                    params[key] = val
                where_str = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
                order_str = f"ORDER BY {self._order_by[0]} {'DESC' if self._order_by[1] else 'ASC'}" if self._order_by else ""
                limit_str = f"LIMIT {self._limit}" if self._limit else ""
                cols = self._select_cols if self._select_cols != "*" else "*"
                sql = f"SELECT {cols} FROM {self.table_name} {where_str} {order_str} {limit_str}"
                rows = cursor.execute(sql, params).fetchall()
                return PostgrestResult([self._deserialize_row(dict(r)) for r in rows])

    def _deserialize_row(self, r: dict) -> dict:
        for k in ["payload", "result"]:
            if k in r and isinstance(r[k], str):
                try:
                    r[k] = json.loads(r[k])
                except Exception:
                    pass
        return r


class SQLiteRPC:
    def __init__(self, conn_func, fn_name: str, args: dict):
        self._conn_func = conn_func
        self.fn_name = fn_name
        self.args = args

    def execute(self) -> PostgrestResult:
        with _conn_lock:
            conn = self._conn_func()
            cursor = conn.cursor()
            if self.fn_name == "manager_recover_running":
                sid = str(self.args.get("p_session_id"))
                c1 = cursor.execute(
                    "UPDATE manager_events SET status = 'interrupted', completed_at = datetime('now'), error = coalesce(error, 'interrupted by server restart') WHERE session_id = ? AND status = 'running'",
                    (sid,),
                ).rowcount
                c2 = cursor.execute(
                    "UPDATE manager_approvals SET status = 'interrupted', result = ? WHERE session_id = ? AND status = 'executing'",
                    (json.dumps({"error": "interrupted by server restart"}), sid),
                ).rowcount
                conn.commit()
                return PostgrestResult({"events_count": c1, "approvals_count": c2})
            elif self.fn_name == "manager_enqueue_event":
                sid = str(self.args.get("p_session_id"))
                src = str(self.args.get("p_source"))
                payload = self.args.get("p_payload") or {}
                dkey = self.args.get("p_dedupe_key")
                umsg = self.args.get("p_user_message")
                if dkey:
                    cur = cursor.execute("SELECT * FROM manager_events WHERE dedupe_key = ?", (dkey,))
                    existing = cur.fetchone()
                    if existing:
                        row = dict(existing)
                        row["payload"] = json.loads(row["payload"]) if isinstance(row.get("payload"), str) else row.get("payload")
                        return PostgrestResult(row)
                eid = str(uuid.uuid4())
                cursor.execute(
                    "INSERT INTO manager_events (id, session_id, source, dedupe_key, payload, status) VALUES (?, ?, ?, ?, ?, 'queued')",
                    (eid, sid, src, dkey, json.dumps(payload)),
                )
                if umsg:
                    cursor.execute(
                        "INSERT INTO manager_messages (id, session_id, event_id, role, content) VALUES (?, ?, ?, 'user', ?)",
                        (str(uuid.uuid4()), sid, eid, umsg),
                    )
                conn.commit()
                cur = cursor.execute("SELECT * FROM manager_events WHERE id = ?", (eid,))
                row = dict(cur.fetchone())
                row["payload"] = json.loads(row["payload"]) if isinstance(row.get("payload"), str) else row.get("payload")
                return PostgrestResult(row)
            elif self.fn_name == "manager_claim_event":
                sid = str(self.args.get("p_session_id"))
                if cursor.execute("SELECT count(*) as c FROM manager_events WHERE session_id = ? AND status = 'running'", (sid,)).fetchone()["c"] > 0:
                    return PostgrestResult(None)
                cur = cursor.execute(
                    "SELECT * FROM manager_events WHERE session_id = ? AND status = 'queued' ORDER BY created_at ASC LIMIT 1",
                    (sid,),
                )
                row = cur.fetchone()
                if not row:
                    return PostgrestResult(None)
                eid = row["id"]
                cursor.execute("UPDATE manager_events SET status = 'running', started_at = datetime('now') WHERE id = ?", (eid,))
                conn.commit()
                cur = cursor.execute("SELECT * FROM manager_events WHERE id = ?", (eid,))
                res = dict(cur.fetchone())
                res["payload"] = json.loads(res["payload"]) if isinstance(res.get("payload"), str) else res.get("payload")
                return PostgrestResult(res)
            elif self.fn_name == "manager_decide_approval":
                approval_id = str(self.args.get("p_approval_id"))
                decision = str(self.args.get("p_decision"))
                new_status = "approved" if decision == "approve" else "rejected"
                cursor.execute(
                    "UPDATE manager_approvals SET status = ? WHERE id = ? AND status = 'pending'",
                    (new_status, approval_id),
                )
                conn.commit()
                cur = cursor.execute("SELECT * FROM manager_approvals WHERE id = ?", (approval_id,))
                row = cur.fetchone()
                if not row:
                    raise RuntimeError("approval_not_found")
                res = dict(row)
                res["payload"] = json.loads(res["payload"]) if isinstance(res.get("payload"), str) else res.get("payload")
                if res.get("result"):
                    res["result"] = json.loads(res["result"]) if isinstance(res["result"], str) else res["result"]

                if decision == "approve":
                    dedupe_key = f"approval:{approval_id}:{decision}"
                    SQLiteRPC(self._conn_func, "manager_enqueue_event", {
                        "p_session_id": res["session_id"],
                        "p_source": "approval",
                        "p_payload": {"approval_id": approval_id, "decision": decision},
                        "p_dedupe_key": dedupe_key,
                        "p_user_message": None,
                    }).execute()
                return PostgrestResult(res)
            return PostgrestResult(None)


class ManagerClientWrapper:
    def __init__(self, real_client: Client):
        self._real = real_client

    def table(self, table_name: str):
        if table_name.startswith("manager_") and not has_supabase_manager_schema(self._real):
            return SQLiteQueryBuilder(get_manager_sqlite_conn, table_name)
        return self._real.table(table_name)

    def rpc(self, fn: str, args: dict | None = None):
        if fn.startswith("manager_") and not has_supabase_manager_schema(self._real):
            return SQLiteRPC(get_manager_sqlite_conn, fn, args or {})
        return self._real.rpc(fn, args)

    def __getattr__(self, name: str):
        return getattr(self._real, name)


@lru_cache
def get_db() -> Client:
    """Service-role client. Bypasses RLS, so it stays in this process."""
    key = settings.effective_service_role_key()
    if not settings.SUPABASE_URL or not key:
        raise RuntimeError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY)")
    raw = create_client(settings.SUPABASE_URL, key)
    return ManagerClientWrapper(raw)


def load_config(db) -> dict:
    rows = db.table("business_config").select("data").eq("id", 1).limit(1).execute().data
    return rows[0]["data"] if rows else {}
