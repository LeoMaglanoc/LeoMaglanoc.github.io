#!/usr/bin/env python3
"""Verify stable project routes and their local HTML dependencies in _site."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit, unquote
import json

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / '_site'
ROUTES = [f'/{name}/' for name in (
    'block-world', 'scrap-orbit', 'dustfall-outpost', 'mobile-sorting',
    'rustzero', 'tiny-dreamer', 'painter', 'drone-racing', 'doom', 'chat', 'slam', 'g1'
)] + [f'/assets/interactive/{name}/index.html' for name in (
    'pong', 'race', 'robot-runner', 'flappy'
)]

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
            if not (SITE / entry['destination'] / file).is_file():
                raise SystemExit(f'Missing runtime file: {entry["destination"]}/{file}')
    for name, basename in [('block-world', 'index'), ('scrap-orbit', 'index'), ('dustfall-outpost', 'game')]:
        for extension in ('html', 'js', 'wasm', 'pck'):
            path = SITE / f'assets/interactive/{name}/{basename}.{extension}'
            if not path.is_file():
                raise SystemExit(f'Missing Godot export: {path.relative_to(SITE)}')
    if (SITE / 'projects').exists():
        raise SystemExit('Project source leaked into the public site')
    print(f'Checked all {len(ROUTES)} public project URLs, {len(visited)} HTML dependencies and manifest runtime files')

if __name__ == '__main__':
    check()
