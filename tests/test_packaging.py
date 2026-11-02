"""Пользовательские проверки безопасного назначения и переносимости комплекта."""
import os
from pathlib import Path
from posixpath import dirname, join, normpath
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from zipfile import ZipFile

from agent_lab.core import ROOT
from scripts.check_browser_package import links


class PackagingTests(unittest.TestCase):
    def package(self, destination):
        return subprocess.run([sys.executable, '-m', 'scripts.package_anatomy', str(destination)], cwd=ROOT,
                              env={**os.environ, 'PYTHONIOENCODING': 'utf-8'},
                              capture_output=True, encoding='utf-8', timeout=30)

    def test_source_or_ancestor_cannot_be_overwritten(self):
        entry = ROOT / 'index.html'
        original = entry.read_bytes()
        for destination in [ROOT, ROOT / 'site', ROOT / 'site' / 'agent-anatomy', ROOT / 'site' / 'unsafe-export']:
            with self.subTest(destination=destination):
                result = self.package(destination)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('вне исходников', result.stderr + result.stdout)
        self.assertEqual(entry.read_bytes(), original)
        self.assertFalse((ROOT / 'site' / 'unsafe-export').exists())

    def test_standalone_package_opens_practice_lecture_and_every_local_link(self):
        with TemporaryDirectory() as temporary:
            destination = Path(temporary) / 'course'
            result = self.package(destination)
            self.assertEqual(result.returncode, 0, result.stderr)
            with ZipFile(destination.with_suffix('.zip')) as archive:
                self.assertIsNone(archive.testzip())
                names = set(archive.namelist())
                self.assertIn('lecture.html', links(archive.read('index.html').decode('utf-8')))
                self.assertEqual(sum(n.startswith('assets/slides/') and n.endswith('.png') for n in names), 41)
                for name in names:
                    if name.endswith('.html'):
                        for target in links(archive.read(name).decode('utf-8')):
                            self.assertIn(normpath(join(dirname(name), target)), names, (name, target))


if __name__ == '__main__':
    unittest.main()
