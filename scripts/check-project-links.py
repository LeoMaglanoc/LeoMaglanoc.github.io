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
    'rustzero', 'tiny-dreamer', 'tiny-ego-vla', 'language-vision', 'painter', 'drone-racing', 'doom', 'chat', 'slam', 'g1', 'locomotion', 'euroguessr'
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
    language_vision = SITE / 'assets/interactive/language-vision'
    for filename in ('worker.mjs', 'tokenizer.mjs', 'retrieval.mjs', 'masks.mjs', 'models/text-int8.onnx', 'models/model.json', 'vendor/ort.wasm.min.mjs', 'vendor/ort-wasm-simd-threaded.mjs', 'vendor/ort-wasm-simd-threaded.wasm'):
        if not (language_vision / filename).is_file():
            raise SystemExit(f'Missing language-vision runtime: {filename}')
    for scene in json.loads((language_vision / 'data/scenes.json').read_text()):
        for filename in ('scene.webp', 'thumb.webp', 'manifest.json', 'regions.json', 'embeddings.bin', 'masks.bin'):
            if not (language_vision / 'data' / scene['id'] / filename).is_file():
                raise SystemExit(f'Missing language-vision scene asset: {scene["id"]}/{filename}')
    tiny_ego = SITE / 'assets/interactive/tiny-ego-vla'
    results = json.loads((tiny_ego / 'results.json').read_text())
    if results.get('preview') is not False:
        raise SystemExit('Incomplete TinyEgoVLA preview must not be published')
    robot = results['robot']
    expected = len(results['config']['budgets']) * len(results['config']['seeds']) * len(results['config']['robot_tasks']) * len(results['config']['evaluation_initializations']) * 2
    if len(robot['rollouts']) != expected:
        raise SystemExit('Incomplete TinyEgoVLA evaluation export')
    for item in results['clips']:
        for key in ('video', 'poster', 'annotations'):
            if not (tiny_ego / item[key]).is_file():
                raise SystemExit(f'Missing TinyEgoVLA clip asset: {item[key]}')
    for item in results['robot']['rollouts']:
        for key in ('video', 'poster'):
            if not (tiny_ego / item[key]).is_file():
                raise SystemExit(f'Missing TinyEgoVLA rollout asset: {item[key]}')
    if (SITE / 'projects').exists():
        raise SystemExit('Project source leaked into the public site')
    print(f'Checked all {len(ROUTES)} public project URLs, {len(visited)} HTML dependencies and manifest runtime files')

if __name__ == '__main__':
    check()
