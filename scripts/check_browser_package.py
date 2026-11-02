"""Проверить локальные HTML-ссылки и автономный комплект всего курса."""
from html.parser import HTMLParser
import json
from pathlib import Path
from posixpath import dirname, join, normpath
from urllib.parse import unquote, urlsplit
from zipfile import ZipFile

from scripts.package_anatomy import FILES as PRACTICE_FILES


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.targets = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ("href", "src") and value:
                target = urlsplit(value)
                if not target.scheme and not target.netloc and target.path:
                    self.targets.append(unquote(target.path))


def links(content):
    parser = Links()
    parser.feed(content)
    return parser.targets


def main():
    root = Path(__file__).resolve().parents[1]
    site = root / "site"
    for page in [root / "index.html", *site.rglob("*.html")]:
        for target in links(page.read_text(encoding="utf-8")):
            resolved = (page.parent / target).resolve()
            assert resolved.is_relative_to(root) and resolved.is_file(), (page, target)
    count = json.loads((site / "assets/manifest.json").read_text(encoding="utf-8"))["slides"]
    required = ["index.html", "OPEN-COURSE.cmd", "site/app.js", "site/styles.css",
                "site/lecture.html", "site/lecture.css", "site/lecture.js",
                "site/assets/lecture.pptx", "site/assets/explanation.docx", "site/assets/manifest.json"]
    required += [f"site/assets/slides/slide-{i}.png" for i in range(1, count + 1)]
    required += ["site/agent-anatomy/" + name for name in PRACTICE_FILES]
    with ZipFile(site / "assets/offline-course.zip") as archive:
        names = set(archive.namelist())
        assert all(name in names for name in required), "Incomplete offline ZIP"
        assert "site/assets/offline-course.zip" not in names, "Nested archive"
        assert archive.testzip() is None, "Corrupt archive"
        for name in required:
            assert archive.read(name) == (root / name).read_bytes(), name
        assert "Вы уже открыли автономный комплект" in archive.read("site/index.html").decode("utf-8")
        for name in sorted(names):
            if name.endswith(".html"):
                for target in links(archive.read(name).decode("utf-8")):
                    assert normpath(join(dirname(name), target)) in names, (name, target)
    print(f"OK: HTML links, {count} slides, lecture viewer, four practice blocks and offline ZIP")


if __name__ == "__main__":
    main()
