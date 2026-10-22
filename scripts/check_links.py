"""Проверка локальных Markdown-ссылок на файлы; внешние URL и якоря не проверяются."""
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit
from agent_lab.core import ROOT


def main():
    broken = []
    count = 0
    for path in ROOT.rglob("*.md"):
        if ".git" in path.parts or ".venv" in path.parts:
            continue
        content = re.sub(r"```.*?```", "", path.read_text(encoding="utf-8"), flags=re.S)
        for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", content):
            url = urlsplit(target)
            if url.scheme or url.netloc or not url.path:
                continue
            count += 1
            resolved = (path.parent / unquote(url.path)).resolve()
            if not resolved.is_relative_to(ROOT) or not resolved.exists():
                broken.append(f"{path.relative_to(ROOT)} -> {target}")
    print("\n".join(broken) if broken else f"OK: {count} локальных ссылок на файлы.")
    return bool(broken)


if __name__ == "__main__":
    raise SystemExit(main())
