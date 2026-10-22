"""Офлайн-регрессия по статусам, источникам и отсутствию отправки."""
import argparse
import json
from pathlib import Path
from agent_lab.core import load_data, run


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    options = parser.parse_args()
    results = []
    for name, case in load_data("cases.json").items():
        result = run(case["task"], fail=name == "tool_error", attack=name == "injection")
        passed = (result["status"] == case["expected"] and not result["sent"]
                  and ("sources" not in case or result.get("sources") == case["sources"]))
        results.append({"case": name, "passed": passed, "expected": case["expected"], "result": result})
        print(f"{'PASS' if passed else 'FAIL'} {name}: {result['status']}")
    if options.output:
        options.output.parent.mkdir(parents=True, exist_ok=True)
        options.output.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0 if all(row["passed"] for row in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
