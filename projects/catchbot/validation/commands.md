# Verification commands

Run from repository root. Exact results below are retained alongside raw logs.
`$PWD` in the commands was `/workspace/website` in this session. Docker builds
use the session's public CA trust bundle and retain the configured HTTPS proxy.
Local container hostnames are included in NO_PROXY for local-only traffic.

| Command | Outcome / evidence |
|---|---|
| `docker build --secret id=proxy_ca,src=/etc/ssl/certs/ca-certificates.crt -f projects/catchbot/Dockerfile.experiments -t catchbot-experiments:2026-10-18 projects/catchbot` | PASS; CPU-only PyTorch environment |
| `docker build --secret id=proxy_ca,src=/etc/ssl/certs/ca-certificates.crt -f projects/catchbot/Dockerfile.browser -t catchbot-browser:2026-10-18 projects/catchbot` | PASS; Chromium + Playwright |
| `docker build --secret id=proxy_ca,src=/etc/ssl/certs/ca-certificates.crt -f projects/catchbot/Dockerfile.site -t catchbot-site:2026-10-18 .` | PASS; Ruby 3.3.5, pinned Gemfile.lock, Python notebook CLI |
| `docker run --rm -v "$PWD":/work -w /work node:22-bookworm-slim node --test projects/catchbot/tests/*.test.js` | PASS, 29 tests; `unit-tests-docker.txt` |
| `docker run --rm -v "$PWD":/work -w /work node:22-bookworm-slim node --test projects/portal-puzzle-lab/tests/*.test.js` | PASS; `existing-portal-tests.txt` |
| `node projects/catchbot/experiments/prepare.mjs` | PASS; 15 fixtures, 1,485 windows |
| Official inference Docker command in `../CHECKPOINTS.md` | PASS; 1,485 official forecasts, [1,2,9,21] raw quantiles; provenance and lock saved |
| Same experiment container, `python projects/catchbot/experiments/export_onnx.py` | UNSUCCESSFUL: unsupported `aten::asinh`; `../results/onnx-probe.json` |
| Same, `python projects/catchbot/experiments/export_onnx.py --standard-symbolics` | UNSUCCESSFUL: unsupported `aten::cummax`; `../results/onnx-probe-mapped.json` |
| `node projects/catchbot/experiments/replay.mjs` | PASS; both protocols, 15 trajectories/model; saved evaluation |
| `python3 projects/catchbot/experiments/evaluate.py` | PASS; pooled and per-type error, latency and marginal coverage |
| `python3 projects/catchbot/experiments/audit.py` | PASS; 95,040 causal sample checks, shape/median/hash checks, zero violations |
| `python3 scripts/publish-project-assets.py` | PASS, 657 runtime files |
| `python3 scripts/publish-project-assets.py --check` | PASS, 657 matching runtime files; `publication.txt` |
| `docker run --rm -v "$PWD":/work -w /work/projects/slam/web node:22-bookworm-slim sh -c 'npm test && npm run build && npm run test:assets'` | PASS; existing SLAM pipeline; `slam-tests.txt` |
| `git diff --check` | PASS |

## Chrome interaction tests

```sh
docker network create catchbot-validation
docker run -d --name catchbot-preview --network catchbot-validation \
  -v "$PWD":/work -w /work python:3.12-slim \
  python -m http.server 8765 --bind 0.0.0.0
docker run --rm --network catchbot-validation \
  -e NO_PROXY=catchbot-preview,catchbot-built,localhost,127.0.0.1 \
  -e no_proxy=catchbot-preview,catchbot-built,localhost,127.0.0.1 \
  -e CATCHBOT_URL=http://catchbot-preview:8765/assets/interactive/catchbot/ \
  -v "$PWD":/work catchbot-browser:2026-10-18
```

