# Third-party notices

| Component | Revision / artifact | License or status | Use in this release |
| --- | --- | --- | --- |
| [GZDoom](https://zdoom.org/) | GZDoom 4.11.3 browser bundle | GPL-3.0-or-later | Game engine, distributed through the pinned Tomb-engine browser bundle. |
| [tomb-engine](https://github.com/mungus43/tomb-engine) | `6c735315b8ac1b1dd6646ac78c46bbbdbb775a5c` | GPL-3.0 | WebAssembly, worker, and browser integration bundle. The bundled GPL notice is at `engine/LICENSE-tomb-engine-GPL-3.0.txt`. |
| [FreeDM / Freedoom](https://freedoom.github.io/) | `engine/freedm.wad` from Tomb-engine | Modified BSD, per Tomb-engine’s bundled notice | Base game data. |
| `deathmatch_rockets.wad` | SHA-256 `3487f58ceacf3a5b1ae527c39867048ad28464c938b2b7c747501b055b66fa88` | Originates at `glample/Arnold` `resources/scenarios/deathmatch_rockets.wad`; the pinned upstream tree contains no separate licence/provenance record for this map. | Unchanged `MAP01` deathmatch map, loaded alongside FreeDM. |

## Archived research material

The repository retains Arnold, ViZDoom, ONNX Runtime, and policy-export
material for research provenance only. None is shipped or executed by the
browser deathmatch runtime. Its historical attribution and permission notes
remain with the archived material in `research/`, `docs/`, `tools/`, and
`models/`.
