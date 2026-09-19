import math
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from agents.outbound.apify_io import (
    crawl_business_websites,
    find_leads,
    is_safe_public_url,
    normalize_place,
    scrape_places,
)
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

    def test_is_safe_public_url_validation(self):
        self.assertTrue(is_safe_public_url("https://example.com/pricing"))
        self.assertTrue(is_safe_public_url("http://google.com"))

        self.assertFalse(is_safe_public_url("http://localhost:8000"))
        self.assertFalse(is_safe_public_url("http://127.0.0.1/admin"))
        self.assertFalse(is_safe_public_url("http://10.0.0.1/config"))
        self.assertFalse(is_safe_public_url("http://169.254.169.254/latest/meta-data/"))
        self.assertFalse(is_safe_public_url("file:///etc/passwd"))
        self.assertFalse(is_safe_public_url("javascript:alert(1)"))
        self.assertFalse(is_safe_public_url(""))
        self.assertFalse(is_safe_public_url(None))

    async def test_scrape_places_rejects_unallowed_actor(self):
        with patch("agents.outbound.apify_io.getattr", return_value="unauthorized/actor-id"), patch(
            "agents.outbound.apify_io.os.environ.get", return_value="fake_token"
        ):
            with self.assertRaisesRegex(ValueError, "is not in allowlist"):
                await scrape_places("term", "area", 10)
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
        ) as mock_load_config, patch("agents.outbound.reports.scrape_places") as mock_scrape, patch(
            "agents.outbound.reports.run_agent"
        ) as mock_run_agent:
            mock_get_db.return_value = MagicMock()
            mock_load_config.return_value = {"name": "Royal Pawz", "outbound": {"audience": "apartments"}}
            mock_scrape.return_value = {
                "places": [],
                "actor_id": "compass/crawler-google-places",
                "run_id": "run_000",
                "dataset_id": "ds_000",
                "fetched_at": "2026-09-19T12:00:00Z",
            }

            async def fake_planner_run(spec, messages, ctx, max_steps=3):
                from agents.outbound.reports import SaveResearchPlanArgs, _handle_save_research_plan
                args = SaveResearchPlanArgs(
                    search_term="nonexistent_biz",
                    rationale="Search query for zero result test",
                    evidence_needed=["Listings"],
                    need_website_evidence=False,
                )
                await _handle_save_research_plan(ctx, args)
                return "Done"

            mock_run_agent.side_effect = fake_planner_run

            task = {"id": "task_zero", "payload": {"objective": "Find luxury boarding", "area": "Moon", "limit": 10}}
            report = await generate_report(task)

            self.assertEqual(report["metrics"]["total"], 0)
            self.assertIsNone(report["metrics"]["average_rating"])
            self.assertEqual(report["categories"], [])
            self.assertEqual(report["leads"], [])
            self.assertIn("research_plan", report)
            self.assertEqual(report["research_plan"]["objective"], "Find luxury boarding")
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
            with self.assertRaisesRegex(RuntimeError, r"LLM .* failed"):
                await generate_report(task)
    async def test_generate_report_failure_on_missing_planner_tool_call(self):
        mock_places = []
        with patch("agents.outbound.reports.get_db") as mock_get_db, patch(
            "agents.outbound.reports.load_config"
        ) as mock_load_config, patch("agents.outbound.reports.run_agent") as mock_run_agent:
            mock_get_db.return_value = MagicMock()
            mock_load_config.return_value = {"name": "Royal Pawz"}
            mock_run_agent.return_value = "Done without calling save_research_plan"

            task = {"id": "task_no_plan", "payload": {"term": "boarding", "area": "Austin", "limit": 5}}
            with self.assertRaisesRegex(RuntimeError, "LLM research planning failed"):
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

            async def fake_planner_only_run(spec, messages, ctx, max_steps=4):
                if spec.name == "research_planner":
                    from agents.outbound.reports import SaveResearchPlanArgs, _handle_save_research_plan
                    args = SaveResearchPlanArgs(
                        search_term="boarding",
                        rationale="Search query for test",
                        evidence_needed=["Listings"],
                        need_website_evidence=False,
                    )
                    await _handle_save_research_plan(ctx, args)
                    return "Planner done"
                return "Synthesizer done without calling tool"

            mock_run_agent.side_effect = fake_planner_only_run

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
                if spec.name == "research_planner":
                    from agents.outbound.reports import SaveResearchPlanArgs, _handle_save_research_plan
                    args = SaveResearchPlanArgs(
                        search_term="grooming",
                        rationale="Search query for test",
                        evidence_needed=["Listings"],
                        need_website_evidence=False,
                    )
                    await _handle_save_research_plan(ctx, args)
                    return "Done"

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

    async def test_generate_report_competitor_analysis_with_explicit_unknowns(self):
        mock_places = [
            {
                "place_id": "place_comp_1",
                "name": "Rival Groomers",
                "address": "400 Main St",
                "phone": "+17135558888",
                "email": "info@rival.com",
                "website": "https://rivalgroomers.com",
                "rating": 4.5,
                "category": "Pet Groomer",
                "source_url": "https://maps.google.com/place_comp_1",
            }
        ]

        with patch("agents.outbound.reports.get_db") as mock_get_db, patch(
            "agents.outbound.reports.load_config"
        ) as mock_load_config, patch("agents.outbound.reports.scrape_places") as mock_scrape, patch(
            "agents.outbound.reports.is_safe_public_url", return_value=True
        ), patch(
            "agents.outbound.reports.is_safe_public_url_async", return_value=True
        ), patch(
            "agents.outbound.apify_io.crawl_business_websites", return_value={"pages": {"https://rivalgroomers.com": "We offer mobile grooming baths."}, "sources": {}, "error": None, "limitations": []}
        ), patch(
            "agents.outbound.reports.run_agent"
        ) as mock_run_agent:
            mock_get_db.return_value = MagicMock()
            mock_load_config.return_value = {
                "name": "Royal Pawz",
                "outbound": {"offer": "Mobile grooming vans with full service spa packages", "audience": "pet owners"},
            }
            mock_scrape.return_value = {
                "places": mock_places,
                "actor_id": "compass/crawler-google-places",
                "run_id": "run_comp_123",
                "dataset_id": "ds_comp_123",
                "fetched_at": "2026-09-19T12:00:00Z",
            }

            async def fake_agent_run(spec, messages, ctx, max_steps=4):
                if spec.name == "research_planner":
                    from agents.outbound.reports import SaveResearchPlanArgs, _handle_save_research_plan
                    args = SaveResearchPlanArgs(
                        search_term="mobile pet groomers",
                        rationale="Identify direct mobile grooming competitors",
                        evidence_needed=["Pricing", "Services offered"],
                        need_website_evidence=True,
                    )
                    await _handle_save_research_plan(ctx, args)
                    return "Done"
                elif spec.name == "report_synthesizer":
                    from agents.outbound.reports import (
                        CompetitorComparisonInput,
                        EvidenceSourceInput,
                        ResearchFindingInput,
                        SaveReportSynthesisArgs,
                        _handle_save_report_synthesis,
                    )
                    args = SaveReportSynthesisArgs(
                        title="Competitor Analysis: Mobile Groomers",
                        summary="Evaluated Rival Groomers against Royal Pawz.",
                        recommendations=["Promote transparent package pricing."],
                        limitations=["Pricing not published on competitor site."],
                        opportunities={"place_comp_1": "Direct competitor in mobile space."},
                        findings=[
                            ResearchFindingInput(
                                heading="Mobile Service Reach",
                                detail="Rival Groomers operates mobile vans in central area.",
                                source_urls=["https://rivalgroomers.com"],
                            )
                        ],
                        comparisons=[
                            CompetitorComparisonInput(
                                dimension="Package Pricing",
                                our_business="Standard spa packages starting at $85",
                                market_evidence="unknown",
                                implication="Competitor does not disclose pricing publicly; opportunity to compete on price transparency.",
                                source_urls=["https://rivalgroomers.com"],
                            )
                        ],
                        evidence_sources=[
                            EvidenceSourceInput(
                                url="https://rivalgroomers.com",
                                title="Rival Groomers Site",
                                kind="website",
                            )
                        ],
                    )
                    await _handle_save_report_synthesis(ctx, args)
                    return "Done"
                return "Done"

            mock_run_agent.side_effect = fake_agent_run

            task = {
                "id": "task_comp",
                "payload": {
                    "objective": "Compare competitor pricing and services",
                    "research_type": "competitor_analysis",
                    "area": "Houston",
                    "limit": 5,
                },
            }
            report = await generate_report(task)

            self.assertEqual(report["title"], "Competitor Analysis: Mobile Groomers")
            self.assertIn("research_plan", report)
            self.assertEqual(report["research_plan"]["research_type"], "competitor_analysis")
            self.assertEqual(len(report["comparisons"]), 1)
            comp = report["comparisons"][0]
            self.assertEqual(comp["dimension"], "Package Pricing")
            self.assertEqual(comp["market_evidence"], "unknown")
            source_urls = [s["url"] for s in report["evidence_sources"]]
            self.assertIn("https://rivalgroomers.com", source_urls)

    async def test_verbose_synthesis_is_truncated_not_rejected(self):
        """A verbose model must be trimmed by the handler, never rejected by pydantic.

        run_tool() validates args BEFORE the handler runs, so a max_length below what
        models naturally emit is a hard reject that burns the agent's retries and fails
        the whole run. The ceilings keep headroom; the handler does the tightening.
        """
        from agents.outbound.reports import (
            CompetitorComparisonInput,
            ResearchFindingInput,
            SaveReportSynthesisArgs,
            SaveResearchPlanArgs,
            _handle_save_report_synthesis,
            _handle_save_research_plan,
        )

        args = SaveReportSynthesisArgs(
            title="A long report title that a verbose model might easily write out in full " * 1,
            summary="Sentence about the market. " * 14,  # ~390 chars
            recommendations=[
                "Call the six clinics that have no website listed anywhere online yet today " * 1,
                "Widen the search radius",
                "Email the three highest rated groomers",
                "Re-run this report next week",
            ],
            limitations=["First caveat", "Second caveat", "Third caveat"],
            findings=[
                ResearchFindingInput(
                    heading="Mobile service reach",
                    detail="Evidence shows broad mobile coverage across the metro area. " * 8,
                )
            ],
            comparisons=[
                CompetitorComparisonInput(
                    dimension="Package pricing",
                    our_business="Spa packages from $85 with add-ons available on request. " * 3,
                    market_evidence="Competitor pages list a range of package tiers. " * 8,
                    implication="We can compete on transparency of published pricing. " * 3,
                )
            ],
        )

        ctx = MagicMock()
        ctx.ref = "task_verbose"
        res = await _handle_save_report_synthesis(ctx, args)
        self.assertTrue(res.get("ok"), res)

        from agents.outbound.reports import _SYNTHESIS_STORE

        stored = _SYNTHESIS_STORE.pop("task_verbose")
        self.assertLessEqual(len(stored["title"]), 70)
        self.assertLessEqual(len(stored["summary"]), 320)
        self.assertEqual(len(stored["recommendations"]), 3)
        self.assertTrue(all(len(r) <= 90 for r in stored["recommendations"]))
        self.assertEqual(len(stored["limitations"]), 2)
        self.assertLessEqual(len(stored["findings"][0]["detail"]), 360)
        comp = stored["comparisons"][0]
        self.assertLessEqual(len(comp["our_business"]), 120)
        self.assertLessEqual(len(comp["market_evidence"]), 160)
        self.assertLessEqual(len(comp["implication"]), 140)

        plan_args = SaveResearchPlanArgs(
            search_term="mobile pet groomers near me",
            rationale="This query surfaces the direct mobile competitors operating in the target area. " * 2,
            evidence_needed=["Pricing", "Services", "Coverage area", "Reviews"],
        )
        plan_ctx = MagicMock()
        plan_ctx.ref = "task_verbose_plan"
        plan_res = await _handle_save_research_plan(plan_ctx, plan_args)
        self.assertTrue(plan_res.get("ok"), plan_res)

        from agents.outbound.reports import _PLAN_STORE

        plan = _PLAN_STORE.pop("task_verbose_plan")
        self.assertLessEqual(len(plan["rationale"]), 160)
        self.assertEqual(len(plan["evidence_needed"]), 3)


if __name__ == "__main__":
    unittest.main()
