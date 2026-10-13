# Renderer three-tier Flow feedback

**Status:** Approved source-owner slice in assembly plan `2026-10-13-flow-center-swaps-three-tier-feedback.md`; assembly Bead `aerobeat-web-assembly-eab7` claimed in progress. Renderer main initially clean at `414be65`. Parent owns assembly pins, preview and independent QA/audit. No public release.

## Decision and next acceptance check

Keep authoritative `judgement: "miss"` on narrow Flow near contact, but render its `tier: "good"` as blue Good over the note with authored icon tint. Genuine miss remains red Miss with gray icon; exact blade contact is white Great. Accept old `almost` input only as a Good visual alias (never yellow Almost). Next check: same project-owned unit and genuine GLB browser pixel tests fail when only near-miss production mapping is reverted and pass when restored.

## Diagnosis before edits

**Observed:** `targetObjects` admits `tier: "good"` but branches on raw `state === "miss"`: it grays the icon unless tier is `almost`, selects `Miss` for `good`, and anchors the glyph at the hand-side Miss position. The glyph atlas paints `Almost` yellow. Existing four-tier unit checks explicitly demand the old yellow alias; real GLB browser checks cover Miss but not Good versus Great.

**Expected:** Raw result does not override the authoritative scoring tier's player-facing near-contact presentation. Scoring and geometry are outside this owner.

**Execution path:** gameplay forwards committed target judgement/tier → `buildGameplaySceneModel` / `targetObjects` builds icon tint, text, color, depth and anchor → facade stages GLB asset and generated glyph texture → PlayCanvas canvas pixel capture.

**Root cause:** Presentation uses raw result rather than the scoring tier to classify committed near-miss visuals. This is supported directly by three branches in `src/gameplay-scene-model.js`. The old `almost` category is a separate obsolete visible palette in both scene model and glyph atlas. Alternatives: missing glyph or GLB loading would not explain model-level wrong text/color; browser capture will verify actual rendered pixels. Previous fix attempts: none in this task. Unknown: browser pixel thresholds against GLB and feedback quad; calibrate using initial real GLB captures and enforce distinct localized state assertions. Minimal reproduction: commit Flow target `{judgement:"miss",tier:"good",missCommitMs:1181}` at 1231 ms. Control: tier `miss` stays red/gray, hit tier `great` stays white. Fix: classify `good`/legacy `almost` as near visual while leaving judgement/motion untouched; remove obsolete yellow glyph branch. Verify with named normal-gate unit/browser tests and fix-only counterfactual.

```text
Problem: Flow close-pass Good renders as red Miss.
Observed symptom: state miss/tier good takes gray icon, red Miss side-anchor branches.
Root cause: model derives visible tier from raw miss instead of scoring tier.
Evidence: targetObjects icon/tier/anchor branches and four-tier legacy test.
Failed approaches: none in this slice.
Corrective action: map near tier to Good visual and retain authored icon; remove yellow Almost texture route.
Verification test: unit model and real GLB/browser pixels, fix-only RED/restored GREEN.
Related files/components: gameplay-scene-model, renderer-facade glyph pixels, owner unit/browser scripts.
Remaining uncertainty: localized browser pixel thresholds until validated.
```

## Owner milestones and gates

1. Implement near-good and compatibility alias presentation narrowly in model/glyph code; no scorer, asset or hash changes.
2. Update unit model checks and add real GLB browser pixel assertions for Good near, Great hit and Miss in portrait/landscape as feasible; wire into existing normal gate.
3. Run named focused tests, `npm test`, `npm run test:browser`, and fix-only RED/restored GREEN with unchanged tests; document exact exception if a gate is unavailable.
4. Update renderer README and this plan, commit/push owner main and hand exact tree/test evidence to assembly parent. Parent closes assembly Bead only after integration.

**Gate review:** Keep all current unit/check/browser checks; replace obsolete yellow-unit expectations, add one normal-gate GLB pixel check without weakening existing thresholds. Keep source asset manifest/hashes untouched. No new external security surface or new preview route.

## Owner result (2026-10-13)

Source model displays miss/good as blue Good at the crossing and retains authored real-arrow fill while keeping committed miss judgement and +Z motion; old almost inputs use the same Good visual. Miss red/gray and hit Great white remain distinct. Removed yellow Almost texture/glyph and obsolete small-bounce presentation. Updated existing unit oracle and added `scripts/validate-three-tier-feedback-browser.js` to normal `test:browser`, asserting generated glyph texture and localized GLB composite pixels for Good, Great, Miss and legacy alias in 844×390 landscape and 390×844 portrait, DPR1, with GLB readiness and no fallback. The browser test is renderer-level, not an assembly scored Play test or cross-origin iframe; parent owns that boundary.

Green `npm test` includes strict types/assets and unit validations. Full `npm run test:browser` exit 0 includes the new assertions, unchanged W1-C and white-flash gates. Focused browser counts: landscape Good blue glyph 1701 / authored blue arrow 2022, Great white glyph 509, Miss red glyph 387 / gray arrow 2251; portrait respectively 1371 / 1630, 574, 369 / 1749. Same tests were kept intact while changing only the near-tier production ternary back to old miss behavior: unit RED `good near contact shows Good: 'Miss' !== 'Good'`, browser RED `'Miss' !== 'Good'`; restored exact source via trap and both focused oracles GREEN. No source asset or hash modifications. Owner commit/push to be recorded below after completion.
