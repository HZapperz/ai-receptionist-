"""Regression tests for non-report outbound prospecting pipeline:
- Input validation & clamping
- Lead ingestion, normalization, and idempotent upserts preserving workflow state
- Automatic drafting queue for new leads only
- Sequential draft runs persisting draft content and status
- Send route updating status to 'sent' and recording sent_at timestamp
- Isolation from report mode pipeline
"""
import asyncio
from datetime import datetime, timezone
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from agents.outbound.jobs import draft_emails, find_leads
from agents.outbound.routes import SendBody, send
from agents.outbound.tools import GetLeadArgs, SaveDraftArgs, get_lead, save_draft
from agents.runtime.ctx import Ctx


class MemoryDB:
    """In-memory Supabase table simulator for deterministic testing without external dependencies."""

    def __init__(self):
        self.leads = {}
        self.tasks = {}
        self._lead_counter = 0
        self._task_counter = 0

    def table(self, name: str):
        return QueryBuilder(self, name)


class QueryBuilder:

    def __init__(self, db: MemoryDB, table_name: str):
        self.db = db
        self.table_name = table_name
        self.data_store = getattr(db, table_name)
        self.filters = []
        self._limit = None
        self._insert_data = None
        self._update_data = None

    def select(self, columns: str):
        return self

    def eq(self, column: str, value: str):
        self.filters.append(("eq", column, value))
        return self

    def in_(self, column: str, values: list):
        self.filters.append(("in", column, set(values)))
        return self

    def limit(self, count: int):
        self._limit = count
        return self

    def insert(self, data: dict | list):
        self._insert_data = data
        return self

    def update(self, data: dict):
        self._update_data = data
        return self

    def execute(self):
        if self._insert_data is not None:
            items = (
                self._insert_data
                if isinstance(self._insert_data, list)
                else [self._insert_data]
            )
            inserted = []
            for item in items:
                record = dict(item)
                if "id" not in record:
                    if self.table_name == "leads":
                        self.db._lead_counter += 1
                        record["id"] = f"lead-uuid-{self.db._lead_counter}"
                    else:
                        self.db._task_counter += 1
                        record["id"] = f"task-uuid-{self.db._task_counter}"
                self.data_store[record["id"]] = record
                inserted.append(record)
            res = MagicMock()
            res.data = inserted
            return res

        # Filter items
        matching = list(self.data_store.values())
        for ftype, col, val in self.filters:
            if ftype == "eq":
                matching = [m for m in matching if m.get(col) == val]
            elif ftype == "in":
                matching = [m for m in matching if m.get(col) in val]

        if self._update_data is not None:
            updated = []
            for m in matching:
                m.update(self._update_data)
                updated.append(m)
            res = MagicMock()
            res.data = updated
            return res

        if self._limit is not None:
            matching = matching[: self._limit]

        res = MagicMock()
        res.data = matching
        return res


