from copy import deepcopy
import unittest
from agent_lab.core import Action, Simulator, ToolError, Toolkit, load_data, run


class Scripted:
    def __init__(self, *actions):
        self.actions = iter(actions)

    def choose(self, state, deadline):
        return next(self.actions)

    def observe(self, result):
        pass


class Clock:
    value = 0

    def __call__(self):
        return self.value


class CoreTests(unittest.TestCase):
    def setUp(self):
        self.cases = load_data("cases.json")
        self.task = self.cases["normal"]["task"]

    def test_all_cases(self):
        for name, case in self.cases.items():
            with self.subTest(name=name):
                result = run(case["task"], fail=name == "tool_error", attack=name == "injection")
                self.assertEqual(result["status"], case["expected"])
                self.assertFalse(result["sent"])
                if "sources" in case:
                    self.assertEqual(result["sources"], case["sources"])

    def test_question_changes_answer(self):
        normal = run(self.task)
        access = run(self.cases["access"]["task"])
        self.assertNotEqual(normal["text"], access["text"])
        self.assertEqual(access["sources"][0], "IT-02")

    def test_urgent_sla(self):
        self.assertEqual(run(self.cases["urgent"]["task"])["hours"], 4)

    def test_missing_input_does_not_call_actor(self):
        result = run({}, Scripted())
        self.assertEqual(result["status"], "needs_input")
        self.assertEqual(result["trace"], [])

    def test_non_object_input(self):
        for task in (None, [], "x"):
            self.assertEqual(run(task)["status"], "invalid_input")

    def test_bad_priority(self):
        self.assertEqual(run({**self.task, "priority": "critical"})["status"], "needs_input")

    def test_forbidden_action(self):
        result = run(self.task, Scripted(Action("send_email", {"to": "outside@example.invalid"})))
        self.assertEqual(result["reason"], "tool_not_allowed")
        self.assertEqual(len(result["trace"]), 1)
        self.assertEqual(result["trace"][0]["result"]["error"], "tool_not_allowed")

    def test_wrong_policy_id(self):
        kit = Toolkit(self.task)
        kit.execute(Action("search_policy", {"query": self.task["question"]}))
        kit.execute(Action("get_sla", {"priority": "normal"}))
        with self.assertRaisesRegex(ToolError, "policy_id_mismatch"):
            kit.execute(Action("prepare_draft", {"policy_id": "HR-01"}))

    def test_draft_requires_evidence(self):
        with self.assertRaisesRegex(ToolError, "evidence_missing"):
            Toolkit(self.task).execute(Action("prepare_draft", {"policy_id": "IT-01"}))

    def test_ambiguous_evidence_cannot_finish(self):
        task = self.cases["ambiguous"]["task"]
        kit = Toolkit(task)
        kit.execute(Action("search_policy", {"query": task["question"]}))
        kit.execute(Action("get_sla", {"priority": task["priority"]}))
        with self.assertRaisesRegex(ToolError, "ambiguous"):
            kit.execute(Action("prepare_draft", {"policy_id": "IT-01"}))

    def test_arguments_and_scope(self):
        for action in (Action("get_sla", {"priority": "urgent"}),
                       Action("get_sla", {"priority": "normal", "approved": True}),
                       Action("get_sla", []), Action("get_sla", {"priority": 1}),
                       Action("search_policy", {"query": "другая заявка"})):
            with self.subTest(action=action), self.assertRaises(ToolError):
                Toolkit(self.task).execute(action)

    def test_returned_data_cannot_mutate_state(self):
        kit = Toolkit(self.task)
        result = kit.execute(Action("get_sla", {"priority": "normal"}))
        result["hours"] = 0
        self.assertEqual(kit.state["sla"]["hours"], 24)

    def test_policy_gets_snapshot(self):
        class Mutator(Simulator):
            def choose(self, state, deadline):
                if "sla" in state:
                    state["sla"]["hours"] = 0
                return super().choose(state, deadline)
        result = run(self.task, Mutator(self.task))
        self.assertEqual(result["hours"], 24)

    def test_injection_is_visible_but_not_a_command(self):
        result = run(self.task, attack=True)
        self.assertIn("external_note", result["trace"][0]["result"])
        self.assertNotIn("send_email", result["text"])
        self.assertEqual([x["tool"] for x in result["trace"]],
                         ["search_policy", "get_sla", "prepare_draft"])

    def test_two_tool_errors_stop(self):
        result = run(self.task, fail=True)
        self.assertEqual(result["reason"], "two_tool_errors")
        self.assertEqual(len(result["trace"]), 2)

    def test_step_limit(self):
        result = run(self.task, steps=1)
        self.assertEqual(result["status"], "step_limit")
        self.assertEqual(len(result["trace"]), 1)

    def test_invalid_limits(self):
        for kwargs in ({"steps": 0}, {"steps": True}, {"seconds": -1}, {"seconds": float("nan")}):
            with self.subTest(kwargs=kwargs):
                self.assertEqual(run(self.task, **kwargs)["status"], "invalid_input")

    def test_zero_time(self):
        self.assertEqual(run(self.task, seconds=0)["status"], "time_limit")

    def test_slow_tool_does_not_return_success(self):
        clock = Clock()
        class SlowKit(Toolkit):
            def execute(self, action):
                result = super().execute(action)
                if action.name == "prepare_draft":
                    clock.value = 2
                return result
        result = run(self.task, seconds=1, clock=clock, toolkit=SlowKit(self.task))
        self.assertEqual(result["status"], "time_limit")
        self.assertEqual(result["trace"][-1]["tool"], "prepare_draft")

    def test_slow_observer(self):
        clock = Clock()
        class SlowObserver(Simulator):
            def observe(self, result):
                clock.value = 2
        result = run(self.task, SlowObserver(self.task), seconds=1, clock=clock)
        self.assertEqual(result["status"], "time_limit")

    def test_slow_chooser(self):
        clock = Clock()
        class SlowChooser(Simulator):
            def choose(self, state, deadline):
                clock.value = 2
                return super().choose(state, deadline)
        result = run(self.task, SlowChooser(self.task), seconds=1, clock=clock)
        self.assertEqual(result["status"], "time_limit")
        self.assertEqual(result["trace"], [])

    def test_inputs_are_not_mutated(self):
        snapshot = deepcopy(self.task)
        run(self.task)
        self.assertEqual(self.task, snapshot)

    def test_quote_cannot_be_skipped(self):
        from solutions.estimate_cost import estimate_cost
        task = self.cases["procurement"]["task"]
        kit = Toolkit(task, estimate=estimate_cost)
        kit.execute(Action("search_policy", {"query": task["question"]}))
        kit.execute(Action("get_sla", {"priority": "normal"}))
        with self.assertRaisesRegex(ToolError, "quote_missing"):
            kit.execute(Action("prepare_draft", {"policy_id": "PR-01"}))

    def test_quote_scope(self):
        from solutions.estimate_cost import estimate_cost
        kit = Toolkit(self.cases["procurement"]["task"], estimate=estimate_cost)
        with self.assertRaisesRegex(ToolError, "purchase_out_of_scope"):
            kit.execute(Action("estimate_cost", {"item": "laptop", "quantity": 3}))

    def test_quote_result_contract(self):
        kit = Toolkit(self.cases["procurement"]["task"], estimate=lambda *_: {"total_rub": True, "source": "X"})
        with self.assertRaisesRegex(ToolError, "invalid_tool_result"):
            kit.execute(Action("estimate_cost", {"item": "laptop", "quantity": 2}))

    def test_unexpected_tool_error_is_contained(self):
        def broken(*args):
            raise RuntimeError("private diagnostic")
        result = run(self.cases["procurement"]["task"], estimate=broken)
        self.assertEqual(result["status"], "needs_human")
        self.assertNotIn("private diagnostic", str(result))
