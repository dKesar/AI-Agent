"""Повторить пакет браузерных опытов через Python-ядро, не доверяя его ответам."""
import argparse
import json
from pathlib import Path

from agent_lab.core import ROOT, Toolkit, run, validate_policies

STATUSES = {"awaiting_review", "needs_input", "needs_human", "step_limit", "time_limit", "invalid_input", "model_error"}


def normalized(value):
    """Время зависит от среды, остальное сопоставляется целиком."""
    if not isinstance(value, dict):
        return None
    return {k: v for k, v in value.items() if k != "elapsed_seconds"}


def replay_packet(packet):
    if not isinstance(packet, dict) or packet.get("schema") != "ai-agent-work/v1":
        raise ValueError("Нужен пакет ai-agent-work/v1.")
    policies = validate_policies(packet.get("policies"))
    attempts = packet.get("attempts")
    if not isinstance(attempts, list) or not 1 <= len(attempts) <= 200:
        raise ValueError("В пакете должно быть от 1 до 200 опытов.")
    rows = []
    for n, attempt in enumerate(attempts, 1):
        if not isinstance(attempt, dict):
            raise ValueError(f"Опыт {n}: неверная запись.")
        book = validate_policies(attempt.get("policies"))
        task = attempt.get("task")
        expected = attempt.get("expected")
        steps, fail = attempt.get("steps"), attempt.get("fail")
        if (not isinstance(task, dict) or set(task) != {"question", "priority"}
                or not isinstance(task["question"], str) or len(task["question"]) > 4000
                or task["priority"] not in {"normal", "urgent"}
                or type(steps) is not int or not 1 <= steps <= 100 or type(fail) is not bool
                or not isinstance(expected, dict) or set(expected) != {"status", "source"}
                or expected["status"] not in STATUSES or not isinstance(expected["source"], str)
                or len(expected["source"]) > 40):
            raise ValueError(f"Опыт {n}: проверьте вопрос, ожидание, приоритет и лимит.")
        result = run(task, steps=steps, fail=fail, toolkit=Toolkit(task, policies=book, fail=fail))
        rows.append({"attempt": n, "type": str(attempt.get("type", ""))[:80],
                     "task": task, "policies": book, "result": result,
                     "expected": expected,
                     "expectation_met": result["status"] == expected["status"]
                     and (result.get("sources") or [""])[0] == expected["source"],
                     "browser_matches_python": normalized(result) == normalized(attempt.get("result"))})
    return {"schema": "ai-agent-python-replay/v1", "attempts": rows,
            "browser_parity": all(r["browser_matches_python"] for r in rows), "policies": policies}


def import_work(source, output):
    if source.stat().st_size > 4_000_000:
        raise ValueError("Пакет больше 4 МБ. Разделите работу на несколько пакетов.")
    packet = json.loads(source.read_text(encoding="utf-8"))
    report = replay_packet(packet)  # Сначала полная валидация; до неё ничего не пишем.
    output.mkdir(parents=True, exist_ok=True)
    suffix = 1
    while True:
        folder = output / ("browser_work" if suffix == 1 else f"browser_work_{suffix}")
        try:
            folder.mkdir()
            break
        except FileExistsError:
            suffix += 1
    last = report["attempts"][-1]
    files = {"policies.json": last["policies"], "task.json": last["task"],
             "result.json": last["result"], "python-report.json": report}
    for filename, value in files.items():
        (folder / filename).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return folder, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "outputs")
    args = parser.parse_args()
    try:
        folder, report = import_work(args.file, args.output_dir)
    except (OSError, ValueError, TypeError, KeyError) as exc:
        print(f"Не удалось проверить пакет: {exc}")
        return 2
    print(f"Повторено опытов: {len(report['attempts'])}. Папка: {folder}")
    print("Браузер и Python: " + ("совпадают на этих опытах" if report["browser_parity"] else "ЕСТЬ РАСХОЖДЕНИЯ — смотрите python-report.json"))
    print("Совпало с ожиданием участника: " + str(sum(r["expectation_met"] for r in report["attempts"])) + f" из {len(report['attempts'])}.")
    return 0 if report["browser_parity"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
