"""Сверить браузерный симулятор с Python на базовом учебном подмножестве."""
from copy import deepcopy
import json
import os
from pathlib import Path
import shutil
import subprocess

from agent_lab.core import ROOT, Toolkit, load_data, run


def main():
    base = load_data("policies.json")
    own = {"id": "TR-01", "title": "Командировка", "keywords": ["командиров"], "rule": "Укажите цель и даты."}
    cases = []
    questions = ["Как установить рабочий редактор?", "Как восстановить доступ к аккаунту?",
                 "Как поставить программу?", "Как поставить приложение?", "Не нужно устанавливать редактор",
                 "Как оформить отпуск?", "Установить редактор и восстановить доступ", "КАК УСТАНОВИТЬ РЕДАКТОР?",
                 "редакторский", "предустановлен", "УСТАНОВИТЕ", "🙂 установить, редактор!", ""]
    for question in questions:
        for priority in ("normal", "urgent"):
            cases.append({"name": f"{question}/{priority}", "task": {"question": question, "priority": priority}, "policies": base, "options": {}})
    for question in ("Как оформить командировку?", "Как оформить служебную поездку?", "Поездка на отдых", "Командировка и доступ"):
        for improved in (False, True):
            policy = deepcopy(own)
            if improved:
                policy["keywords"].append("поездк")
            cases.append({"name": f"custom/{question}/{improved}", "task": {"question": question, "priority": "normal"}, "policies": base + [policy], "options": {}})
    for steps in (1, 2, 3, 8):
        for fail in (False, True):
            cases.append({"name": f"limits/{steps}/{fail}", "task": {"question": "Установить редактор", "priority": "normal"}, "policies": base, "options": {"steps": steps, "fail": fail}})
    for seconds in (0, 45):
        cases.append({"name": f"time/{seconds}", "task": {"question": "Установить редактор", "priority": "normal"}, "policies": base, "options": {"seconds": seconds}})
    cases.append({"name": "injection-note", "task": {"question": "Установить редактор", "priority": "normal"}, "policies": base, "options": {"attack": True}})
    for c in cases:
        options = c["options"]
        kit = Toolkit(c["task"], policies=c["policies"], fail=options.get("fail", False), attack=options.get("attack", False))
        c["expected"] = run(c["task"], toolkit=kit, **options)
        del c["expected"]["elapsed_seconds"]
    node = os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
    if not node:
        print("Для сверки реализации JavaScript нужен Node.js 20+. Основная практика браузера не требует установки Node.")
        return 2
    completed = subprocess.run([node, str(ROOT / "scripts/browser_parity.mjs")], input=json.dumps(cases, ensure_ascii=False), capture_output=True, text=True, timeout=30)
    print(completed.stdout.strip() or completed.stderr.strip())
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
