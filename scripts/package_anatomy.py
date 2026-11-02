"""Проверить и упаковать самостоятельный практикум, без сторонних пакетов."""
from pathlib import Path
import argparse
import re
import shutil
from zipfile import ZipFile, ZIP_DEFLATED

FILES = ('index.html', 'styles.css', 'engine.js', 'lesson-model.js', 'block-two-model.js', 'block-two-app.js', 'block-three-model.js', 'course-model.js', 'block-three-app.js', 'block-four-model.js', 'block-four-app.js', 'app.js', 'guide.html', 'START-HERE.txt')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path, help='Папка автономного комплекта')
    args = parser.parse_args()
    source = Path(__file__).resolve().parents[1] / 'site' / 'agent-anatomy'
    destination = args.destination.resolve()
    site = source.parent.resolve()
    if destination == site or site in destination.parents or destination in site.parents:
        raise SystemExit('Выберите папку вне исходников практикума.')
    for name in FILES:
        if not (source / name).is_file():
            raise SystemExit(f'Нет обязательного файла: {name}')
    for name in ('index.html', 'guide.html'):
        text = (source / name).read_text(encoding='utf-8')
        for target in re.findall(r'(?:src|href)="([^"#]+)"', text):
            if target not in FILES and target != '../lecture.html':
                raise SystemExit(f'Непереносимая ссылка: {name} -> {target}')
    destination.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        shutil.copyfile(source / name, destination / name)
    page = destination / 'index.html'
    page.write_text(page.read_text(encoding='utf-8').replace('href="../lecture.html"', 'href="lecture.html"'), encoding='utf-8')
    lecture_files = ['lecture.html', 'lecture.css', 'lecture-chapter.js', 'lecture.js', 'assets/lecture.pptx', 'assets/explanation.docx']
    lecture_files += [f'assets/slides/slide-{i}.png' for i in range(1, 42)]
    for name in lecture_files:
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source.parent / name, target)
    page = destination / 'lecture.html'
    page.write_text(page.read_text(encoding='utf-8').replace('href="../index.html"', 'href="index.html"').replace('← К началу курса', '← К практике').replace('href="./agent-anatomy/index.html"', 'href="./index.html"').replace('href="./agent-anatomy/guide.html"', 'href="./guide.html"'), encoding='utf-8')
    packaged = [*FILES, *lecture_files]
    archive = destination.with_suffix('.zip')
    with ZipFile(archive, 'w', ZIP_DEFLATED) as bundle:
        for name in packaged:
            bundle.write(destination / name, name)
    with ZipFile(archive) as bundle:
        assert bundle.testzip() is None
        assert set(bundle.namelist()) == set(packaged)
    print(f'OK: {len(packaged)} files including lecture, offline package: {archive}')


if __name__ == '__main__':
    main()
