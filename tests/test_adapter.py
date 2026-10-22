from copy import deepcopy
import json
import unittest
from unittest.mock import patch
import urllib.error
from agent_lab.core import ModelError, Toolkit, load_data, run
from agent_lab.openai_adapter import OpenAIModel, http_transport


def response(name="get_sla", args=None, call_id="call_1"):
    return {"status": "completed", "output": [
        {"type": "reasoning", "id": "rs_test", "summary": [], "encrypted_content": "opaque-test-data"},
        {"type": "function_call", "name": name, "call_id": call_id,
         "arguments": json.dumps(args if args is not None else {"priority": "normal"})}],
        "usage": {"input_tokens": 10, "output_tokens": 5}}


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.task = load_data("cases.json")["normal"]["task"]
        self.schemas = Toolkit(self.task).schemas()

    def model(self, transport):
        return OpenAIModel(self.task, self.schemas, key="test-key-not-real", model="test-model",
                           transport=transport, clock=lambda: 0)

    def test_complete_protocol_and_usage(self):
        replies = iter([response("search_policy", {"query": self.task["question"]}, "c1"),
                        response("get_sla", {"priority": "normal"}, "c2"),
                        response("prepare_draft", {"policy_id": "IT-01"}, "c3")])
        requests = []
        def transport(body, key, timeout):
            requests.append(deepcopy(body))
            return next(replies)
        actor = self.model(transport)
        result = run(self.task, actor, clock=lambda: 0)
        self.assertEqual(result["status"], "awaiting_review")
        self.assertEqual(actor.usage, {"input_tokens": 30, "output_tokens": 15})
        self.assertFalse(requests[0]["store"])
        second = requests[1]["input"]
        self.assertEqual(second[1]["type"], "reasoning")
        self.assertEqual(second[-1]["call_id"], "c1")
        self.assertEqual(second[-1]["type"], "function_call_output")
        self.assertNotIn("test-key-not-real", json.dumps(requests))

    def test_invalid_api_outputs(self):
        malformed = [None, {}, {"status": "incomplete", "output": []},
                     {"status": "completed", "output": [None]},
                     {"status": "completed", "output": []}]
        bad_json = response()
        bad_json["output"][-1]["arguments"] = "{broken"
        malformed.append(bad_json)
        malformed.append(response(args=[]))
        twice = response()
        twice["output"].append(deepcopy(twice["output"][-1]))
        malformed.append(twice)
        for data in malformed:
            with self.subTest(data=data):
                actor = self.model(lambda *_, data=data: data)
                with self.assertRaises(ModelError):
                    actor.choose({}, 10)
                self.assertEqual(len(actor.history), 1)

    def test_deadline_prevents_request(self):
        actor = self.model(lambda *_: self.fail("Сеть не должна вызываться"))
        with self.assertRaises(TimeoutError):
            actor.choose({}, 0)

    def test_timeout_is_capped_by_remaining_budget(self):
        observed = []
        actor = self.model(lambda body, key, timeout: observed.append(timeout) or response())
        actor.choose({}, 0.02)
        self.assertEqual(observed, [0.02])

    def test_http_errors_have_safe_codes(self):
        for status, expected in [(401, "authentication_failed"), (403, "access_denied"),
                                 (429, "rate_or_quota_limit"), (503, "upstream_server_error")]:
            with self.subTest(status=status):
                error = urllib.error.HTTPError("https://api.openai.com", status, "secret body", {}, None)
                with patch("urllib.request.urlopen", side_effect=error):
                    with self.assertRaisesRegex(ModelError, expected):
                        http_transport({}, "test-key-not-real", 1)

    def test_missing_configuration(self):
        with self.assertRaisesRegex(ModelError, "missing_api_configuration"):
            OpenAIModel(self.task, self.schemas, key="", model="")

    def test_actor_error_is_visible(self):
        def broken(*_):
            raise ModelError("rate_or_quota_limit")
        result = run(self.task, self.model(broken), clock=lambda: 0)
        self.assertEqual(result["error"], "rate_or_quota_limit")
        self.assertEqual(result["trace"], [])
