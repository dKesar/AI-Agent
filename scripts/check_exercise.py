"""Проверяет студенческий модуль по умолчанию, эталон — только с --solution."""
import argparse
import unittest
from agent_lab.core import ToolError, load_data, run


def suite_for(estimate):
    class ExerciseTests(unittest.TestCase):
        def test_known_item(self):
            self.assertEqual(estimate("laptop", 2), {"total_rub": 140000, "source": "CATALOG-01"})

        def test_another_item(self):
            self.assertEqual(estimate("keyboard", 3)["total_rub"], 9000)

        def test_unknown_item(self):
            for item in ("unknown", [], None):
                with self.subTest(item=item), self.assertRaises(ToolError):
                    estimate(item, 1)

        def test_invalid_quantity(self):
            for quantity in (0, -1, 101, True, 1.5, "2", None):
                with self.subTest(quantity=quantity), self.assertRaises(ToolError):
                    estimate("laptop", quantity)

        def test_boundaries(self):
            self.assertEqual(estimate("monitor", 1)["total_rub"], 20000)
            self.assertEqual(estimate("monitor", 100)["total_rub"], 2000000)

        def test_agent_integration(self):
            result = run(load_data("cases.json")["procurement"]["task"], estimate=estimate)
            self.assertEqual(result["status"], "awaiting_review")
            self.assertEqual(result["quote"]["total_rub"], 140000)
            self.assertIn("estimate_cost", [row["tool"] for row in result["trace"]])
            self.assertIn("CATALOG-01", result["sources"])
            self.assertFalse(result["sent"])
    return unittest.defaultTestLoader.loadTestsFromTestCase(ExerciseTests)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--solution", action="store_true")
    options = parser.parse_args()
    if options.solution:
        from solutions.estimate_cost import estimate_cost
    else:
        from practice.starter.estimate_cost import estimate_cost
    result = unittest.TextTestRunner(verbosity=2).run(suite_for(estimate_cost))
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