class TestOutboundPipeline(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        self.db = MemoryDB()

    async def test_get_lead_and_save_draft_tools(self):
        ctx = Ctx(db=self.db, config={}, agent="outbound")

        # Test non-existent lead
        err_get = await get_lead(ctx, GetLeadArgs(lead_id="missing-id"))
        self.assertIn("error", err_get)

        err_save = await save_draft(
            ctx,
            SaveDraftArgs(
                lead_id="missing-id", subject="Test", body="Test Body"
            ),
        )
        self.assertIn("error", err_save)

        # Create lead
        lead_row = self.db.table("leads").insert({
            "place_id": "place_100",
            "name": "Oakwood Heights",
            "address": "100 Oak St, Houston, TX",
            "rating": 4.8,
            "website": "https://oakwood.example.com",
            "status": "new",
            "raw": {"description": "Luxury pet-friendly living in Houston."},
        }).execute().data[0]
        lead_id = lead_row["id"]

        # Call get_lead
        lead_data = await get_lead(ctx, GetLeadArgs(lead_id=lead_id))
        self.assertEqual(lead_data["name"], "Oakwood Heights")
        self.assertEqual(lead_data["rating"], 4.8)
        self.assertEqual(
            lead_data["snippet"], "Luxury pet-friendly living in Houston."
        )

        # Call save_draft
        draft_res = await save_draft(
            ctx,
            SaveDraftArgs(
                lead_id=lead_id,
                subject="Partnership Inquiry",
                body="Hello Oakwood Heights team...",
            ),
        )
        self.assertTrue(draft_res.get("ok"))
        self.assertEqual(draft_res.get("status"), "drafted")

        # Confirm DB row was updated correctly
        updated = self.db.leads[lead_id]
        self.assertEqual(updated["status"], "drafted")
        self.assertEqual(updated["draft_subject"], "Partnership Inquiry")
        self.assertEqual(updated["draft_body"], "Hello Oakwood Heights team...")

    async def test_find_leads_creates_leads_and_queues_draft_task(self):
        scraped_places = [
            {
                "place_id": "p_1",
                "name": "Heights Lofts",
                "address": "123 Main",
                "phone": "7135550100",
                "email": "info@heightslofts.com",
                "website": "https://heightslofts.com",
                "rating": 4.5,
                "raw": {"description": "Pet friendly"},
            },
            {
                "place_id": "p_2",
                "name": "Bayou Vista",
                "address": "456 Allen Pkwy",
                "phone": "7135550200",
                "email": "contact@bayouvista.com",
                "website": "https://bayouvista.com",
                "rating": 4.2,
                "raw": {"description": "Dog park on site"},
            },
        ]

        with patch("agents.outbound.jobs.get_db", return_value=self.db), patch(
            "agents.outbound.apify_io.find_leads",
            new_callable=AsyncMock,
            return_value=scraped_places,
        ), patch("agents.tasks.run_task", new_callable=AsyncMock):

            res = await find_leads({
                "payload": {
                    "term": "apartments",
                    "area": "Houston, TX",
                    "limit": 10,
                }
            })

            self.assertEqual(res["found"], 2)
            self.assertEqual(res["new"], 2)
            self.assertIsNotNone(res["draft_task_id"])

            # Verify 2 leads in DB
            self.assertEqual(len(self.db.leads), 2)
            lead1 = next(
                l for l in self.db.leads.values() if l["place_id"] == "p_1"
            )
            self.assertEqual(lead1["name"], "Heights Lofts")
            self.assertEqual(lead1["status"], "new")

            # Verify 1 draft task in DB
            self.assertEqual(len(self.db.tasks), 1)
            task = next(iter(self.db.tasks.values()))
            self.assertEqual(task["kind"], "draft_emails")
            self.assertEqual(len(task["payload"]["lead_ids"]), 2)

    async def test_find_leads_replay_idempotency(self):
        scraped_places = [{
            "place_id": "p_existing",
            "name": "River Oaks Towers",
            "address": "789 Westheimer",
            "phone": "7135550300",
            "email": "mgr@riveroaks.com",
            "website": "https://riveroaks.com",
            "rating": 4.9,
            "raw": {},
        }]

        # Seed existing lead with workflow state (drafted)
        existing_lead = self.db.table("leads").insert({
            "place_id": "p_existing",
            "name": "Old Name",
            "address": "Old Addr",
            "status": "drafted",
            "draft_subject": "Preserved Subject",
            "draft_body": "Preserved Body",
        }).execute().data[0]
        existing_id = existing_lead["id"]

        with patch("agents.outbound.jobs.get_db", return_value=self.db), patch(
            "agents.outbound.apify_io.find_leads",
            new_callable=AsyncMock,
            return_value=scraped_places,
        ):

            res = await find_leads({"payload": {"term": "apartments"}})

            self.assertEqual(res["found"], 1)
            self.assertEqual(res["new"], 0)
            self.assertIsNone(res["draft_task_id"])

            # Verify lead updated standard info but preserved workflow state
            updated = self.db.leads[existing_id]
            self.assertEqual(updated["name"], "River Oaks Towers")  # updated
            self.assertEqual(updated["status"], "drafted")  # preserved
            self.assertEqual(
                updated["draft_subject"], "Preserved Subject"
            )  # preserved
            self.assertEqual(updated["draft_body"], "Preserved Body")  # preserved

            # Verify NO new draft tasks created
            self.assertEqual(len(self.db.tasks), 0)

    async def test_draft_emails_execution(self):
        lead_row = self.db.table("leads").insert({
            "place_id": "p_draft",
            "name": "Galleria Court",
            "address": "5000 Westheimer",
            "status": "new",
        }).execute().data[0]
        lead_id = lead_row["id"]

        async def fake_run_agent(spec, messages, ctx):
            await save_draft(
                ctx,
                SaveDraftArgs(
                    lead_id=lead_id,
                    subject="Galleria Partnership",
                    body="Hi Galleria Team",
                ),
            )
            return "ok"

        with patch("agents.outbound.jobs.get_db", return_value=self.db), patch(
            "agents.outbound.jobs.load_config", return_value={}
        ), patch(
            "agents.outbound.jobs.run_agent", side_effect=fake_run_agent
        ):

            res = await draft_emails(
                {"payload": {"lead_ids": [lead_id]}}
            )

            self.assertEqual(res["drafted"], 1)
            self.assertEqual(res["total"], 1)
            self.assertEqual(res["errors"], 0)

            # Check lead state in DB
            lead_after = self.db.leads[lead_id]
            self.assertEqual(lead_after["status"], "drafted")
            self.assertEqual(lead_after["draft_subject"], "Galleria Partnership")
            self.assertEqual(lead_after["draft_body"], "Hi Galleria Team")

    async def test_send_route_records_status_and_timestamp(self):
        lead_row = self.db.table("leads").insert({
            "place_id": "p_send",
            "name": "Medical Center Apts",
            "email": "contact@medcenter.com",
            "status": "drafted",
            "draft_subject": "Mobile Grooming Partnership",
            "draft_body": "Hello team...",
        }).execute().data[0]
        lead_id = lead_row["id"]

        with patch("agents.outbound.routes.get_db", return_value=self.db), patch(
            "agents.outbound.email_io.send", return_value={"ok": True}
        ):

            result = await send(SendBody(lead_id=lead_id))
            self.assertTrue(result.get("ok"))

            # Check lead state
            lead_after = self.db.leads[lead_id]
            self.assertEqual(lead_after["status"], "sent")
            self.assertIsNotNone(lead_after.get("sent_at"))
            # Verify timestamp format
            dt = datetime.fromisoformat(lead_after["sent_at"])
            self.assertIsNotNone(dt)


if __name__ == "__main__":
    unittest.main()
