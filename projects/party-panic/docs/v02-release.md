# v0.2 release status — 2026-10-19

Implementation is committed on `main`. Runtime source is `6ef427c`; documentation
publication source is `2f56053`. All changes are confined to Party Panic.

- Local checks: typecheck, lint, 91 unit tests and production build passed.
- Local browser suite: 18 passed; two real WebRTC cases intentionally run separately.
- Final real Chrome WebRTC run: [39279750886](https://github.com/LeoMaglanoc/LeoMaglanoc.github.io/actions/runs/39279750886),
  both tests passed in 2.2 minutes, including eight clients and mode switching.
- Production preview: six UI-only scenarios passed; screenshots, diagnostics and two
  recordings are in evidence/v02-release. See v02-performance.md for measured limits.
- Full website build: [39279870192](https://github.com/LeoMaglanoc/LeoMaglanoc.github.io/actions/runs/39279870192),
  build job118151932203 passed and uploaded the Pages artifact at15:46:47 UTC.
  Its own Party Panic checks again passed91 units and18 browser cases.

## Publication blocked externally

Pages deploy job118153651535 / deployment7178229759 was created at15:46:51 UTC
and remains pending. GitHub reported an Actions and Pages incident at15:49:25 UTC:
https://stspg.io/nrv2k8s68bwn. The status observation is retained in
evidence/v02-release/github-status.json. No required human deployment approval was
reported. The existing deployment remains queued; it has not been canceled.

The public HTTPS page still served v0.1 `index-C6rFjFDh.js` on the final observation.
Expected v0.2 assets are `index-CbcAdoWy.js` and `index-CcVvxptN.css`.
**Publication and live HTTPS gameplay QA are not yet verified.** No successful
deployment or live test is claimed. This is a release candidate, not a certified release.

After Pages recovers, inspect the existing run before submitting another deployment.
Once the expected assets are public, run:

```sh
PARTY_URL=https://leonardo-maglanoc.com/party-panic/ PARTY_QA_LABEL=live node tools/v02-release-qa.ts
```

Record the deployment conclusion and live report. Physical Android/iPhone acceptance,
human matches and representative-phone performance remain unverified independently
of the Pages incident. Remaining severity and networking limits are in v02-validation.md.
