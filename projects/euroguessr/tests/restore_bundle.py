"""Check that an actual bundle restore preserves training and locked inference state."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import torch


def identical(a, b, name):
    if isinstance(a, torch.Tensor):
        assert torch.equal(a, b), name
    elif isinstance(a, np.ndarray):
        assert np.array_equal(a, b), name
    elif isinstance(a, dict):
        assert a.keys() == b.keys(), name
        for key in a:
            identical(a[key], b[key], f'{name}.{key}')
    elif isinstance(a, (tuple, list)):
        assert type(a) is type(b) and len(a) == len(b), name
        for i, (left, right) in enumerate(zip(a, b)):
            identical(left, right, f'{name}[{i}]')
    else:
        assert a == b, name


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--bundle', type=Path, required=True)
    parser.add_argument('--restored', type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads((args.bundle / 'bundle.json').read_text())
    rebound = {'run_dir', 'manifest', 'prefix_cache', 'cell_definition', 'warm_start', 'teacher_cache'}
    for run in manifest['runs']:
        for checkpoint in ['best.pt', 'last.pt']:
            original = torch.load(args.bundle / run / checkpoint, weights_only=False)
            restored = torch.load(args.restored / run / checkpoint, weights_only=False)
            assert original.keys() == restored.keys()
            for key in original:
                if key == 'arguments':
                    assert original[key].keys() == restored[key].keys()
                    for option in original[key].keys() - rebound:
                        identical(original[key][option], restored[key][option], option)
                else:
                    identical(original[key], restored[key], f'{run}/{checkpoint}/{key}')
            print(f'PASS {run}/{checkpoint}: exact model, optimizer, RNG, history and configuration; only paths rebound')
        for path in (args.bundle / run / 'models').rglob('*'):
            if path.is_file():
                target = args.restored / run / 'models' / path.relative_to(args.bundle / run / 'models')
                assert hashlib.sha256(path.read_bytes()).digest() == hashlib.sha256(target.read_bytes()).digest(), target
        print(f'PASS {run}: exact locked inference assets')


if __name__ == '__main__':
    main()
