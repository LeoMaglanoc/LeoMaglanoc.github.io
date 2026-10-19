# Continuation checkpoints

The complete work is in the website repository under `projects/party-panic`. No learned model weights or training jobs exist: all character/course geometry, host physics, guest prediction and tuning are reproducible source.

| Checkpoint               | Commit/tag                          | Meaning                                                                                                                            |
| ------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| G0 official baseline     | `c18a508`, `party-panic-g0`         | Official PlayCanvas third-person scaffold, architecture and setup                                                                  |
| G1 managed-browser spike | `9352c63`, `party-panic-g1-blocked` | Typed/rate-bounded transport and honest record of policy-blocked ICE                                                               |
| Complete initial race    | `3296f91`                           | Authoritative physics, original three-section course, solo/touch/lobby/results/rematch                                             |
| Website publication      | `2daa03c`                           | `/party-panic/`, demos-post link and CI; first real Chrome 2→8-client proof                                                        |
| Docker/QA correction     | `a67f1f5`                           | Public-asset readability in nginx and repeated real Chrome evidence                                                                |
| Startup guard            | `d7c96e4`                           | No round or room creation before physics/scene readiness                                                                           |
| Verified runtime release | `99d98c7`                           | Hard-deadline boundary, honest unknown ICE classification, 16 unit checks, nine local browser checks and real 2→8-client Chrome CI |
| Documented MVP           | `party-panic-mvp-v0.1.0`            | Same runtime, final evidence, reproduction helper and continuation notes                                                           |

Resume safely on a new branch:

```sh
git switch -c improve-party-panic party-panic-mvp-v0.1.0
cd projects/party-panic
npm ci
npm run check
npm run dev
```

Movement tuning: `src/simulation.ts`; local guest visual approximation: `src/main.ts`. Player geometry/materials and course colliders: `src/scene.ts`. Ordered progression/spawn/progress tables: `src/rules.ts` (keep them consistent with scene geometry). Touch/keyboard controls: `src/input.ts`. Versioned wire formats and validation: `src/protocol.ts`; PeerJS/fault injection/ICE diagnostics: `src/transport.ts`.

Run `npm run test:e2e` against the dev server; the managed environment's network test is explicitly skipped. Reproduce real connectivity on a suitable workstation with `RUN_WEBRTC=1 npm run test:e2e -- tests/e2e/network.spec.ts`, or dispatch the Party Panic Chrome connectivity workflow. Production smoke checks are `node tools/production-qa.ts` with Docker running; set `PARTY_URL` and `PARTY_QA_LABEL=live` for HTTPS.

The next task is physical Android/iOS acceptance and human races, not model training. Record device/network/role, joins, selected ICE, RTT/bandwidth, 10-minute FPS/heap/thermal behavior, rematches and lifecycle failures before claiming phone certification. Preserve the explicit player-bumping and no-TURN limitations until measured evidence supports a change.

## v0.2 continuation checkpoints

- `076fb87`: measured unchanged baseline/screenshots and minimal architecture.
- `e189ca9`: gesture-driven display mode and authoritative readiness.
- `164df18`: measured vector movement and bounded guest jump feedback.
- `5fa183b`: course readability, character feedback and procedural sound.
- `8d51c37`: mode-aware epochs and disposable worlds.
- `9d6bcc8`: complete Laser Tag and solo AI;84units/18browser checks passed.
- `3d7a26a`: network faults/budgets and real two/eight-client acceptance tests.

Current real Chrome run/deployment outcomes are recorded in v02-network.md and
v02-validation.md when complete. Physical-device acceptance remains unavailable.
