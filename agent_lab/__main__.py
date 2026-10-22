import argparse
import json
from pathlib import Path

from .core import ModelError, Toolkit, load_data, run, validate_policies, validate_task


def main():
    cases = load_data("cases.json")
    parser = argparse.ArgumentParser(description="Практикум по ИИ-агентам")
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--case", choices=list(cases), default="normal")
    source.add_argument("--task", type=Path, help="JSON-файл с question и priority")
    parser.add_argument("--mode", choices=["sim", "llm"], default="sim")
    parser.add_argument("--steps", type=int, default=8)
    parser.add_argument("--seconds", type=float, default=45)
    parser.add_argument("--extension", choices=["student", "solution"])
    parser.add_argument("--policies", type=Path, help="Свой JSON-набор учебных правил")
    parser.add_argument("--json", action="store_true", help="Структурированный результат")
    options = parser.parse_args()
    try:
        task = json.loads(options.task.read_text(encoding="utf-8")) if options.task else cases[options.case]["task"]
    except (OSError, UnicodeError, json.JSONDecodeError):
        parser.error("Не удалось прочитать JSON-файл задачи.")
    policies = None
    if options.policies:
        try:
            policies = validate_policies(json.loads(options.policies.read_text(encoding="utf-8")))
        except (OSError, UnicodeError, ValueError) as exc:
            parser.error("Не удалось загрузить правила. " + str(exc))
    estimate = None
    if options.extension == "student":
        from practice.starter.estimate_cost import estimate_cost as estimate
    elif options.extension == "solution":
        from solutions.estimate_cost import estimate_cost as estimate
    actor = None
    fail = not options.task and options.case == "tool_error"
    attack = not options.task and options.case == "injection"
    kit = Toolkit(task, fail=fail, attack=attack, estimate=estimate, policies=policies) if not validate_task(task) else None
    if options.mode == "llm" and kit is not None:
        from .openai_adapter import OpenAIModel
        try:
            actor = OpenAIModel(task, kit.schemas())
        except ModelError as exc:
            parser.error(str(exc) + ": задайте OPENAI_API_KEY и OPENAI_MODEL; см. examples/llm.md")
    result = run(task, actor, steps=options.steps, seconds=options.seconds,
                 fail=fail, attack=attack, estimate=estimate, toolkit=kit)
    result["mode"] = options.mode
    if actor is not None:
        result["model"] = actor.model
        result["usage"] = actor.usage
    if options.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"Режим: {options.mode} | Результат: {result['status']}")
        for event in result["trace"]:
            print(f"{event['step']}. {event['tool']}({json.dumps(event['args'], ensure_ascii=False)})")
            print("   " + json.dumps(event["result"], ensure_ascii=False))
        for key in ("text", "question", "reason", "error", "missing"):
            if key in result:
                print(f"{key}: {result[key]}")
        print("Отправлено: нет")
    return 1 if result["status"] in {"invalid_input", "model_error", "time_limit", "step_limit"} else 0


if __name__ == "__main__":
    raise SystemExit(main())
