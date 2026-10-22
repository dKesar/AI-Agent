import sys
from agent_lab.core import ROOT, load_data


def main():
    if sys.version_info < (3, 10):
        print("Нужен Python 3.10 или новее.")
        return 1
    required = ["README.md", "agent_lab/core.py", "lectures/01_agents.md", "lectures/02_tools.md"]
    missing = [p for p in required if not (ROOT / p).is_file()]
    if missing:
        print("Отсутствуют файлы:", ", ".join(missing))
        return 1
    for name in ("cases.json", "policies.json", "sla.json", "catalog.json"):
        load_data(name)
    print(f"OK: Python {sys.version.split()[0]}, учебные файлы и JSON доступны.")
    print("Базовому режиму не нужны пакеты, интернет или API-ключи.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
