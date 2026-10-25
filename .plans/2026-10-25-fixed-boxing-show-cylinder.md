# Fixed-facing Boxing Show cylinders

Status: owner implementation and validations complete.
Parent: assembly `.plans/2026-10-25-boxing-heights-fixed-colliders-knee-calibration.md`, task B. Diagnosis: assembly `.plans/debug/2026-10-25-boxing-collider-orientation.md`.

Goal: Show glove cylinders use the scored world-Z endpoints and an identity quaternion even as glove art rotates. Preserve Flow saber rotation and knee-pad visual rotation. Already-fixed knee Show cylinders remain world-Z; add a narrow regression.

Tasks:
- [x] Inspect native facade: both polygon wire and cylinder fill consume the model `capsule.orientation` quaternion (`renderer-facade.js`), so the identity quaternion is sufficient; no facade edits.
- [x] Set Boxing Show geometry quaternion to identity, update rotated-glove and knee-pad regressions and README.
- [x] Run `npm test` and full native `npm run test:browser`; the initial native run exposed a stale rotating-glove oracle, updated in the renderer owner and rerun green. Commit and push only intentional owner changes.

Native `validate-boxing-collider-wire-browser.js` asserts the actual PlayCanvas wearable root rotates while both wire and fill remain identity-oriented; `validate-knee-visuals.js` asserts tuning changes pad rotation but not Show geometry. Browser knee target/pad/dot and Show tests pass. No assembled private Play was run in this delegated owner slice.

No renderer height logic, gameplay, assembly, UI, or input changes. Beads ledger not written in this delegated slice; assembly CLI v53 is incompatible with v66 DB.
