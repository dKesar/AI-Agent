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
    if destination == source.resolve() or source.resolve() in destination.parents:
        raise SystemExit('Выберите папку вне исходников практикума.')
    for name in FILES:
        if not (source / name).is_file():
            raise SystemExit(f'Нет обязательного файла: {name}')
    for name in ('index.html', 'guide.html'):
        text = (source / name).read_text(encoding='utf-8')
        for target in re.findall(r'(?:src|href)="([^"#]+)"', text):
            if target not in FILES:
                raise SystemExit(f'Непереносимая ссылка: {name} -> {target}')
    destination.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        shutil.copyfile(source / name, destination / name)
    archive = destination.with_suffix('.zip')
    with ZipFile(archive, 'w', ZIP_DEFLATED) as bundle:
        for name in FILES:
            bundle.write(destination / name, name)
    with ZipFile(archive) as bundle:
        assert bundle.testzip() is None
        assert set(bundle.namelist()) == set(FILES)
    print(f'OK: {len(FILES)} files, offline package: {archive}')


if __name__ == '__main__':
    main()
