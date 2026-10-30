#!/usr/bin/env python3
"""Make a minimal, reproducible Chrome MV3 release package (no dependencies)."""
import argparse
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent
RUNTIME = (
    'manifest.json', 'popup.html', 'popup.js', 'core.js', 'renderer.js',
    'page.js', 'reliability.js', 'zip.js', 'dom-button.js',
)

def make():
    manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
    assert manifest.get('manifest_version') == 3
    version = manifest['version']
    out = ROOT / 'dist' / f'chatgpt-obsidian-exporter-v{version}.zip'
    out.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(out, 'w', ZIP_DEFLATED) as archive:
        for name in RUNTIME:
            path = ROOT / name
            assert path.is_file(), f'Missing extension file: {name}'
            archive.write(path, name)
    print(out)
    return out

def verify(path):
    with ZipFile(path) as archive:
        names = archive.namelist()
        assert set(names) == set(RUNTIME), 'Unexpected release package contents'
        assert archive.testzip() is None, 'CRC verification failed'
        manifest = json.loads(archive.read('manifest.json').decode('utf-8'))
        assert manifest['manifest_version'] == 3
        for name in manifest.get('permissions', []):
            assert name in {'activeTab', 'scripting', 'storage'}, f'Unreviewed permission: {name}'
    print('Release ZIP verified:',path)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    path = make()
    if args.verify:
        verify(path)
