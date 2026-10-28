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
        for file in sorted(SITE.rglob("*")):
            if file.is_file() and file != archive:
                bundle.write(file, file.relative_to(SITE).as_posix())
    print(f"OK: {len(slides)} слайдов, оригиналы, материалы и {archive.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