PASS: real Chromium 155.0.8059.79, desktop 1440×900, portrait 390×844,
landscape 844×390. Mouse and CDP touch, warm-up/online prediction, release freeze,
no scroll, replay comparison, gesture cancellation, lost capture, visibility
handler, repeated restart, strategy reset, resize and console checks. Zero
console errors. `chrome.json` saves frame intervals and observed state; screenshots
are adjacent. Scripted pointer traces are explicitly marked automated, not human.
Host Chromium 154 was also used during development. Extra 320×568 narrow-phone
smoke check: no horizontal overflow. No physical phone was available.

## Site build and publication

The final site build, dependency checker, built-route and live-route evidence
are recorded in `site-validation.json` and the corresponding Chrome JSON/logs.
See `../IMPLEMENTATION_REPORT.md` for final deployment status.

Initial unsuccessful checks were corrected rather than hidden: the first site
image lacked `jupyter`; the next had `jupyter` but lacked `jupyter-nbconvert`.
Both command-line packages were added to the Dockerfile. Existing Sass deprecation
warnings and SLAM chunk-size/dependency-audit notices are retained as existing
repository warnings; no unrelated dependency upgrades were attempted.

Final site commands (PASS):

```sh
docker run --rm --mount type=bind,src=/etc/ssl/certs/ca-certificates.crt,dst=/run/ca.pem,readonly -e SSL_CERT_FILE=/run/ca.pem -e GIT_SSL_CAINFO=/run/ca.pem -v "$PWD":/work catchbot-site:2026-10-18
# Persistent instance of the same image: catchbot-site-tools
docker exec catchbot-site-tools bundle exec jekyll build --incremental
docker exec -e NODE_EXTRA_CA_CERTS=/run/ca.pem catchbot-site-tools npx --yes purgecss@6.0.0 -c purgecss.config.js
docker exec catchbot-site-tools python3 -c 'import shutil; shutil.copytree("projects/slam/web/dist", "_site/slam", dirs_exist_ok=True)'
docker exec catchbot-site-tools python3 scripts/check-project-links.py
```

The checker passed all 15 routes, 52 HTML dependencies and manifest assets;
861,032,471 bytes. The first checker run correctly reported missing `/slam/`
before the workflow's separate Vite-copy step. It passed after that step.
A host PurgeCSS attempt hit root-owned build-file permissions; running the
command in the Docker build environment passed. A browser assertion initially
sampled game state too sparsely and missed the short playing phase before a
valid catch; it now observes every gesture step and accepts a positive scored
time as proof of active play. These were validation issues, not hidden passes.

Built-route smoke (PASS) uses `tests/route-smoke.py` in the browser image on the
same local network, with a read-only Python server rooted at `_site` named
`catchbot-built`. Default route: `http://catchbot-built:8765/catchbot/`.
Desktop/portrait/landscape iframe startup, capture/release, About, no overflow,
console checks and the blog link passed; `chrome-built.json` records outcomes.

Final built-runtime and live checks (PASS):

```sh
# Same browser Docker command above, with:
# CATCHBOT_URL=http://catchbot-built:8765/assets/interactive/catchbot/
CATCHBOT_ROUTE=https://leonardo-maglanoc.com/catchbot/ CATCHBOT_LABEL=live \
  python3 projects/catchbot/tests/route-smoke.py
```

The full interaction suite also passes against Jekyll-minified runtime files.
Live smoke uses host Chromium 154.0.8037.57 with TLS verification enabled;
all three viewports, iframe startup/capture/release, About, no overflow, console
checks and the blog link pass. GitHub deployment run 39120952891 completed
successfully for `9ffb98f`. All 11 live runtime body hashes equal the tested
built files (28,962 bytes in total). `live-runtime.json` records every hash.

An extra audit initially expected built files to equal canonical bytes; Jekyll's
existing global JS/CSS minification legitimately changes them. The corrected audit
checks source-to-published equality, records built transformation hashes, exercises
the minified runtime in Chrome, then verifies live-to-built equality.

`gh run list` returned HTTP 401 for the CLI API credential in this environment,
while the authorized Git push succeeded. Public GitHub REST endpoints were used
for read-only deployment monitoring instead; no login or credential replacement
was attempted.
