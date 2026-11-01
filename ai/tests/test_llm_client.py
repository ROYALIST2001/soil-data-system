import json
import unittest
from unittest.mock import patch

import httpx

from app.client import llm_client


class LLMClientTests(unittest.TestCase):
    def setUp(self):
        self.client_type = httpx.Client
        settings = patch.multiple(
            llm_client,
            LLM_BASE_URL="https://provider.example/v1",
            LLM_API_KEY="test-secret-never-log",
            LLM_MODEL="test-model",
        )
        settings.start()
        self.addCleanup(settings.stop)

    def mock_provider(self, handler):
        factory = patch.object(
            llm_client.httpx,
            "Client",
            side_effect=lambda **kwargs: self.client_type(
                transport=httpx.MockTransport(handler), **kwargs
            ),
        )
        factory.start()
        self.addCleanup(factory.stop)

    def test_sends_authenticated_chat_with_tools(self):
        tool_calls = [{
            "id": "call_soil", "type": "function",
            "function": {"name": "get_soil_history", "arguments": "{}"},
        }]

        def provider(request):
            self.assertEqual(str(request.url), "https://provider.example/v1/chat/completions")
            self.assertEqual(request.headers["Authorization"], "Bearer test-secret-never-log")
            body = json.loads(request.content)
            self.assertEqual(body["model"], "test-model")
            self.assertEqual(body["tool_choice"], "auto")
            self.assertEqual(body["messages"][0]["content"], "How is my soil?")
            self.assertEqual(body["tools"][0]["function"]["name"], "get_soil_history")
            return httpx.Response(200, json={"choices": [{"message": {
                "role": "assistant", "content": None, "tool_calls": tool_calls,
            }}]})

        self.mock_provider(provider)
        reply = llm_client.chat_with_tools(
            [{"role": "user", "content": "How is my soil?"}],
            [{"type": "function", "function": {"name": "get_soil_history"}}],
        )
        self.assertEqual(reply["tool_calls"], tool_calls)

    def test_plain_chat_preserves_json_mode_for_quality_agent(self):
        def provider(request):
            body = json.loads(request.content)
            self.assertEqual(body["response_format"], {"type": "json_object"})
            self.assertNotIn("tools", body)
            return httpx.Response(200, json={"choices": [{"message": {
                "role": "assistant", "content": '{"explanation":"Check the sample."}',
            }}]})

        self.mock_provider(provider)
        answer = llm_client.chat("Review the reading.", "pH changed.", json_mode=True)
        self.assertEqual(json.loads(answer)["explanation"], "Check the sample.")

    def test_provider_errors_are_actionable_without_exposing_keys(self):
        for status, hint in [(401, "LLM_API_KEY"), (403, "access"),
                             (404, "LLM_MODEL"), (429, "billing"), (500, "try again")]:
            with self.subTest(status=status):
                with patch.object(llm_client.httpx, "Client", side_effect=lambda **kwargs:
                                  self.client_type(transport=httpx.MockTransport(
                                      lambda request: httpx.Response(status, json={
                                          "error": {"message": "test-secret-never-log"},
                                      })), **kwargs)):
                    with self.assertRaises(llm_client.LLMError) as raised:
                        llm_client.chat_with_tools([{"role": "user", "content": "Hello"}], [])
                self.assertIn(str(status), str(raised.exception))
                self.assertIn(hint, str(raised.exception))
                self.assertNotIn("test-secret-never-log", str(raised.exception))

    def test_missing_key_does_not_contact_provider(self):
        with patch.object(llm_client, "LLM_API_KEY", ""), \
             patch.object(llm_client.httpx, "Client") as provider:
            with self.assertRaisesRegex(llm_client.LLMError, "No LLM API key"):
                llm_client.chat_with_tools([], [])
            provider.assert_not_called()

    def test_invalid_provider_reply_becomes_llm_error(self):
        self.mock_provider(lambda request: httpx.Response(200, json={"choices": None}))
        with self.assertRaisesRegex(llm_client.LLMError, "expected format"):
            llm_client.chat_with_tools([], [])


if __name__ == "__main__":
    unittest.main()
