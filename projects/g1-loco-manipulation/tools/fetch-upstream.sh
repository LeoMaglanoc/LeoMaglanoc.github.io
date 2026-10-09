#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)/artifacts/upstream"
mkdir -p "$root"
for entry in 'viewer https://github.com/OmniContact/omnicontact.github.io.git 8daf3d331eff1952555f95b7c044049f61d0dd39' 'native https://github.com/Ingrid789/OmniContact_sim2sim.git 1cf9ddd4067cbe5710b1f475e96f9c69f88055e2'; do
 read -r name url revision <<< "$entry"
 if [ ! -d "$root/$name/.git" ]; then git clone --filter=blob:none --no-checkout "$url" "$root/$name"; fi
 if [ "$name" = viewer ]; then git -C "$root/$name" sparse-checkout set humanoid-policy-viewer-src; fi
 git -C "$root/$name" checkout --detach "$revision"
done
