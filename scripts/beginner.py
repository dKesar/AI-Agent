"""Пошаговая практика без редактирования кода. Запуск: python -m scripts.beginner."""
import argparse
import json
import sys
from pathlib import Path

from agent_lab.core import ROOT, Toolkit, load_data, run, validate_policies

STATUSES = {
    "awaiting_review": "Черновик готов: сотруднику нужно его проверить.",
    "needs_input": "Нужно уточнение: данных недостаточно для одного ответа.",
    "needs_human": "Нужно участие сотрудника: продолжать автоматически нельзя.",
    "step_limit": "Достигнут лимит действий.",
    "time_limit": "Истекло время выполнения.",
    "invalid_input": "Входные данные нужно исправить.",
    "model_error": "Возникла ошибка выбора действия.",
}
TOOLS = {
    "search_policy": "Поиск правила в учебной памятке",
    "get_sla": "Получение срока первого ответа",
    "prepare_draft": "Подготовка черновика по найденным данным",
    "request_clarification": "Уточняющий вопрос человеку",
    "escalate_to_human": "Передача вопроса сотруднику",
}


def explain(result):
    print("\n" + STATUSES[result["status"]])
    for event in result["trace"]:
        print(f"  Шаг {event['step']}: {TOOLS.get(event['tool'], event['tool'])}.")
        observed = event["result"]
        if "matches" in observed:
            print("    Найдены правила: " + (", ".join(p["id"] for p in observed["matches"]) or "нет совпадений"))
        if "hours" in observed and "status" not in observed:
            print(f"    Первый ответ: в течение {observed['hours']} календарных часов.")
        if "error" in observed:
            print("    Инструмент сообщил об ошибке: " + observed["error"])
    for key in ("text", "question", "reason"):
        if key in result:
            print("\n" + result[key])
    print("\nЭто локальный симулятор. Языковая модель и отправка сообщений не используются.")


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_text(prompt, *, default=None, input_fn=input):
    while True:
        value = input_fn(prompt).strip()
        if not value and default is not None:
            value = default
        if value and len(value) <= 4000:
            return value
        print("Введите от 1 до 4000 символов. Для выхода нажмите Ctrl+C.")


def create_case(output, *, input_fn=input):
    print("\nСоздадим ВАШУ копию памятки. Исходные правила курса останутся на месте.")
    print("Заполняйте учебными данными. Пример: Командировка / командиров / TR-01.")
    policies = load_data("policies.json")
    title = read_text("Название задачи [Командировка]: ", default="Командировка", input_fn=input_fn)
    while True:
        number = read_text("Номер правила [TR-01]: ", default="TR-01", input_fn=input_fn).upper()
        keys = read_text("Ключевые слова через запятую [командиров]: ", default="командиров", input_fn=input_fn)
        rule = read_text("Что должен сделать человек? ", input_fn=input_fn)
        new = {"id": number, "title": title, "keywords": [k.strip() for k in keys.split(",")], "rule": rule}
        try:
            policies = validate_policies(policies + [new])
            break
        except ValueError as exc:
            print("Исправим запись: " + str(exc))
    question = read_text("Напишите вопрос, в котором есть ваш ключ: ", input_fn=input_fn)
    while True:
        priority = input_fn("Срочно? 1 — обычный срок (24 часа), 2 — срочно (4 часа) [1]: ").strip() or "1"
        if priority in {"1", "2"}:
            break
        print("Введите 1 или 2.")
    task = {"question": question, "priority": "urgent" if priority == "2" else "normal"}
    # Каждая попытка получает свою папку; повторный запуск не теряет прошлую работу.
    folder = output / "my_case"
    suffix = 2
    while folder.exists():
        folder = output / f"my_case_{suffix}"
        suffix += 1
    write_json(folder / "policies.json", policies)
    write_json(folder / "task.json", task)
    result = run(task, toolkit=Toolkit(task, policies=policies))
    write_json(folder / "result.json", result)
    explain(result)
    print(f"\nВаша работа сохранена: {folder}")
    if result["status"] != "awaiting_review" or result.get("sources", [None])[0] != number:
        print("Собственное правило пока не выбрано однозначно. Сравните слова вопроса и ключи; это полезный результат проверки.")
    print("Для нового опыта откройте task.json обычным текстовым редактором, измените вопрос и запустите:")
    print(f'python -m agent_lab --task "{folder / "task.json"}" --policies "{folder / "policies.json"}"')
    return folder


def main():
    if sys.version_info < (3, 11):
        print("Для курса нужен Python 3.11 или новее. Обратитесь к преподавателю.")
        return 1
    parser = argparse.ArgumentParser(description="Практика по агентам для начинающих")
    parser.add_argument("--demo", action="store_true", help="Показать пример без ввода")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "outputs")
    options = parser.parse_args()
    print("\nПРАКТИКУМ: ПОНЯТЬ И СДЕЛАТЬ\nПишем обычным языком, код менять не требуется.")
    cases = load_data("cases.json")
    if options.demo:
        explain(run(cases["normal"]["task"]))
        return 0
    try:
        while True:
            print("\n1 — Готовый пример\n2 — Неоднозначный вопрос\n3 — Свой вопрос\n4 — Создать своё правило и пример\n0 — Выход")
            selected = input("Выберите номер: ").strip()
            if selected == "0":
                return 0
            if selected in ("1", "2"):
                print("Перед запуском предскажите: будет ответ или уточняющий вопрос?")
                input("Скажите прогноз партнёру и нажмите Enter: ")
                explain(run(cases["normal" if selected == "1" else "ambiguous"]["task"]))
            elif selected == "3":
                question = read_text("Ваш учебный вопрос: ")
                explain(run({"question": question, "priority": "normal"}))
            elif selected == "4":
                create_case(options.output_dir)
            else:
                print("Нужен один из номеров 0, 1, 2, 3 или 4.")
    except (EOFError, KeyboardInterrupt):
        print("\nПрактика завершена. Уже сохранённые файлы остались на месте.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
