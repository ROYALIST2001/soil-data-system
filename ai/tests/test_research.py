import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import httpx
import numpy as np
from app.client import research_client, llm_client
from app.service.book_index import BookIndex, chunk_page, extract_pages
from app.service.research import research
from app.service.advisory_agent import chat, SYSTEM_PROMPT
from app.schema.agent import ChatRequest, ChatMessage


class BookTests(unittest.TestCase):
    def test_mung_question_cannot_use_an_onion_chapter(self):
        index = BookIndex()
        index.ready = True
        index.chunks = [
            {"title": "guide.pdf", "page": 35, "text": "Onion soil", "section_crops": ["onion"]},
            {"title": "guide.pdf", "page": 17, "text": "මුං වගාවට සුදුසු පස", "section_crops": ["mung"]},
        ]
        index.vectors = np.asarray([[1., 0.], [0.6, 0.8]], dtype=np.float32)
        with patch.object(research_client, "embed", return_value=[[1., 0.]]):
            hits = index.search("මුං වගාවට සුදුසු පස කුමක්ද?")
        self.assertEqual([hit["page"] for hit in hits], [17])
    def test_legacy_font_conversion_preserves_english_and_numbers(self):
        def extraction(visitor_text=None, **kwargs):
            visitor_text("fnda. j.d", [], [], {"/BaseFont": "/ABC+FMBindumathix"}, 12)
            visitor_text("\nRice 120 kg/ha", [], [], {"/BaseFont": "/TimesNewRoman"}, 12)
        with patch("app.service.book_index.PdfReader", return_value=SimpleNamespace(pages=[SimpleNamespace(extract_text=extraction)])):
            page, text, legacy = next(extract_pages("example.pdf"))
        self.assertEqual(page, 1)
        self.assertTrue(legacy)
        self.assertIn("බෝග වගා", text)
        self.assertIn("Rice 120 kg/ha", text)

    def test_chunking_preserves_overlap_and_final_text(self):
        text = "මුං වගාව\n" * 500
        chunks = list(chunk_page(text))
        self.assertGreater(len(chunks), 1)
        self.assertTrue(chunks[-1].endswith(text[-20:]))
        self.assertTrue(all(len(chunk) <= 1800 for chunk in chunks))

    def test_landscape_table_text_is_not_silently_dropped(self):
        def extraction(visitor_text=None, **kwargs):
            if visitor_text:
                visitor_text("Crop area 2021\nRice 120 hectares", [], [], {"/BaseFont": "/TimesNewRoman"}, 12)
            return "17"
        with patch("app.service.book_index.PdfReader", return_value=SimpleNamespace(pages=[SimpleNamespace(extract_text=extraction)])):
            _, text, _ = next(extract_pages("landscape.pdf"))
        self.assertIn("Rice 120 hectares", text)

    def test_vector_index_reuses_cache_and_rebuilds_changed_book(self):
        with TemporaryDirectory() as folder:
            root = Path(folder)
            book = root / "guide.pdf"
            book.write_bytes(b"first edition")
            with patch("app.service.book_index.extract_pages", return_value=[(5, "mung cultivation information " * 8, False)]), \
                 patch.object(research_client, "embed", side_effect=lambda texts: [[1., 0.] for _ in texts]) as embedding:
                index = BookIndex(root, root / "index")
                index.ensure()
                self.assertTrue(index.ready)
                self.assertEqual(index.search("mung")[0]["page"], 5)
                embedding.reset_mock()
                cached = BookIndex(root, root / "index")
                cached.ensure()
                embedding.assert_not_called()
                self.assertEqual(cached.chunks, index.chunks)
                book.write_bytes(b"second edition")
                cached.ensure()
                self.assertTrue(cached.ready)
                self.assertEqual(len(list((root / "index").glob("*.npz"))), 2)


