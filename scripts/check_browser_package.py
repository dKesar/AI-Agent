"""Проверить файлы, на которые ссылается сайт, и автономный архив."""
from pathlib import Path
import re
from zipfile import ZipFile


def main():
    site = Path(__file__).resolve().parents[1] / "site"
    content = "\n".join((site / name).read_text(encoding="utf-8")
                        for name in ("index.html", "app.mjs"))
    references = set(re.findall(r'''(?:href|src)=["'](\./[^"']+)''', content))
    missing = [ref for ref in references if not (site / ref).is_file()]
    if missing:
        raise SystemExit("Missing site files: " + ", ".join(missing))
    with ZipFile(site / "assets/offline-course.zip") as archive:
        names = archive.namelist()
        required = ["index.html", "app.js", "styles.css", "assets/lecture.pptx",
                    "assets/explanation.docx", "assets/manifest.json"]
        required += [f"assets/slides/slide-{i}.png" for i in range(1, 42)]
        assert all(name in names for name in required), "Incomplete offline ZIP"
        assert "assets/offline-course.zip" not in names, "Nested archive"
        assert archive.testzip() is None, "Corrupt archive"
        for name in required:
            assert archive.read(name) == (site / name).read_bytes(), name
    print("OK: site links, 41 slides, originals and offline ZIP")


if __name__ == "__main__":
    main()
