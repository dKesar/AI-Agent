"""Собрать материалы сайта и автономный ZIP без сторонних пакетов."""
from hashlib import sha256
import json
from pathlib import Path
import re
import shutil
from urllib.parse import quote, unquote, urlsplit
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"


def main():
    assets = SITE / "assets"
    assets.mkdir(exist_ok=True)
    source = (SITE / "source-data.mjs").read_text(encoding="utf-8")
    manifest = json.loads(re.search(r"export const manifest=(.*);", source).group(1))
    for entry in manifest["files"]:
        original = ROOT / "lectures" / "visual" / entry["filename"]
        digest = sha256(original.read_bytes()).hexdigest()
        # The uploaded originals are authoritative; record their actual checksums.
        entry.update(bytes=original.stat().st_size, sha256=digest)
        shutil.copyfile(original, assets / entry["asset"])
    for original, destination in {
        "COURSE.md": "course.md",
        "practice/browser.md": "practice.md",
        "instructor/new-lecture.md": "teacher.md",
        "review/NEW_MATERIALS_AUDIT.md": "audit.md",
    }.items():
        document = ROOT / original
        def repository_link(match):
            label, target = match.groups()
            url = urlsplit(target)
            if url.scheme or url.netloc or not url.path:
                return match.group(0)
            resolved = (document.parent / unquote(url.path)).resolve()
            relative = resolved.relative_to(ROOT).as_posix()
            if not resolved.exists():
                raise ValueError(f"Missing reference: {original} -> {target}")
            address = "https://github.com/dKesar/AI-Agent/blob/main/" + quote(relative)
            if url.fragment:
                address += "#" + url.fragment
            return f"[{label}]({address})"
        content = re.sub(r"\[([^\]]*)\]\(([^)]+)\)", repository_link,
                         document.read_text(encoding="utf-8"))
        (assets / destination).write_text(content, encoding="utf-8")
    (assets / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    slides = [assets / "slides" / f"slide-{i}.png" for i in range(1, manifest["slides"] + 1)]
    missing = [p.name for p in slides if not p.is_file()]
    if missing:
        raise SystemExit("Нет изображений слайдов: " + ", ".join(missing))
    archive = assets / "offline-course.zip"
    with ZipFile(archive, "w", ZIP_DEFLATED) as bundle:
        # Keep the same entry point in the repository and the downloaded course.
        for name in ("index.html", "OPEN-COURSE.cmd"):
            bundle.write(ROOT / name, name)
        bundle.writestr("START-HERE.txt", (
            "ИИ-АГЕНТЫ: ЛЕКЦИЯ И ПРАКТИКА\n\n"
            "Распакуйте всю папку и откройте index.html.\n"
            "В Windows можно открыть OPEN-COURSE.cmd.\n"
            "Выберите «Открыть лекцию» или «Начать практику».\n"
            "В конце четырёх блоков практики скачайте один HTML-отчёт.\n"
            "Перед закрытием сохраните файл через меню «Моя работа».\n"
            "Интернет, Python и ключ модели для практики не нужны.\n"
        ).encode("utf-8"))
        for file in sorted(SITE.rglob("*")):
            if file.is_file() and file != archive:
                name = "site/" + file.relative_to(SITE).as_posix()
                if file == SITE / "legacy.html":
                    page = file.read_text(encoding="utf-8")
                    download = '<a class="button secondary" href="./assets/offline-course.zip" download>Скачать автономный комплект ZIP ↗</a>'
                    if download not in page:
                        raise SystemExit("Не найдена ссылка скачивания для автономной копии.")
                    page = page.replace(download, '<p>Вы уже открыли автономный комплект. Для передачи другому участнику используйте исходный ZIP.</p>')
                    bundle.writestr(name, page.encode("utf-8"))
                else:
                    bundle.write(file, name)
    with ZipFile(archive) as bundle:
        if bundle.testzip() is not None:
            raise SystemExit("Повреждён автономный архив.")
        required = ["index.html", "site/index.html", "site/lecture.html", "site/lecture.css", "site/lecture.js", "site/agent-anatomy/index.html",
                    "site/agent-anatomy/block-four-app.js"]
        required += [f"site/assets/slides/slide-{i}.png" for i in range(1, manifest["slides"] + 1)]
        if any(name not in bundle.namelist() for name in required):
            raise SystemExit("В автономном архиве не хватает материалов курса.")
    print(f"OK: {len(slides)} слайдов, оригиналы, материалы и {archive.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
