# G6 networking validation

Keep PeerJS's two associations per guest. Inputs/snapshots/events are versioned and
mode/round bound. Guests send movement/aim/fire only. Host decides capsule position,
shot ray, tags, respawn and scores. No rewind, server, fake peers or guest score claims.

## Changes after shooter integration review

Guest control receive budget128/s accommodates8×3 shot events/sec, tags/respawns,
recovery snapshots and deliberate duplicates. Host receives at most30 control messages
per second per guest; movement remains90/s before connection-bound75/s input validation.
The old symmetric30/s control budget would have dropped valid host traffic. Large
packets remain capped24KB. Existing64KiB outgoing backpressure guard now counts drops.

Snapshots stay20Hz with1Hz reliable recovery; high-frequency shot/tag events no longer
trigger an additional full reliable snapshot each time. Scores come from snapshots;
reliable host tag events confirm feedback. This limits avoidable control-lane traffic.

Debug FaultLink supports80ms delay,±40ms jitter,3%movement loss,5%reorder, ordered delayed
reliable events and adjacent duplicates. Queued content is cloned as real serialization
would preserve it, timers cancel on close and reliable ordering survives knob changes.
HTTP throttling is not used to claim WebRTC packet loss. Ten fault/transport tests pass.

## Local managed environment

An explicit RUN_WEBRTC=1 attempt on2026-10-19 failed at guest admission/ICE (20s roster
wait), matching the existing managed Chromium non-proxied-UDP limitation. Failure log
is evidence/v02-network/local-attempt.txt. No local8-client/phone connectivity is claimed.
The separate real Chrome CI path is used for actual two/eight-client acceptance; its
result and exact source commit must be recorded below before a multiplayer claim.

## Browser acceptance encoded

Existing Dash realChrome test covers2→8clients, impaired movement, admissions,
ordered triggers/results, rematch, guest disconnect and host departure. New Laser test
uses real gesture Ready/Start, blocked guest movement into shared cover, actual fire
input and verified tag, malformed/forged/stale packets, delayed/duplicate state, correct
winner, same-room switching and8clients holding touch fire for≥8real seconds. Match
completion accelerates the authoritative clock; it is automated browser evidence,
not a full human match or physical-device acceptance.

Physical Android↔Android/Android↔iOS/iOS host, NAT variety and8phones: NOT RUN.

## Actual real Chrome result

GitHub-hosted Ubuntu / Chrome 155.0.8059.39 passed both real WebRTC tests on
2026-10-19: **2 passed (3.0 minutes)**, source `3d7a26a244be80764ab36275423768e0137c6a0a`.
[Run and downloadable evidence](https://github.com/LeoMaglanoc/LeoMaglanoc.github.io/actions/runs/39278177934).
The two-client connection used direct host↔host ICE. Runtime channel inspection
reported ordered reliable control and unordered movement with **unlimited
retransmissions**, so limited retransmission is not claimed. Eight-client firing,
authoritative results, fault injection and same-room mode switching passed.
This is hosted desktop Chrome evidence, not physical mobile or varied-NAT testing.

Final runtime repeat: source `6ef427c7f8578c087716447b53373b58e26b750e`,
[run39279750886](https://github.com/LeoMaglanoc/LeoMaglanoc.github.io/actions/runs/39279750886),
again **2 passed (2.2 minutes)**. Dash took47.7s; Laser took1.4 minutes.
The following publication commit changes documentation only.
