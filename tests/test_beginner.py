from contextlib import redirect_stdout
from io import StringIO
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from agent_lab.core import ROOT, Toolkit, load_data, run, validate_policies
from scripts.beginner import create_case


class BeginnerTests(unittest.TestCase):
    def policy(self):
        return {'id': 'TR-01', 'title': 'Командировка', 'keywords': ['командиров'],
                'rule': 'Укажите цель и даты.'}

    def test_custom_rule_and_synonym_improvement(self):
        policies = load_data('policies.json') + [self.policy()]
        original = {'question': 'Как оформить командировку?', 'priority': 'normal'}
        other = {'question': 'Еду в служебную поездку', 'priority': 'normal'}
        self.assertEqual(run(original, toolkit=Toolkit(original, policies=policies))['sources'][0], 'TR-01')
        self.assertEqual(run(other, toolkit=Toolkit(other, policies=policies))['status'], 'needs_human')
        policies[-1]['keywords'].append('поездк')
        for task in (original, other):
            self.assertEqual(run(task, toolkit=Toolkit(task, policies=policies))['sources'][0], 'TR-01')

    def test_invalid_policy_inputs(self):
        variants = [None, [], [self.policy(), self.policy()]]
        for patch in ({'keywords': ['']}, {'keywords': ['два слова']}, {'id': 'SLA-01'},
                      {'keywords': [123]}, {'id': 'bad id'}, {'rule': ''}):
            variants.append([{**self.policy(), **patch}])
        for value in variants:
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_policies(value)

    def test_validation_normalizes_copy(self):
        original = [{**self.policy(), 'keywords': ['КОМАНДИРОВ']}]
        copy = validate_policies(original)
        self.assertEqual(copy[0]['keywords'], ['командиров'])
        self.assertEqual(original[0]['keywords'], ['КОМАНДИРОВ'])

    def test_wizard_saves_real_result_without_changing_base(self):
        before = load_data('policies.json')
        with tempfile.TemporaryDirectory() as directory:
            folders = []
            for _ in range(2):
                answers = iter(['', '', '', 'Укажите цель и даты.', 'Как оформить командировку?', '1'])
                with redirect_stdout(StringIO()):
                    folders.append(create_case(Path(directory), input_fn=lambda _: next(answers)))
            self.assertNotEqual(*folders)
            result = json.loads((folders[0] / 'result.json').read_text(encoding='utf-8'))
            self.assertEqual(result['sources'], ['TR-01', 'SLA-01'])
            self.assertFalse(result['sent'])
            self.assertEqual(load_data('policies.json'), before)

    def test_cli_uses_saved_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            task = {'question': 'Как оформить командировку?', 'priority': 'urgent'}
            (folder / 'task.json').write_text(json.dumps(task), encoding='utf-8')
            (folder / 'policies.json').write_text(json.dumps([self.policy()]), encoding='utf-8')
            result = subprocess.run([sys.executable, '-m', 'agent_lab', '--task', str(folder / 'task.json'),
                                     '--policies', str(folder / 'policies.json'), '--json'],
                                    cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
            self.assertEqual(result.returncode, 0, result.stderr)
            parsed = json.loads(result.stdout)
            self.assertEqual(parsed['sources'][0], 'TR-01')
            self.assertEqual(parsed['hours'], 4)

    def test_cli_rejects_invalid_policy_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'bad.json'
            path.write_text('[]', encoding='utf-8')
            result = subprocess.run([sys.executable, '-m', 'agent_lab', '--policies', str(path)],
                                    cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
            self.assertEqual(result.returncode, 2)
            self.assertNotIn('Traceback', result.stderr)

    def test_demo_and_clean_exit(self):
        for args, text in [(['--demo'], None), ([], '0\n')]:
            result = subprocess.run([sys.executable, '-m', 'scripts.beginner', *args], cwd=ROOT,
                                    input=text, capture_output=True, text=True, encoding='utf-8')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('ПРАКТИКУМ', result.stdout)
