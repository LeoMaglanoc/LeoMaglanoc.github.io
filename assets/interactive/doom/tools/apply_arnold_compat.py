#!/usr/bin/env python3
"""Apply narrowly-scoped PyTorch 2 compatibility edits to an image-local clone.

This tool intentionally refuses to run unless each expected upstream expression
is present. It never touches a checkout in the website repository.
"""

from __future__ import annotations

import sys
from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    if text.count(old) != 1:
        raise RuntimeError(f"Expected exactly one occurrence in {path}: {old!r}")
    path.write_text(text.replace(old, new))


def main() -> None:
    root = Path(sys.argv[1]).resolve()
    replace_once(
        root / "src/model/bucketed_embedding.py",
        "import torch.nn as nn\n",
        "import torch\nimport torch.nn as nn\n",
    )
    replace_once(
        root / "src/model/bucketed_embedding.py",
        "super(BucketedEmbedding, self).forward(indices.div(self.bucket_size))",
        "super(BucketedEmbedding, self).forward(\n"
        "            torch.div(indices, self.bucket_size, rounding_mode='floor')\n"
        "        )",
    )
    replace_once(
        root / "src/model/dqn/recurrent.py",
        "Variable(self.init_state_t[:, :1, :].data.clone(), volatile=True)",
        "Variable(self.init_state_t[:, :1, :].data.clone())",
    )
    replace_once(
        root / "src/model/dqn/base.py",
        "scores.data.max(0)[1][0]",
        "int(scores.argmax(dim=0).item())",
    )


if __name__ == "__main__":
    main()
