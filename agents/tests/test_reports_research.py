import math
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from agents.outbound.apify_io import find_leads, normalize_place, scrape_places
from agents.outbound.reports import (
    DEFAULT_OPPORTUNITY,
    MANDATORY_LIMITATIONS,
    _compute_categories,
    _compute_metrics,
    generate_report,
)


class TestReportsResearch(unittest.IsolatedAsyncioTestCase):
    def test_normalize_place_dedup_and_rating_validation(self):
        item_normal = {
            "placeId": "ChIJ123456",
            "title": "Heights Apartments",
            "totalScore": 4.67,
        }
        item_invalid_rating_high = {
            "placeId": "ChIJ_high",
            "title": "High Rating Place",
            "totalScore": 99.0,  # Out of range (> 5.0)
        }
        item_nan_rating = {
            "placeId": "ChIJ_nan",
            "title": "NaN Rating Place",
            "totalScore": float("nan"),
        }

        norm1 = normalize_place(item_normal)
        self.assertEqual(norm1["place_id"], "ChIJ123456")
        self.assertEqual(norm1["rating"], 4.7)

        norm2 = normalize_place(item_invalid_rating_high)
        self.assertIsNone(norm2["rating"])

        norm3 = normalize_place(item_nan_rating)
        self.assertIsNone(norm3["rating"])

    async def test_scrape_places_deduplicates_duplicate_place_ids(self):
        raw_items = [
            {"placeId": "dup_1", "title": "Place First"},
            {"placeId": "dup_1", "title": "Place Duplicate"},
            {"placeId": "unique_2", "title": "Place Unique"},
        ]

        mock_page = MagicMock()
        mock_page.items = raw_items

        mock_dataset = AsyncMock()
        mock_dataset.list_items.return_value = mock_page

        mock_run = MagicMock()
        mock_run.id = "run_dup_123"
        mock_run.status = "SUCCEEDED"
        mock_run.default_dataset_id = "ds_dup_123"

        mock_actor = AsyncMock()
        mock_actor.call.return_value = mock_run

        mock_client = MagicMock()
        mock_client.actor.return_value = mock_actor
        mock_client.dataset.return_value = mock_dataset

        with patch("agents.outbound.apify_io.os.environ.get", return_value="fake_token"), patch(
            "agents.outbound.apify_io.ApifyClientAsync", return_value=mock_client
        ):
            res = await scrape_places("grooming", "Houston", 10)
            places = res["places"]
            self.assertEqual(len(places), 2)
            self.assertEqual([p["place_id"] for p in places], ["dup_1", "unique_2"])

    async def test_generate_report_zero_results(self):
        with patch("agents.outbound.reports.get_db") as mock_get_db, patch(
            "agents.outbound.reports.load_config"
        ) as mock_load_config, patch("agents.outbound.reports.scrape_places") as mock_scrape:
            mock_get_db.return_value = MagicMock()
            mock_load_config.return_value = {"name": "Royal Pawz"}
            mock_scrape.return_value = {
                "places": [],
                "actor_id": "compass/crawler-google-places",
                "run_id": "run_000",
                "dataset_id": "ds_000",
                "fetched_at": "2026-09-19T12:00:00Z",
            }

            task = {"id": "task_zero", "payload": {"term": "nonexistent_biz", "area": "Moon", "limit": 10}}
            report = await generate_report(task)

            self.assertEqual(report["metrics"]["total"], 0)
            self.assertIsNone(report["metrics"]["average_rating"])
            self.assertEqual(report["categories"], [])
            self.assertEqual(report["leads"], [])
            for mand in MANDATORY_LIMITATIONS:
                self.assertIn(mand, report["limitations"])

    async def test_generate_report_failure_propagation_on_llm_error(self):
        mock_places = [
            {
                "place_id": "place_err",
                "name": "Err Kennel",
                "address": "200 Oak St",
                "phone": "+17135550000",
                "email": "info@err.com",
                "website": "https://err.com",
                "rating": 3.8,
                "category": "Pet Boarding",
                "source_url": "https://maps.google.com/place_err",
            }
        ]

        with patch("agents.outbound.reports.get_db") as mock_get_db, patch(
            "agents.outbound.reports.load_config"
        ) as mock_load_config, patch("agents.outbound.reports.scrape_places") as mock_scrape, patch(
            "agents.outbound.reports.run_agent", side_effect=RuntimeError("LLM Provider Timeout")
        ):
            mock_get_db.return_value = MagicMock()
            mock_load_config.return_value = {"name": "Royal Pawz"}
            mock_scrape.return_value = {
                "places": mock_places,
                "actor_id": "compass/crawler-google-places",
                "run_id": "run_222",
                "dataset_id": "ds_222",
                "fetched_at": "2026-09-19T12:00:00Z",
            }

            task = {"id": "task_fail", "payload": {"term": "boarding", "area": "Austin", "limit": 5}}
            with self.assertRaisesRegex(RuntimeError, "LLM report synthesis failed"):
                await generate_report(task)

    async def test_generate_report_failure_on_missing_synthesis_tool_call(self):
        mock_places = [
            {
                "place_id": "place_no_tool",
                "name": "No Tool Kennel",
                "address": "300 Oak St",
                "phone": "+17135550002",
                "email": "info@notool.com",
                "website": "https://notool.com",
                "rating": 4.0,
                "category": "Pet Boarding",
                "source_url": "https://maps.google.com/place_no_tool",
            }
        ]

        with patch("agents.outbound.reports.get_db") as mock_get_db, patch(
            "agents.outbound.reports.load_config"
        ) as mock_load_config, patch("agents.outbound.reports.scrape_places") as mock_scrape, patch(
            "agents.outbound.reports.run_agent"
        ) as mock_run_agent:
            mock_get_db.return_value = MagicMock()
            mock_load_config.return_value = {"name": "Royal Pawz"}
            mock_scrape.return_value = {
                "places": mock_places,
                "actor_id": "compass/crawler-google-places",
                "run_id": "run_333",
                "dataset_id": "ds_333",
                "fetched_at": "2026-09-19T12:00:00Z",
            }

            # Agent runs but doesn't call save_report_synthesis
            mock_run_agent.return_value = "Done without tool call"

            task = {"id": "task_no_tool", "payload": {"term": "boarding", "area": "Austin", "limit": 5}}
            with self.assertRaisesRegex(RuntimeError, "did not produce a valid report"):
                await generate_report(task)

    async def test_generate_report_handles_unknown_lead_ids_in_opportunities(self):
        mock_places = [
            {
                "place_id": "place_valid_1",
                "name": "Valid Grooming",
                "address": "100 Main St",
                "phone": "+17135550001",
                "email": "info@valid.com",
                "website": "https://valid.com",
                "rating": 4.8,
                "category": "Pet Groomer",
                "source_url": "https://maps.google.com/place_valid_1",
            }
        ]

        with patch("agents.outbound.reports.get_db") as mock_get_db, patch(
            "agents.outbound.reports.load_config"
        ) as mock_load_config, patch("agents.outbound.reports.scrape_places") as mock_scrape, patch(
            "agents.outbound.reports.run_agent"
        ) as mock_run_agent:
            mock_get_db.return_value = MagicMock()
            mock_load_config.return_value = {"name": "Royal Pawz"}
            mock_scrape.return_value = {
                "places": mock_places,
                "actor_id": "compass/crawler-google-places",
                "run_id": "run_111",
                "dataset_id": "ds_111",
                "fetched_at": "2026-09-19T12:00:00Z",
            }

            async def fake_agent_run(spec, messages, ctx, max_steps=4):
                from agents.outbound.reports import SaveReportSynthesisArgs, _handle_save_report_synthesis

                args = SaveReportSynthesisArgs(
                    title="Referral Analysis",
                    summary="Good referral partner potential in area.",
                    recommendations=["Contact local apartments for grooming pop-up events."],
                    limitations=["Sample bounded"],
                    opportunities={
                        "UNKNOWN_HALLUCINATED_ID": "Invented opportunity narrative",
                        "place_valid_1": "Strong apartment community referral partner.",
                    },
                )
                await _handle_save_report_synthesis(ctx, args)
                return "Done"

            mock_run_agent.side_effect = fake_agent_run

            task = {"id": "task_synth", "payload": {"term": "grooming", "area": "Houston", "limit": 5}}
            report = await generate_report(task)

            self.assertEqual(len(report["leads"]), 1)
            lead = report["leads"][0]
            self.assertEqual(lead["place_id"], "place_valid_1")
            self.assertEqual(lead["opportunity"], "Strong apartment community referral partner.")

    async def test_find_leads_excludes_report_only_fields_from_lead_storage(self):
        mock_places = [
            {
                "place_id": "p_lead_1",
                "name": "Apartments 1",
                "address": "500 West St",
                "phone": "+17135559999",
                "email": "contact@apts.com",
                "website": "https://apts.com",
                "rating": 4.4,
                "category": "Apartments",
                "source_url": "https://maps.google.com/p_lead_1",
                "raw": {"foo": "bar"},
            }
        ]

        with patch("agents.outbound.apify_io.scrape_places") as mock_scrape:
            mock_scrape.return_value = {"places": mock_places}
            leads = await find_leads("apartments", "Houston", 5)
            l = leads[0]
            self.assertEqual(
                set(l.keys()), {"place_id", "name", "address", "phone", "email", "website", "rating", "raw"}
            )


if __name__ == "__main__":
    unittest.main()