class ResearchTests(unittest.TestCase):
    def setUp(self):
        self.plan = patch("app.service.research.decide", return_value={"research": True, "query": "mung cultivation", "current": False})
        self.plan.start()
        self.addCleanup(self.plan.stop)

    def test_books_are_first_and_sufficient_book_stops_web_search(self):
        with patch("app.service.research.book_index.search", return_value=[{"title": "guide.pdf", "page": 8, "text": "Evidence"}]), \
             patch("app.service.research.sufficient", return_value=True), \
             patch.object(research_client, "web_search") as web:
            result = research("මුං වගා කරන්නේ කෙසේද?", [])
        web.assert_not_called()
        self.assertEqual(result["sources"][0]["id"], "B1")
        self.assertEqual(result["sources"][0]["page"], 8)

    def test_generated_crop_translation_cannot_replace_sinhala_question(self):
        question = "මුං වගාව සඳහා සුදුසු පස කුමක්ද?"
        with patch("app.service.research.decide", return_value={"research": True, "query": "onion cultivation", "current": False}), \
             patch("app.service.research.book_index.search", return_value=[]) as books, \
             patch.object(research_client, "web_search", return_value={"text": "", "sources": []}):
            research(question, [])
        books.assert_called_once_with(question)

    def test_web_fallbacks_follow_exact_priority(self):
        order = []
        def search(query, tier, domains):
            order.append(tier)
            return {"text": "", "sources": []}
        with patch("app.service.research.book_index.search", return_value=[]), \
             patch.object(research_client, "web_search", side_effect=search):
            result = research("Current crop information", [])
        self.assertEqual(order, ["sri_lankan_agriculture", "sri_lankan_web", "agriculture_web"])
        self.assertEqual(result["steps"][0]["stage"], "books")
        self.assertEqual(result["sources"], [])

    def test_current_questions_do_not_stop_at_old_books(self):
        with patch("app.service.research.decide", return_value={"research": True, "query": "current figures", "current": True}), \
             patch("app.service.research.book_index.search", return_value=[{"title": "AgStat 2021.pdf", "page": 8, "text": "2020 figures"}]), \
             patch("app.service.research.sufficient", return_value=True), \
             patch.object(research_client, "web_search", return_value={"text": "New evidence", "sources": []}) as web:
            research("Latest figures", [])
        web.assert_called_once()

    def test_provider_failure_does_not_fabricate_sources(self):
        with patch("app.service.research.book_index.search", side_effect=llm_client.LLMError("Unavailable")), \
             patch.object(research_client, "web_search", side_effect=llm_client.LLMError("Unavailable")):
            result = research("Question", [])
        self.assertEqual(result["sources"], [])
        self.assertTrue(all(step["status"] == "unavailable" for step in result["steps"]))

    def test_sinhala_policy_replaces_old_persisted_english_prompt(self):
        refs = {"sources": [{"id": "B1", "kind": "book", "title": "guide.pdf", "page": 9}],
                "steps": [{"stage": "books", "status": "sufficient"}], "context": "Book evidence"}
        with patch("app.service.advisory_agent.research", return_value=refs), \
             patch.object(llm_client, "chat_with_tools", return_value={"role": "assistant", "content": "මුං වගාව [B1]"}) as model:
            response = chat(ChatRequest(messages=[ChatMessage(role="system", content="English only"), ChatMessage(role="user", content="මුං වගාව?")]))
        messages = model.call_args.kwargs["messages"]
        self.assertEqual(messages[0]["content"], SYSTEM_PROMPT)
        self.assertNotIn("English only", json.dumps(messages))
        self.assertEqual(response.sources[0]["page"], 9)
        calls = messages[2]["tool_calls"]
        self.assertEqual(calls[0]["id"], messages[3]["tool_call_id"])


class WebSearchTests(unittest.TestCase):
    def test_domain_boundaries_and_url_schemes(self):
        self.assertTrue(research_client.matches_domain("https://doa.gov.lk/page", ["doa.gov.lk"]))
        self.assertTrue(research_client.matches_domain("https://rrdi.doa.gov.lk/page", ["doa.gov.lk"]))
        for url in ["https://doa.gov.lk.attacker.example", "https://notdoa.gov.lk", "http://doa.gov.lk", "file:///secret", "https://user:pass@doa.gov.lk"]:
            self.assertFalse(research_client.matches_domain(url, ["doa.gov.lk"]))

    def test_search_requires_real_citations_and_validates_tier(self):
        payload = {"output": [{"type": "web_search_call"}, {"type": "message", "content": [{"type": "output_text", "text": "Evidence", "annotations": [{"type": "url_citation", "url": "https://doa.gov.lk/guide", "title": "DOA guide"}]}]}]}
        with patch.object(research_client, "request_json", return_value=payload) as request:
            result = research_client.web_search("mung", "sri_lankan_agriculture", ["doa.gov.lk"])
        self.assertEqual(result["sources"][0]["title"], "DOA guide")
        self.assertEqual(request.call_args.args[1]["tools"][0]["filters"]["allowed_domains"], ["doa.gov.lk"])
        payload["output"][1]["content"][0]["annotations"][0]["url"] = "https://example.com"
        with patch.object(research_client, "request_json", return_value=payload):
            self.assertEqual(research_client.web_search("mung", "sri_lankan_agriculture", ["doa.gov.lk"])["sources"], [])

    def test_no_citation_means_no_grounded_result(self):
        with patch.object(research_client, "request_json", return_value={"output": [{"type": "message", "content": [{"type": "output_text", "text": "Unverified answer"}]}]}):
            self.assertEqual(research_client.web_search("mung", "agriculture_web", ["fao.org"])["text"], "")


if __name__ == "__main__":
    unittest.main()
