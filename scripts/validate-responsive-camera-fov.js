// @ts-check

import assert from "node:assert/strict";
import { defaultGameplayCameraPose, gameplayCameraPoseBounds, responsiveGameplayCameraFovDegrees } from "../src/gameplay-camera-pose.js";

// 0.0.92 lyof: the camera adapts its VERTICAL fov to the viewport aspect ratio so a
// dynamically-sized iframe (e.g. mobile portrait) frames the whole play grid.
//   - Portrait (aspect < 1): the computed fov widens until the 4.0 WU grid width fits.
//   - Landscape (aspect already fits the grid at the default 48° fov): the framing is
//     byte-identical (the default 48° is returned unchanged) — the landscape guard.
// The formula: fov = max(2·atan(halfW/(aspect·dist)), 2·atan(halfH/dist)), clamped to the
// pose verticalFovDegrees bounds, with the landscape guard snapping to the default when the
// computed value is at or below it.

const grid = { dist: 5, gridHalfWidth: 2.0, gridHalfHeight: 1.0 };
const def = defaultGameplayCameraPose.projection.verticalFovDegrees;
assert.equal(def, 48, "default vertical fov is 48°");
const bounds = gameplayCameraPoseBounds.projection.verticalFovDegrees;

const visibleWidthWU = (fovDeg, aspect) => 2 * grid.dist * Math.tan((fovDeg * Math.PI) / 360) * aspect;
const visibleHeightWU = (fovDeg) => 2 * grid.dist * Math.tan((fovDeg * Math.PI) / 360);

// --- Portrait: 390×844 (aspect ≈ 0.462) must fit the 4.0 WU grid width. ---
{
  const aspect = 390 / 844;
  const fov = responsiveGameplayCameraFovDegrees(aspect, grid, def, bounds);
  assert.ok(fov > def, `portrait fov (${fov.toFixed(3)}°) must widen beyond the default ${def}°`);
  assert.ok(fov <= bounds[1], `portrait fov (${fov}°) must respect the upper pose bound`);
  const w = visibleWidthWU(fov, aspect);
  assert.ok(w >= 4.0 - 1e-4, `portrait visible width (${w.toFixed(4)} WU) must cover the 4.0 WU grid width`);
  const h = visibleHeightWU(fov);
  assert.ok(h >= 2.0 - 1e-4, `portrait visible height (${h.toFixed(4)} WU) must cover the 2.0 WU row height`);
}

// --- Landscape: 16:9 must keep the framing byte-identical (default 48°). ---
{
  const aspect = 16 / 9;
  const fov = responsiveGameplayCameraFovDegrees(aspect, grid, def, bounds);
  assert.equal(fov, def, `landscape 16:9 fov must remain byte-identical to the default ${def}°`);
}

// --- A wide landscape (21:9) also stays at the default (grid width trivially fits). ---
{
  const aspect = 21 / 9;
  const fov = responsiveGameplayCameraFovDegrees(aspect, grid, def, bounds);
  assert.equal(fov, def, "21:9 landscape must remain at the default fov (landscape guard)");
}

// --- Square (1:1): at the default 48° the visible width is ~4.45 WU (≥ 4.0), so the landscape
//     guard keeps it at the default (no widening needed). ---
{
  const fov = responsiveGameplayCameraFovDegrees(1, grid, def, bounds);
  assert.equal(fov, def, "square aspect stays at the default fov (grid width already fits at 48°)");
  assert.ok(visibleWidthWU(fov, 1) >= 4.0 - 1e-4, "square visible width covers the 4.0 grid");
  assert.ok(visibleHeightWU(fov) >= 2.0 - 1e-4, "square visible height covers the 2.0 row height");
}

// --- Monotonicity: narrower aspect → wider or equal fov. ---
{
  const aspects = [390 / 844, 9 / 16, 1, 16 / 9];
  const fovs = aspects.map((a) => responsiveGameplayCameraFovDegrees(a, grid, def, bounds));
  for (let i = 1; i < fovs.length; i++) assert.ok(fovs[i] <= fovs[i - 1] + 1e-12, `fov must be non-increasing in aspect at index ${i}`);
}

// --- Bounds / hostile inputs. ---
{
  for (const bad of [0, -1, NaN, Infinity, undefined, null]) assert.throws(() => responsiveGameplayCameraFovDegrees(/** @type {number} */(bad), grid, def, bounds), /positive finite/u);
  for (const badGrid of [{ dist: 0, gridHalfWidth: 2, gridHalfHeight: 1 }, { dist: 5, gridHalfWidth: NaN, gridHalfHeight: 1 }, { dist: -5, gridHalfWidth: 2, gridHalfHeight: 1 }]) assert.throws(() => responsiveGameplayCameraFovDegrees(1, badGrid, def, bounds), /positive finite/u);
}

console.log("Responsive camera FOV: portrait fits the 4.0 WU grid, landscape stays byte-identical at 48° (unit) passed.");
