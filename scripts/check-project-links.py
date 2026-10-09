#!/usr/bin/env python3
"""Verify stable project routes and their local HTML dependencies in _site."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit, unquote
import json
import hashlib
import yaml

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / '_site'
ROUTES = [f'/{name}/' for name in (
    'block-temple', 'scrap-orbit', 'rustzero', 'tiny-dreamer', 'slam',
    'g1', 'locomotion', 'euroguessr', 'dexterous-rl', 'loco-manipulation', 'parkour'
)] + [f'/assets/interactive/{name}/index.html' for name in ('pong', 'flappy')]
RETIRED = (
    'tiny-ego-vla', 'language-vision', 'block-world', 'dustfall-outpost',
    'mobile-sorting', 'painter', 'drone-racing', 'doom', 'chat'
)
EXCLUDED = [
    path.rstrip('/')
    for path in yaml.safe_load((ROOT / '_config.yml').read_text())['exclude']
]


def excluded(path):
    return any(path == prefix or path.startswith(prefix + '/') for prefix in EXCLUDED)


class Dependencies(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        for key in ('src', 'poster'):
            if attrs.get(key):
                self.urls.append(attrs[key])
        if tag == 'link' and attrs.get('rel') in ('stylesheet', 'modulepreload', 'icon'):
            self.urls.append(attrs.get('href', ''))


def check():
    pending = ROUTES.copy()
    visited = set()
    while pending:
        url = pending.pop()
        if url in visited:
            continue
        visited.add(url)
        path = SITE / unquote(url.lstrip('/'))
        if path.is_dir():
            path /= 'index.html'
        if not path.is_file():
            raise SystemExit(f'Missing public dependency: {url}')
        if path.suffix == '.html':
            parser = Dependencies()
            parser.feed(path.read_text())
            for reference in parser.urls:
                resolved = urlsplit(urljoin(url, reference))
                if not resolved.scheme and not resolved.netloc and resolved.path:
                    pending.append(resolved.path)
    for entry in json.loads((ROOT / 'scripts/project-assets.json').read_text()).values():
        for file in entry['files']:
            if excluded(f'{entry["destination"]}/{file}'):
                continue
            if not (SITE / entry['destination'] / file).is_file():
                raise SystemExit(f'Missing runtime file: {entry["destination"]}/{file}')
    for name, basename in [('scrap-orbit', 'index'), ('block-temple', 'index')]:
        for extension in ('html', 'js', 'wasm', 'pck'):
            folder = 'block-world' if extension == 'wasm' and name in ('scrap-orbit', 'block-temple') else name
            path = SITE / f'assets/interactive/{folder}/{basename}.{extension}'
            if not path.is_file():
                raise SystemExit(f'Missing Godot export: {path.relative_to(SITE)}')
    canonical = ROOT / 'assets/interactive/block-world/index.wasm'
    for name in ('scrap-orbit', 'block-temple'):
        original = ROOT / f'assets/interactive/{name}/index.wasm'
        if hashlib.sha256(original.read_bytes()).digest() != hashlib.sha256(canonical.read_bytes()).digest():
            raise SystemExit(f'{name}: shared Godot binary changed; update its loader before deploying')
        if '../block-world/index' not in (SITE / f'assets/interactive/{name}/index.html').read_text():
            raise SystemExit(f'{name}: shared engine path missing from published loader')
    # These runtime files live under retired demos but are still used by
    # Dexterous, TinyDreamer, BlockTemple, and Scrap Orbit.
    for filename in (
        'language-vision/vendor/ort.wasm.min.mjs',
        'language-vision/vendor/ort-wasm-simd-threaded.mjs',
        'euroguessr/vendor/ort-wasm-simd-threaded.wasm',
        'mobile-sorting/vendor/three.module.js',
        'mobile-sorting/vendor/three.core.js',
        'mobile-sorting/vendor/OrbitControls.js',
        'doom/vendor/ort/ort.min.js',
        'doom/vendor/ort/ort-wasm-simd-threaded.wasm',
        'block-world/index.audio.worklet.js',
        'block-world/index.audio.position.worklet.js',
    ):
        if not (SITE / 'assets/interactive' / filename).is_file():
            raise SystemExit(f'Missing shared runtime: {filename}')
    for name in RETIRED:
        for path in (SITE / name / 'index.html', SITE / 'assets/interactive' / name / 'index.html'):
            if path.exists():
                raise SystemExit(f'Retired demo must not be deployed: {path.relative_to(SITE)}')
    for name in ('race', 'robot-runner', 'tiny-ego-vla'):
        if (SITE / 'assets/interactive' / name).exists():
            raise SystemExit(f'Retired demo assets must not be deployed: {name}')
    for path in SITE.rglob('*'):
        if path.is_file() and excluded(path.relative_to(SITE).as_posix()):
            raise SystemExit(f'Excluded asset leaked into the public site: {path.relative_to(SITE)}')
    if (SITE / 'projects').exists():
        raise SystemExit('Project source leaked into the public site')
    published_bytes = sum(p.stat().st_size for p in SITE.rglob('*') if p.is_file())
    if published_bytes > 1_000_000_000:
        raise SystemExit(f'Published site exceeds the 1 GB Pages budget: {published_bytes:,} bytes')
    print(f'Published site: {published_bytes:,} bytes')
    print(f'Checked all {len(ROUTES)} public project URLs, {len(visited)} HTML dependencies and manifest runtime files')

if __name__ == '__main__':
    check()
