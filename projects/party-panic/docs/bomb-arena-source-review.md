# Bomb Arena source review

Upstream: https://github.com/statist32/bomberman_multiplayer at
`20750b9c37a069831fbb88a41300b815ea006e0d` (MIT, copyright 2020 statist32).
Isolated checkout: `/tmp/party-panic-bomberman-reference-20261021`.
Reviewed all eight game modules, Draw.js, client.js, index.html, main.css,
all five PNGs visually and all five editable Pixil JSON files, LICENSE,
README, server and Dockerfile before new gameplay implementation.

## Reference execution

Built the upstream Dockerfile unchanged (Node 14, `node server.js`), published
container port 3000 at localhost:3008. No compatibility patches. Reference
container dependency audit reports one high-severity issue; its old runtime
and backend are isolated and are not shipped in Party Panic.

Actual connected Chrome: two players Reference A/B joined the same hash room.
Keyboard D moved A along the top lane. Space planted a bomb; its sprite hid the
player on the same tile (the wire format has one visible entity per tile).
A died at range two; chat announced B as winner, then the arena reset after
about three seconds. Placed adjacent bombs and escaped down the left edge;
both bombs disappeared. This exercised the chain-reaction setup, but the near-
simultaneous fuses and uncaptured short flame do not establish exact chain timing
from screenshots alone. A second placement on the left edge captured the fuse, cross blast
and destruction of a perimeter breakable in the retained `reference-flame.png`
and `reference-destruction.png` captures.
This is browser observation, not a claim of precise stopwatch timing.
Source specifies 1500ms placed-bomb fuses, range 2, 500ms fire, 3000ms restart.
The Bomb constructor's unused default is 2000ms. Inputs use keypress/repeat;
all players use the same sprite. The 21×21 board is fixed at 672px, unsuitable
for narrow phones without adaptation.

## Reuse mapping

| Upstream source                      | Treatment                  | Integration / reason                                                                                  |
| ------------------------------------ | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| game/Entity.js                       | Adapted/ported             | Board occupancy, add/remove, bounds in bomb/model.ts                                                  |
| game/Obstacle.js                     | Adapted/ported             | Blocking entity subclass; shared base removes duplication                                             |
| game/Block.js                        | Adapted/ported             | breakable flag and removal retained                                                                   |
| game/Board.js                        | Adapted/ported             | Layered tile lists, fill, wire conversion; compact symmetric layouts                                  |
| game/Bomb.js                         | Adapted/ported             | Four cardinal rays, range 2, blocking/destruction and chaining; tick queue replaces timeout recursion |
| game/Fire.js                         | Adapted/ported             | Nonblocking entity, 30-tick lifetime                                                                  |
| game/Character.js                    | Adapted/ported             | Directional tile movement, obstacle/fire contact, bomb planting, death                                |
| game/Game.js                         | Adapted/ported             | Round update/winner intent; Party Panic replaces lobby, transport, lifecycle                          |
| public/Draw.js                       | Adapted/ported             | Image cache, clear, tile-based drawImage functions; responsive layered canvas                         |
| public/client.js                     | Not reused                 | Socket.IO/key-repeat loop replaced by existing validated PeerJS inputs and host snapshots             |
| public/index.html                    | Not reused                 | Existing Party Panic shell owns menu, canvas, lobby and accessibility                                 |
| public/main.css                      | Not reused                 | Fixed desktop canvas/chat layout conflicts with mobile shell                                          |
| public/sprites/*.png                 | Reused unchanged as assets | All five 32×32 source sprites under public/bomb/sprites                                               |
| public/sprites/*.pixil               | Reused unchanged as assets | All five editable files under source-assets/bomb-arena                                                |
| LICENSE                              | Copied substantially       | Exact original at public/bomb/LICENSE.txt, shipped in dist                                            |
| server.js, package files, Dockerfile | Not reused                 | Reference only; no second backend or legacy dependencies in production                                |

## Corrections justified by source and observation

`getWinner()` dereferences an absent survivor on a draw. Bomb planting permits
unbounded same-tile stacking. Recursive explosions have no detonated guard;
center-tile damage only targets index zero rather than iterating all layers.
`destroy()` always returns true, so every occupied tile (including fire/players)
terminates a ray. Board.fill uses columns for some row bounds. These defects
are corrected explicitly; solid blocks and the first breakable stop rays,
players and flames do not. All overlapping entities render as separate layers.
Winner evaluation occurs after all same-tick explosions and contacts.
Timers use simulation ticks and pause together. Bomb action sequences are
consumed once even for rejected placements, and are scoped to the round.

## Art provenance

All five PNG/Pixil pairs are present in the pinned upstream MIT repository,
with no separate asset license or third-party attribution in the inspected
files. The Pixil `author` field is generic editor metadata (`pixilart.com`),
not an independently verified artist credit. Reuse relies on the repository's
MIT grant; no claim of independent authorship verification is made. Preserve
statist32's copyright and exact asset bytes. No commercial branding is shipped.
