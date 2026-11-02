import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from agent_lab.core import ROOT


class CLITests(unittest.TestCase):
    def invoke(self, *args):
        return subprocess.run([sys.executable, "-m", "agent_lab", *args], cwd=ROOT,
                              capture_output=True, text=True, encoding="utf-8")

    def test_normal_json(self):
        result = self.invoke("--case", "normal", "--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["status"], "awaiting_review")

    def test_limit_exit_code(self):
        result = self.invoke("--steps", "1", "--json")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stdout)["status"], "step_limit")

    def test_custom_task_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "task.json"
            path.write_text(json.dumps({"question": "Нужна справка", "priority": "normal"}), encoding="utf-8")
            result = self.invoke("--task", str(path), "--json")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["sources"][0], "HR-01")

    def test_invalid_task_file(self):
        self.assertEqual(self.invoke("--task", "does-not-exist.json").returncode, 2)

    def test_windows_utf8_bom_task_and_policies(self):
        from agent_lab.core import load_data
        with tempfile.TemporaryDirectory() as directory:
            task = Path(directory) / "task.json"
            policies = Path(directory) / "policies.json"
            task.write_text(json.dumps({"question": "Установить редактор", "priority": "normal"}), encoding="utf-8-sig")
            policies.write_text(json.dumps(load_data("policies.json")), encoding="utf-8-sig")
            result = self.invoke("--task", str(task), "--policies", str(policies), "--json")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["status"], "awaiting_review")

    def test_json_output_is_utf8_even_with_a_legacy_windows_encoding(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "task.json"
            question = "Установить редактор 🙂"
            path.write_text(json.dumps({"question": question, "priority": "normal"}), encoding="utf-8")
            result = subprocess.run([sys.executable, '-X', 'utf8=0', '-m', 'agent_lab', '--task', str(path), '--json'],
                                    cwd=ROOT, env={**os.environ, 'PYTHONIOENCODING': 'cp1251'},
                                    capture_output=True, encoding='utf-8')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)['trace'][0]['args']['query'], question)

    def test_solution_extension(self):
        result = self.invoke("--case", "procurement", "--extension", "solution", "--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["quote"]["total_rub"], 140000)
