import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.client.llm_client import LLMError
from app.controller.agent import router
from app.service.advisory_agent import _trim_history


def soil_turn(index):
    call_id = f"call_soil_{index}"
    return [
        {"role": "user", "content": "How is my soil?"},
        {"role": "assistant", "content": None, "tool_calls": [{
            "id": call_id, "type": "function",
            "function": {"name": "get_soil_history", "arguments": "{}"},
        }]},
        {"role": "tool", "tool_call_id": call_id, "content": "pH 6.2"},
        {"role": "assistant", "content": "Your soil pH is 6.2."},
    ]


class AdvisoryAgentTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(router)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        configured = patch("app.controller.agent.is_available", return_value=True)
        configured.start()
        self.addCleanup(configured.stop)

    def test_chat_request_tool_round_and_followup(self):
        tool_message = soil_turn(1)[1]
        replies = [
            tool_message,
            {"role": "assistant", "content": "Your soil pH is 6.2."},
            {"role": "assistant", "content": "Keep monitoring your soil."},
        ]
        with patch("app.service.advisory_agent.llm_client.chat_with_tools",
                   side_effect=replies) as provider:
            first = self.client.post("/agent/chat", json={
                "messages": [{"role": "user", "content": "How is my soil?"}],
                "tool_results": [],
            })
            self.assertEqual(first.status_code, 200)
            requested = first.json()
            self.assertTrue(requested["needs_tools"])
            self.assertEqual(requested["tool_calls"][0]["name"], "get_soil_history")

            second = self.client.post("/agent/chat", json={
                "messages": requested["messages"],
                "tool_results": [{"tool_call_id": "call_soil_1",
                                  "name": "get_soil_history", "content": "pH 6.2"}],
            })
            self.assertEqual(second.status_code, 200)
            self.assertEqual(second.json()["answer"], "Your soil pH is 6.2.")
            self.assertFalse(second.json()["needs_tools"])

            history = second.json()["messages"]
            history.append({"role": "user", "content": "What should I do next?"})
            third = self.client.post("/agent/chat", json={"messages": history})
            self.assertEqual(third.status_code, 200)
            self.assertEqual(third.json()["answer"], "Keep monitoring your soil.")
            self.assertEqual(provider.call_args.kwargs["messages"][0]["role"], "system")

    def test_trimming_keeps_complete_tool_exchanges(self):
        messages = [{"role": "system", "content": "Soil advisor"}]
        for index in range(4):
            messages.extend(soil_turn(index))
        messages.append({"role": "user", "content": "And now?"})
        trimmed = _trim_history(messages)
        self.assertLess(len(trimmed), len(messages))
        self.assertEqual(trimmed[0], messages[0])
        self.assertEqual(trimmed[1]["role"], "user")
        self.assertEqual(trimmed[-1], messages[-1])
        calls = set()
        for message in trimmed:
            for call in message.get("tool_calls", []):
                calls.add(call["id"])
            if message["role"] == "tool":
                self.assertIn(message["tool_call_id"], calls)

    def test_current_turn_is_not_split_when_it_exceeds_history_budget(self):
        messages = [{"role": "system", "content": "Soil advisor"}]
        messages.extend(soil_turn(0))
        current = [{"role": "user", "content": "Check everything about this field."}]
        for index in range(8):
            current.extend(soil_turn(index + 1)[1:3])
        messages.extend(current)
        self.assertEqual(_trim_history(messages), [messages[0]] + current)

    def test_provider_failure_is_reported_as_service_unavailable(self):
        with patch("app.service.advisory_agent.llm_client.chat_with_tools",
                   side_effect=LLMError("LLM API key was rejected. Check LLM_API_KEY.")):
            response = self.client.post("/agent/chat", json={
                "messages": [{"role": "user", "content": "Hello"}], "tool_results": [],
            })
        self.assertEqual(response.status_code, 503)
        self.assertIn("LLM_API_KEY", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
