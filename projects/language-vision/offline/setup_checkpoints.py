"""Fetch official checkpoints and verify hashes; no Hub auth is needed."""

import hashlib, subprocess
from common import PROJECT

files = [
    (
        "mobileclip_s0.pt",
        "https://docs-assets.developer.apple.com/ml-research/datasets/mobileclip/mobileclip_s0.pt",
        "809b408eff74f8058843e86a1f92967097d42ba782450e85b8f4867b7f0ca0b7",
    ),
    (
        "sam2.1_hiera_tiny.pt",
        "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt",
        "7402e0d864fa82708a20fbd15bc84245c2f26dff0eb43a4b5b93452deb34be69",
    ),
]
(PROJECT / "artifacts").mkdir(exist_ok=True)
for name, url, sha in files:
    p = PROJECT / "artifacts" / name
    if not p.exists():
        subprocess.run(["curl", "-L", "--fail", "-o", str(p), url], check=True)
    digest = hashlib.sha256(p.read_bytes()).hexdigest()
    if sha:
        assert digest == sha, f"Checkpoint hash mismatch: {name}"
    print(name, digest)
