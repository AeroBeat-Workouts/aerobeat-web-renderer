# Flow direction cue visibility debug record

## Exact Observed Failure

Independent QA at renderer commit `d7b5029` found that `screenshots/task8-renderer-flow.png` displays eight plain filled Flow circles with no discernible arrows. The draw plan contains the expected cardinal and diagonal shaft/head commands, and geometry/count/bounds assertions pass, but the actual Chromium pixels do not expose direction.

## Expected Behavior

Every directional Flow target must show an unmistakable non-color-only shaft/head cue for one of eight directions at desktop, 390x844 portrait, and 844x390 landscape. Dot notes remain directionless. Theme colors, color-vision differences, Boxing presentation, and assembly-owned shell overlays must not erase or replace this shape evidence.

## Execution Path

`renderGameplayFrame()` builds a plan through `buildGameplayRenderPlan()`. `addTarget()` first emits the opaque role-colored target circle at layer 4, then emits shaft/head primitives at layer 5 with the same visual role, alpha, saturation, and target ID. `renderer-facade.js::drawCommand()` resolves every command through `roleColor(draw.role, draw.alpha, draw.saturation)`. WebGL uses ordinary source-over blending. Therefore a cue pixel over an already opaque target pixel has the same RGB and alpha as the target pixel beneath it.

## Most Likely Root Cause

The cue primitives have correct geometry but no independent contrast semantics. Drawing the same role color over an opaque pixel of that role is pixel-identical. Command-plan tests observe intent, not framebuffer output, so they cannot detect the collapse.

## Alternative Hypotheses

1. **Cue geometry is outside the target** — contradicted by exact bounded plan assertions and the target/cue rect inspection.
2. **Layer sorting draws the target over the cue** — contradicted by layers 4 then 5 and stable sort/order.
3. **WebGL line primitives are unsupported** — `line` is implemented as an ordinary filled quad, and draw counts increase.
4. **Screenshot timing loses the frame** — the circles and other frame primitives are present; only same-color cue contrast is absent.
5. **Theme-specific low contrast** — this is adjacent but not the primary cause: the default theme already collapses exactly, and arbitrary themes mean a fixed extra color would also be unsafe.

## Why Previous Fixes Failed

The eight-way implementation proved direction through command count, command geometry, monotonic diagonal centers, and bounds. Those tests assumed that a distinct draw command implies a distinct visible result. Because the fragment output was identical to the target pixels, the tests validated an intermediate representation rather than the user-visible framebuffer.

## Unknowns

The smallest contrast threshold that remains reliable under browser antialiasing and all configurable themes must be established with pixel tests. The implementation should derive black/white contrast from the effective target RGB rather than assume a particular theme.

## Minimal Reproduction

1. Render one opaque Flow target with a direction at beat center and feedback progress zero.
2. Read or capture the canvas.
3. Compare it to the same target without a direction.
4. Before repair, the target-interior pixels are identical even though the directional plan has extra commands.

## Proposed Verification

Render each direction and a directionless control in Chromium, immediately read framebuffer pixels, and prove:

- directional target interior differs from its directionless control;
- cue-region luminance differs from the target interior by a deterministic threshold;
- opposite directions produce different pixel distributions;
- all proof repeats at desktop, 390x844, and 844x390;
- plan geometry remains bounded and cardinal orientation remains unchanged.

## Recommended Fix

Add explicit contrast semantics to direction-cue draw commands. Resolve cue color from the effective role/theme RGB, selecting black or white for deterministic maximum luminance contrast, while retaining the shaft/head shapes, direction geometry, target lifecycle, and non-cue role colors. Add framebuffer assertions; command counts remain supporting evidence only.

## Debugging Record

```text
Problem: Flow direction commands are not visible in Chromium.
Observed symptom: Eight rendered targets appear as plain circles despite valid shaft/head commands.
Root cause: Cue and opaque target use identical role RGB/alpha under source-over blending.
Evidence: addTarget emits same-role commands; drawCommand resolves all through roleColor; screenshot has no pixel contrast.
Failed approaches: Command-count/geometry/bounds tests proved intent but not framebuffer output.
Corrective action: Give cue commands theme-derived black/white contrast semantics.
Verification test: Per-direction framebuffer difference, luminance contrast, and opposite-direction distribution at three viewports.
Related files/components: src/gameplay-plan.js, src/renderer-facade.js, scripts/validate-browser-renderer.js.
Remaining uncertainty: Browser-antialias-safe pixel threshold, to be locked by tests.
```
