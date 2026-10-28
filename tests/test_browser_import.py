from copy import deepcopy
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from agent_lab.core import Toolkit, load_data, run
from scripts.import_browser_work import import_work, normalized, replay_packet


class BrowserImportTests(unittest.TestCase):
    def packet(self):
        book = load_data("policies.json")
        task = {"question": "Как установить редактор?", "priority": "normal"}
        result = normalized(run(task, toolkit=Toolkit(task, policies=book)))
        return {"schema": "ai-agent-work/v1", "policies": book, "attempts": [
            {"task": task, "policies": book, "steps": 8, "fail": False,
             "expected": {"status": "awaiting_review", "source": "IT-01"}, "result": result}]}

    def test_honest_packet_is_replayed(self):
        report = replay_packet(self.packet())
        self.assertTrue(report["browser_parity"])
        self.assertTrue(report["attempts"][0]["expectation_met"])

    def test_forged_browser_result_is_detected(self):
        packet = self.packet()
        packet["attempts"][0]["result"]["text"] = "Отправлено!"
        self.assertFalse(replay_packet(packet)["browser_parity"])

    def test_wrong_expectation_is_separate_from_parity(self):
        packet = self.packet()
        packet["attempts"][0]["expected"] = {"status": "needs_human", "source": ""}
        report = replay_packet(packet)
        self.assertTrue(report["browser_parity"])
        self.assertFalse(report["attempts"][0]["expectation_met"])

    def test_each_attempt_uses_its_snapshot(self):
        packet = self.packet()
        packet["policies"][0]["rule"] = "Новая инструкция"
        # Независимый снимок, как в браузерном экспорте.
        packet["attempts"][0]["policies"] = load_data("policies.json")
        self.assertTrue(replay_packet(packet)["browser_parity"])

    def test_invalid_limits_are_rejected(self):
        packet = self.packet()
        packet["attempts"][0]["steps"] = True
        with self.assertRaises(ValueError):
            replay_packet(packet)

    def test_unknown_schema_is_rejected(self):
        packet = self.packet()
        packet["schema"] = "other"
        with self.assertRaises(ValueError):
            replay_packet(packet)

    def test_invalid_packet_does_not_write_files(self):
        with TemporaryDirectory() as tmp:
            source = Path(tmp) / "work.json"
            source.write_text('{"schema":"wrong"}')
            output = Path(tmp) / "outputs"
            with self.assertRaises(ValueError):
                import_work(source, output)
            self.assertFalse(output.exists())

    def test_repeat_import_preserves_previous_work(self):
        with TemporaryDirectory() as tmp:
            source = Path(tmp) / "work.json"
            source.write_text(json.dumps(self.packet()))
            first, _ = import_work(source, Path(tmp) / "outputs")
            marker = first / "result.json"
            previous = marker.read_bytes()
            second, _ = import_work(source, Path(tmp) / "outputs")
            self.assertNotEqual(first, second)
            self.assertEqual(marker.read_bytes(), previous)


if __name__ == "__main__":
    unittest.main()
