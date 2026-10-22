"""Скопировать в tests ПОСЛЕ добавления TR-01 согласно практике 3."""
import unittest
from agent_lab.core import Action, ToolError, Toolkit, run


class TravelTests(unittest.TestCase):
    def setUp(self):
        self.task = {"question": "Как оформить командировку?", "priority": "normal"}

    def test_travel_draft(self):
        result = run(self.task)
        self.assertEqual(result["status"], "awaiting_review")
        self.assertEqual(result["sources"], ["TR-01", "SLA-01"])
        self.assertFalse(result["sent"])

    def test_wrong_policy_rejected(self):
        kit = Toolkit(self.task)
        kit.execute(Action("search_policy", {"query": self.task["question"]}))
        kit.execute(Action("get_sla", {"priority": "normal"}))
        with self.assertRaisesRegex(ToolError, "policy_id_mismatch"):
            kit.execute(Action("prepare_draft", {"policy_id": "HR-01"}))
