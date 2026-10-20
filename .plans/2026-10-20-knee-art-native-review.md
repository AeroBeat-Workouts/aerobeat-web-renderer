# Native PlayCanvas provisional knee art review

**Status:** Approved preparation in progress. **Owner:** renderer visual QA. **Bead:** Assembly `aerobeat-web-assembly-gmnl.10` (decision remains OPEN after preparation); pad decision `.9` remains OPEN. **Next check:** browser PlayCanvas framebuffer captures with verified canonical track, production punch/guard and independently loaded provisional GLB geometry at both viewports.

## Goal and boundaries

Produce review-only native PlayCanvas captures using the existing renderer testbed/application, camera, track, target layer and scene-model positions. An isolated browser script loads provisional GLBs into temporary PlayCanvas containers; no production asset registry, renderer source, gameplay kind, signed release, authored/scored chart or UI copy changes. Screenshot review is not tracking, gameplay, physical fit or approval. Parent plan: `../aerobeat-web-assembly/.plans/2026-10-20-boxing-spacing-repetition-knee-strikes.md`, Section C. Concept pictures are inspiration, not exact UI mockups; no `ui_fidelity` design truth applies.

## Tasks

1. Inspect testbed native staging, candidate manifests and canonical scene-model geometry. Preserve repository clean state and claim `.10` only as preparation.
2. Add an isolated review script to fetch and SHA-check candidate GLBs and instantiate on the facade's PlayCanvas `app` under its actual camera/target layer. Drive existing punch/guard through ordinary `renderGameplayFrameWithCursorsAndEquipment`; use the native scene model's cell centers and time-derived Z for candidate placement. Show left/right lowest row at FAR, NEAR and HIT at 844×390 DPR1 and phone 390×844 DPR3. Stage pad on explicitly illustrative lowered/raised leg geometry with two contrasting color pairs if viable.
3. Assert loaded canonical assets, native track and comparison cues, actual candidate mesh bounds/projection, nonblank pixel deltas, exact viewport/DPR; save labeled PNGs and JSON bounds to a review-only directory.
4. Document reproduction and limitations, commit/push only coherent additive test/review evidence. Return `.10` OPEN for Derrick's verdict, do not resolve `.9`.

## Relevant gate review

Keep renderer's existing immutable asset hash gate untouched. The review-only candidate SHA checks defend against presenting a different provisional GLB than the declared manifest. No new production or UI gates. Renderer README can point to the review instructions; product docs await actual approval/integration.

## Results

Chromium review script generated 44 actual PlayCanvas PNGs and JSON bounds in `review/knee-art-2026-10-20/`: 3 targets × 2 sides × 3 distances × 2 viewports, plus 2 poses × 2 color pairs × 2 viewports for the pad. Target-on/off framebuffer delta range 83–5606 pixels; representative pad/leg-on/off range 9615–54237; native track and ordinary pinned punch/guard are visible. Canonical renderer camera and asset loader remain unchanged. The phone browser DPR3 is capped by existing renderer DPR2 (780×1688 actual WebGL backing); PNGs are 390×844 CSS pixels. Key observed limitation: asset front −Z points away from camera +Z, and the FAR target is ~15–21px wide at 844×390, with open-prong partly obscured by track edge. No score, tracking or product integration claim. `.9`/`.10` remain unanswered; parent should inspect artifacts before approaching Derrick. Maximum DSH goal round limit is not applicable to this delegated bounded review.
