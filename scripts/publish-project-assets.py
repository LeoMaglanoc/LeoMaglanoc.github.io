#!/usr/bin/env python3
"""Copy tracked browser runtime files to their stable public asset paths.

Godot exports and the SLAM Vite build use their own build scripts. This manifest
covers the plain HTML/JS projects. Add new runtime files to project-assets.json.
Use --site-only for deployment to skip files excluded in _config.yml.
"""
from pathlib import Path
import argparse
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'scripts/project-assets.json'

def publish(check=False, site_only=False):
    excluded = []
    if site_only:
        import yaml
        excluded = [
            path.rstrip('/')
            for path in yaml.safe_load((ROOT / '_config.yml').read_text())['exclude']
        ]

    def published(relative):
        return not any(relative == path or relative.startswith(path + '/') for path in excluded)

    problems = []
    count = 0
    for source, entry in json.loads(MANIFEST.read_text()).items():
        destination = ROOT / entry['destination']
        expected = {
            relative for relative in entry['files']
            if published(f'{entry["destination"]}/{relative}')
        }
        if not expected:
            continue
        for relative in sorted(expected):
            src = ROOT / source / relative
            dst = destination / relative
            if not src.is_file():
                problems.append(f'Missing source: {src.relative_to(ROOT)}')
                continue
            if check:
                if not dst.is_file() or src.read_bytes() != dst.read_bytes():
                    problems.append(f'Stale published asset: {dst.relative_to(ROOT)}')
            else:
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
            count += 1
        # Remove obsolete runtime files after a manifest entry is removed.
        if destination.exists():
            for dst in destination.rglob('*'):
                if (dst.is_file()
                        and published(dst.relative_to(ROOT).as_posix())
                        and dst.relative_to(destination).as_posix() not in expected):
                    if check:
                        problems.append(f'Unexpected published asset: {dst.relative_to(ROOT)}')
                    else:
                        dst.unlink()
    if problems:
        raise SystemExit('\n'.join(problems))
    print(f'{"Checked" if check else "Published"} {count} browser runtime files')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--site-only', action='store_true',
                        help='Only copy files published by Jekyll; preserve retired assets in Git')
    args = parser.parse_args()
    publish(check=args.check, site_only=args.site_only)
