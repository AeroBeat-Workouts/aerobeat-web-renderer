// @ts-check
// 0.0.52 W1-C follow-up browser pixel oracles for the PlayCanvas facade:
//   (a) Flow slice aftermath — two clip-plane half icons (hard local-Y cut, distinct horizontal offsets)
//   (b) Boxing straight punch aftermath — projected position/size shifts toward the background over 0→500 ms
//   (c) Guard bonk aftermath — the piece settles at floor height with bounded −Z displacement
//   (d) Hazard glow vignette — an event drives a red edge shift; 800 ms later back to baseline
//   (e) Idle frame — zero aftermath objects, vignette quad disabled, no red shift
//   (f) 0.0.54 W1-C RED CUBE ABSENT — while a hazard-glow is active the scene-center region stays at
//       baseline (the facade loop skips `hazard_glow`; only the fullscreen vignette quad consumes it),
//       and there is NO obstacle-role primitive at world origin in the model.
//   (g) 0.0.54 W1-C STATE-DRIVEN PULSING VIGNETTE — `frame.hazardContactActive` drives a pulsing wall
//       vignette: active ramp-in → full pulse, release → linear decay to baseline, absent → exactly idle.
//       The bomb-flash envelope (`hazardContacts`) regression is covered by (d).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";
import { isExpectedReadPixelsWarning } from "./browser-console-policy.js";

const root = process.cwd(),
  brandingRoot = resolve(root, "../aerobeat-branding/icons/web-gameplay"),
  environmentFile = resolve(
    root,
    "../aerobeat-environment-community/.testbed/assets/images/luminious-ice-cave-photosphere/luminious-ice-cave-photosphere.jpg"
  );
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const brandingRelative = pathname.startsWith("/branding/") ? pathname.slice(10) : null;
    const relative = pathname === "/" ? ".testbed/demo/index.html" : pathname.slice(1);
    const file =
      pathname === "/test-assets/luminious-ice-cave-photosphere.jpg"
        ? environmentFile
        : brandingRelative === null
          ? normalize(join(root, relative))
          : normalize(join(brandingRoot, brandingRelative));
    const allowed =
      pathname === "/test-assets/luminious-ice-cave-photosphere.jpg"
        ? environmentFile
        : brandingRelative === null
          ? root
          : brandingRoot;
    if (file !== allowed && !file.startsWith(allowed)) {
      response.writeHead(403).end();
      return;
    }
    const content = await readFile(file),
      types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".glb": "model/gltf-binary",
        ".jpg": "image/jpeg"
      };
    response.writeHead(200, {
      "content-type": types[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store"
    });
    response.end(content);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Browser server failed");
const expectedPageUrl = `http://127.0.0.1:${address.port}/.testbed/demo/index.html`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const noise = [];
  page.on("console", (message) => {
    const type = message.type(),
      text = message.text(),
      location = message.location(),
      sourceUrl = location.url;
    if (
      ["warning", "error"].includes(type) &&
      !isExpectedReadPixelsWarning(type, text, sourceUrl, location.lineNumber, location.columnNumber, expectedPageUrl)
    )
      noise.push(`${type}: ${text} [sourceUrl=${JSON.stringify(sourceUrl)}]`);
  });
  page.on("pageerror", (error) => noise.push(`pageerror: ${error.message}`));
  await page.goto(expectedPageUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => globalThis.__AERO_RENDERER_TEST__?.ready === true && globalThis.__AERO_RENDERER_TEST__.renderers[0].describe().gameplayAssets.state === "ready"
  );
  const evidence = await page.evaluate(() => {
    const renderer = globalThis.__AERO_RENDERER_TEST__.renderers[0],
      canvas = document.querySelector("#primary canvas");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Primary canvas missing");
    renderer.resize({ widthCssPx: 844, heightCssPx: 390, deviceScaleFactor: 1 });
    renderer.setEnvironmentVisible(false);
    renderer.setBackgroundProjection({ kind: "solid", colors: ["#102030"], angleDeg: 180 });
    const sample = () => {
      const out = new OffscreenCanvas(canvas.width, canvas.height),
        context = out.getContext("2d", { willReadFrequently: true });
      context.drawImage(canvas, 0, 0);
      return context.getImageData(0, 0, out.width, out.height).data;
    };
    const deltaRGB = (a, b, i) => Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    const pixelAt = (pixels, x, y) => {
      const index = (y * canvas.width + x) * 4;
      return [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]];
    };
    const centerX = Math.floor(canvas.width / 2),
      centerY = Math.floor(canvas.height / 2);
    const idleFrame = { presentation: "flow", nowMs: 1000, targets: [] };
    // Vignette mask ramps up well inside the border; sample four points ~20% in along each corner diagonal.
    const edgePoints = [
      [Math.floor(canvas.width * 0.2), Math.floor(canvas.height * 0.2)],
      [Math.floor(canvas.width * 0.8), Math.floor(canvas.height * 0.2)],
      [Math.floor(canvas.width * 0.2), Math.floor(canvas.height * 0.8)],
      [Math.floor(canvas.width * 0.8), Math.floor(canvas.height * 0.8)]
    ];
    const redMeanAt = (pixels) => edgePoints.reduce((sum, [x, y]) => sum + pixelAt(pixels, x, y)[0], 0) / 4;
    const _probe = { x: 0, y: 0, z: 0 };
    const projectPos = (x, y, z) => {
      _probe.x = x;
      _probe.y = y;
      _probe.z = z;
      const out = renderer.cameraEntity.camera.worldToScreen(_probe);
      return { x: out.x, y: out.y, z: out.z };
    };

    // --- (e) Idle frame: no aftermath objects, vignette quad disabled, no red shift ---
    renderer.renderGameplayFrame(idleFrame);
    const idleModel = renderer.lastModel,
      idleAftermath = idleModel.objects.filter((o) => o.kind === "aftermath"),
      idleGlow = idleModel.objects.find((o) => o.kind === "hazard_glow"),
      idleVignetteEnabled = renderer.hazardGlowEntity?.enabled ?? false,
      idleBaseline = sample(),
      idleRedEdge = redMeanAt(idleBaseline),
      idleBaseRed = Float32Array.from({ length: idleBaseline.length / 4 }, (_, i) => idleBaseline[i * 4]),
      idleBaseGreen = Float32Array.from({ length: idleBaseline.length / 4 }, (_, i) => idleBaseline[i * 4 + 1]),
      idleBaseBlue = Float32Array.from({ length: idleBaseline.length / 4 }, (_, i) => idleBaseline[i * 4 + 2]);

    // --- (a) Flow slice aftermath: two clip-plane halves with distinct offsets and hard cuts ---
    const sliceEntry = {
      targetId: "slice-a",
      hitCommitMs: 850,
      family: "flow",
      hand: "neutral",
      mode: "slice",
      spawn: { x: 0, y: 1, z: 0 },
      seed: 42
    };
    // Mid-flight sample: both halves are tumbling so neither clip plane can align with screen axes.
    const SLICE_NOW_MS = 1373;
    renderer.renderGameplayFrame({ ...idleFrame, nowMs: SLICE_NOW_MS, aftermath: [sliceEntry] });
    const sliceHalves = renderer.lastModel.objects.filter((o) => o.targetId === "slice-a" && o.kind === "aftermath"),
      sliceOffsets = sliceHalves.map((h) => h.aftermath.offsetXWU),
      sliceSigns = sliceHalves.map((h) => h.aftermath.sliceSign);
    // Per-half pixel attribution: toggle each pooled half slot off/on against the same-frame rest and diff.
    const circlePool = renderer.assetPools.get("any-note/outlined-circle-v1") ?? [];
    const minusSlot = circlePool.find((e) => String(e.name).includes("half-")),
      plusSlot = circlePool.find((e) => String(e.name).includes("half+"));
    const attributeMask = (slot) => {
      const wasEnabled = slot.enabled;
      slot.enabled = false;
      renderer.manualTick();
      const without = sample();
      slot.enabled = wasEnabled;
      renderer.manualTick();
      const withIt = sample();
      const mask = [];
      for (let index = 0; index < withIt.length; index += 4) if (deltaRGB(withIt, without, index) > 24) mask.push(index);
      return mask;
    };
    const bboxStats = (mask) => {
      if (!mask.length) return { count: 0, w: 0, h: 0, fill: 0 };
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const index of mask) {
        const x = (index / 4) % canvas.width, y = Math.floor(index / 4 / canvas.width);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      return { count: mask.length, w: maxX - minX + 1, h: maxY - minY + 1, fill: mask.length / ((maxX - minX + 1) * (maxY - minY + 1)) };
    };
    const minusBBox = bboxStats(minusSlot ? attributeMask(minusSlot) : []),
      plusBBox = bboxStats(plusSlot ? attributeMask(plusSlot) : []);
    // Uncut reference icon at the shared pose (zero rotation): its visible area bounds what either half may show.
    const sharedPose = sliceHalves[0]?.position ?? { x: 0, y: 0, z: 0 };
    const fullIconRef = (() => {
      renderer.clear({ color: [0x10 / 255, 0x20 / 255, 0x30 / 255, 1] });
      const cleared = sample();
      const iconEntity = renderer.acquireAssetEntity("any-note/outlined-circle-v1", 0);
      if (!iconEntity) return { count: 0, w: 0, h: 0, fill: 0 };
      iconEntity.setPosition(sharedPose.x, sharedPose.y, sharedPose.z);
      iconEntity.setLocalScale(1, 1, 1);
      iconEntity.setEulerAngles(0, 0, 0);
      iconEntity.enabled = true;
      for (const component of iconEntity.findComponents("render")) component.layers = [renderer.gameplayTargetLayer?.id ?? 0];
      renderer.applyAssetAppearance(iconEntity, "any-note/outlined-circle-v1", "#ffffff", 1, false);
      renderer.manualTick();
      const withIcon = sample();
      iconEntity.enabled = false;
      renderer.manualTick();
      const mask = [];
      for (let index = 0; index < withIcon.length; index += 4) if (deltaRGB(withIcon, cleared, index) > 24) mask.push(index);
      return bboxStats(mask);
    })();
    // Restore the live slice frame state.
    renderer.renderGameplayFrame({ ...idleFrame, nowMs: SLICE_NOW_MS, aftermath: [sliceEntry] });

    // --- (b) Boxing straight punch aftermath: projected position/size shifts toward the background over 0→500 ms ---
    const punchEntry = {
      targetId: "punch-b",
      hitCommitMs: 1000,
      family: "punch",
      hand: "left",
      mode: "straight",
      spawn: { x: 0, y: 1, z: 0 },
      seed: 7
    };
    const punchMaskAt = (nowMs) => {
      renderer.renderGameplayFrame(idleFrame);
      const base = sample();
      renderer.renderGameplayFrame({ ...idleFrame, nowMs, aftermath: [punchEntry] });
      const pixels = sample();
      let count = 0, sumX = 0, sumY = 0;
      for (let index = 0; index < pixels.length; index += 4)
        if (deltaRGB(pixels, base, index) > 24) {
          count++;
          sumX += (index / 4) % canvas.width;
          sumY += Math.floor(index / 4 / canvas.width);
        }
      return count ? { count, meanX: sumX / count, meanY: sumY / count } : { count: 0, meanX: 0, meanY: 0 };
    };
    const punchPixelT0 = punchMaskAt(1000),
      punchPixelT500 = punchMaskAt(1500);
    renderer.renderGameplayFrame({ ...idleFrame, aftermath: [punchEntry] });
    const punchAt0 = renderer.lastModel.objects.find((o) => o.targetId === "punch-b" && o.kind === "aftermath");
    renderer.renderGameplayFrame({ ...idleFrame, nowMs: 1500, aftermath: [punchEntry] });
    const punchAt500 = renderer.lastModel.objects.find((o) => o.targetId === "punch-b" && o.kind === "aftermath");
    const punchStartScreen = punchAt0 ? projectPos(punchAt0.position.x, punchAt0.position.y, punchAt0.position.z) : null,
      punchEndScreen = punchAt500 ? projectPos(punchAt500.position.x, punchAt500.position.y, punchAt500.position.z) : null;

    // --- (c) Guard bonk aftermath: piece settles on the floor plane with bounded drift ---
    const bonkEntry = {
      targetId: "bonk-c",
      hitCommitMs: 1000,
      family: "guard",
      hand: "both",
      mode: "bonk",
      spawn: { x: 0, y: 1, z: 0 },
      seed: 99
    };
    renderer.renderGameplayFrame({ ...idleFrame, nowMs: 1800, aftermath: [bonkEntry] });
    const bonkObject = renderer.lastModel.objects.find((o) => o.targetId === "bonk-c" && o.kind === "aftermath"),
      bonkFloorY = renderer.lastModel.grid.floorY - 0.45,
      bonkPosition = bonkObject?.position ?? { x: 0, y: 0, z: 0 },
      bonkScreen = bonkObject ? projectPos(bonkPosition.x, bonkPosition.y, bonkPosition.z) : null;

    // --- (d) Hazard glow: edge region measurably redder than the center ---
    // The vignette mask peaks in the lower-left/right screen band under this camera; measure with two independent
    // signals: (1) total red-channel mass over a full-frame baseline diff, (2) four explicit edge probes vs center.
    renderer.renderGameplayFrame({ ...idleFrame, hazardContacts: [{ eventId: "h-now", atMs: 750 }] });
    const glowIntensity = renderer.lastModel.hazardGlow.intensity,
      glowVignetteEnabled = renderer.hazardGlowEntity?.enabled ?? false,
      glowVignetteMeshCount = renderer.hazardGlowEntity?.render?.meshInstances?.length ?? -1,
      glowVignetteType = renderer.hazardGlowEntity?.render?.type ?? null,
      glowPixels = sample();
    let glowShiftedPixels = 0, glowRedExcess = 0;
    for (let index = 0; index < glowPixels.length; index += 4) {
      const d = Math.abs(glowPixels[index] - idleBaseRed[index / 4]) + Math.abs(glowPixels[index + 1] - idleBaseGreen[index / 4]) + Math.abs(glowPixels[index + 2] - idleBaseBlue[index / 4]);
      if (d > 6) {
        glowShiftedPixels++;
        glowRedExcess += Math.max(0, glowPixels[index] - idleBaseRed[index / 4]);
      }
    }
    const glowEdgeRed = redMeanAt(glowPixels),
      glowCenterRed = pixelAt(glowPixels, centerX, centerY)[0];
    // Glow decayed at now−800 ms (past ramp 150 + decay 600 = fully gone)
    renderer.renderGameplayFrame({ ...idleFrame, hazardContacts: [{ eventId: "h-decay", atMs: 200 }] });
    const glowDecayIntensity = renderer.lastModel.hazardGlow.intensity,
      glowDecayVignetteEnabled = renderer.hazardGlowEntity?.enabled ?? false,
      glowDecayPixels = sample();
    let glowDecayShifted = 0;
    for (let index = 0; index < glowDecayPixels.length; index += 4) {
      const d = Math.abs(glowDecayPixels[index] - idleBaseRed[index / 4]) + Math.abs(glowDecayPixels[index + 1] - idleBaseGreen[index / 4]) + Math.abs(glowDecayPixels[index + 2] - idleBaseBlue[index / 4]);
      if (d > 6) glowDecayShifted++;
    }
    const glowDecayEdgeRed = redMeanAt(glowDecayPixels),
      glowDecayCenterRed = pixelAt(glowDecayPixels, centerX, centerY)[0];

    // --- (f) 0.0.54 W1-C: RED CUBE ABSENT while a hazard glow is active ---
    // A bomb contact makes the one-shot envelope fully ramped (elapsed ≥ rampMs): intensity 1,
    // so the old generic path would have rendered a 1×1×1 opaque red cube at the world origin.
    renderer.renderGameplayFrame({ ...idleFrame, nowMs: 320, hazardContacts: [{ eventId: "cube-check", atMs: 100 }] });
    const cubeCheckModel = renderer.lastModel,
      cubeCheckIntensity = cubeCheckModel.hazardGlow.intensity,
      cubeCheckVignetteEnabled = renderer.hazardGlowEntity?.enabled ?? false,
      cubeCheckObjects = cubeCheckModel.objects.map((o) => ({ id: o.id, kind: o.kind, role: o.role, assetId: o.assetId, x: o.position.x, y: o.position.y, z: o.position.z })),
      cubeCheckPixels = sample();
    let centerDelta = 0, centerShiftedPx = 0;
    for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) {
      const index = ((centerY + dy) * canvas.width + (centerX + dx)) * 4;
      const d = Math.abs(cubeCheckPixels[index] - idleBaseRed[(centerY + dy) * canvas.width + centerX + dx]) + Math.abs(cubeCheckPixels[index + 1] - idleBaseGreen[(centerY + dy) * canvas.width + centerX + dx]) + Math.abs(cubeCheckPixels[index + 2] - idleBaseBlue[(centerY + dy) * canvas.width + centerX + dx]);
      if (d > 6) centerShiftedPx++;
      centerDelta = Math.max(centerDelta, d);
    }
    const redCubeAbsent = {
      intensity: cubeCheckIntensity,
      vignetteEnabled: cubeCheckVignetteEnabled,
      hasOriginPrimitive: cubeCheckObjects.some((o) => (o.kind === "icon" || o.kind === "obstacle") && o.role === "obstacle" && o.assetId === null && Math.abs(o.x) < 1e-9 && Math.abs(o.y) < 1e-9 && Math.abs(o.z) < 1e-9),
      hasHazardGlowObject: cubeCheckObjects.some((o) => o.kind === "hazard_glow"),
      centerMaxChannelDelta: centerDelta,
      centerShiftedPixels: centerShiftedPx
    };

    // --- (g) 0.0.54 W1-C: STATE-DRIVEN PULSING VIGNETTE (wall contact) ---
    const wallPixelAt = (stateField) => {
      renderer.renderGameplayFrame({ ...idleFrame, ...stateField });
      const pixels = sample(),
        intensity = renderer.lastModel.hazardGlow.intensity,
        vignetteEnabled = renderer.hazardGlowEntity?.enabled ?? false;
      let shifted = 0, redExcess = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const i = index / 4;
        const d = Math.abs(pixels[index] - idleBaseRed[i]) + Math.abs(pixels[index + 1] - idleBaseGreen[i]) + Math.abs(pixels[index + 2] - idleBaseBlue[i]);
        if (d > 6) {
          shifted++;
          redExcess += Math.max(0, pixels[index] - idleBaseRed[i]);
        }
      }
      return { intensity, vignetteEnabled, shifted, redExcess, edgeRed: redMeanAt(pixels) };
    };
    // Decay window is 400 ms (tuning default), so the release tail is [700, 1100): sample at 950.
    const wallRampEnd = wallPixelAt({ nowMs: 600, hazardContactActive: { active: true, sinceMs: 450, releasedAtMs: null } }),
      wallMidPulse = wallPixelAt({ nowMs: 775, hazardContactActive: { active: true, sinceMs: 450, releasedAtMs: null } }),
      wallAfterRelease = wallPixelAt({ nowMs: 950, hazardContactActive: { active: false, sinceMs: 450, releasedAtMs: 700 } }),
      wallDecayDone = wallPixelAt({ nowMs: 1100, hazardContactActive: { active: false, sinceMs: 450, releasedAtMs: 700 } });

    // Restore idle state
    renderer.renderGameplayFrame(idleFrame);

    return {
      idle: {
        aftermathCount: idleAftermath.length,
        glowPresent: Boolean(idleGlow),
        vignetteExists: Boolean(renderer.hazardGlowEntity),
        vignetteEnabled: idleVignetteEnabled,
        redEdge: idleRedEdge,
        redCenter: pixelAt(sample(), centerX, centerY)[0]
      },
      slice: {
        halfCount: sliceHalves.length,
        offsets: sliceOffsets,
        signs: sliceSigns,
        distinctOffsets: sliceOffsets.length === 2 ? sliceOffsets[0] !== sliceOffsets[1] : false,
        alpha: sliceHalves.map((h) => h.alpha),
        minusBBox,
        plusBBox,
        fullIconRef
      },
      punch: {
        startZ: punchAt0?.position.z ?? 0,
        endZ: punchAt500?.position.z ?? 0,
        startAlpha: punchAt0?.alpha ?? 1,
        endAlpha: punchAt500?.alpha ?? 1,
        startScreen: punchStartScreen,
        endScreen: punchEndScreen,
        screenApproach: punchStartScreen && punchEndScreen ? punchEndScreen.z - punchStartScreen.z : 0,
        pixelT0: punchPixelT0,
        pixelT500: punchPixelT500
      },
      bonk: {
        present: Boolean(bonkObject),
        position: bonkPosition,
        floorY: bonkFloorY,
        phase: bonkObject?.aftermath?.phase ?? null,
        elapsedMs: bonkObject?.aftermath?.elapsedMs ?? null,
        settledScreen: bonkScreen
      },
      glow: {
        intensity: glowIntensity,
        vignetteEnabled: glowVignetteEnabled,
        vignetteMeshCount: glowVignetteMeshCount,
        vignetteType: glowVignetteType,
        shiftedPixels: glowShiftedPixels,
        redExcess: glowRedExcess,
        edgeRed: glowEdgeRed,
        centerRed: glowCenterRed
      },
      glowDecay: {
        intensity: glowDecayIntensity,
        vignetteEnabled: glowDecayVignetteEnabled,
        shiftedPixels: glowDecayShifted,
        edgeRed: glowDecayEdgeRed,
        centerRed: glowDecayCenterRed
      },
      redCubeAbsent,
      wallRampEnd,
      wallMidPulse,
      wallAfterRelease,
      wallDecayDone,
      canvasSize: { width: canvas.width, height: canvas.height }
    };
  });

  console.log("W1-C facade pixel evidence", JSON.stringify(evidence));

  // (e) Idle: zero aftermath, no glow object, vignette disabled, flat red channel
  assert.equal(evidence.idle.aftermathCount, 0, "idle frame must have zero aftermath objects");
  assert.equal(evidence.idle.glowPresent, false, "idle frame must have no hazard_glow scene object");
  assert.equal(evidence.idle.vignetteExists, true, "vignette quad entity must exist (persistent, disabled at idle)");
  assert.equal(evidence.idle.vignetteEnabled, false, "vignette quad must be disabled at idle");
  assert.ok(Math.abs(evidence.idle.redEdge - evidence.idle.redCenter) <= 4, `idle frame must show no edge red shift: edge=${evidence.idle.redEdge}, center=${evidence.idle.redCenter}`);

  // (a) Slice: exactly two halves, distinct offsets, correct signs, real clipped rendering
  assert.equal(evidence.slice.halfCount, 2, "slice must produce exactly two aftermath halves");
  assert.ok(evidence.slice.distinctOffsets, "slice halves must have distinct horizontal offsets");
  assert.deepEqual(
    [...evidence.slice.signs].sort((a, b) => a - b),
    [-1, 1],
    "slice halves must carry signs -1 and +1"
  );
  assert.ok(evidence.slice.fullIconRef.count > 400, `uncut reference note must render visibly: ${evidence.slice.fullIconRef.count} px`);
  // Each clip-plane half renders a visible, but strictly smaller-than-uncut-icon, pixel set at the same pose.
  assert.ok(evidence.slice.minusBBox.count > 150 && evidence.slice.plusBBox.count > 150, "each clip-plane half must render its own visible pixel band");
  assert.ok(
    evidence.slice.minusBBox.count < evidence.slice.fullIconRef.count && evidence.slice.plusBBox.count < evidence.slice.fullIconRef.count,
    `each half must show fewer pixels than the uncut icon: minus=${evidence.slice.minusBBox.count}, plus=${evidence.slice.plusBBox.count}, full=${evidence.slice.fullIconRef.count}`
  );
  // A hard half-cut discards ~half of the fragments: each half's fill stays well under the uncut ring icon's fill envelope.
  assert.ok(evidence.slice.minusBBox.fill < 0.8 && evidence.slice.plusBBox.fill < 0.8, `clipped halves must not fill their bounding boxes like whole icons: minus=${evidence.slice.minusBBox.fill.toFixed(3)}, plus=${evidence.slice.plusBBox.fill.toFixed(3)}`);

  // (b) Punch: moves toward the background (−Z), projection approaches, glyph shrinks
  assert.ok(evidence.punch.startZ >= 0, `punch starts at spawn Z=${evidence.punch.startZ}`);
  assert.ok(evidence.punch.endZ < evidence.punch.startZ, `punch must move toward -Z (background): start=${evidence.punch.startZ}, end=${evidence.punch.endZ}`);
  assert.ok(evidence.punch.screenApproach > 0, `projected distance to camera must grow: ${evidence.punch.screenApproach.toFixed(2)} px`);
  assert.ok(evidence.punch.pixelT0.count > 500 && evidence.punch.pixelT500.count > 200, `punch aftermath must render visibly at both times: t0=${evidence.punch.pixelT0.count}, t500=${evidence.punch.pixelT500.count}`);
  assert.ok(evidence.punch.pixelT500.count < evidence.punch.pixelT0.count * 0.85, `punch glyph must shrink toward the background: ${evidence.punch.pixelT0.count} → ${evidence.punch.pixelT500.count}`);

  // (c) Bonk: piece settles on the floor plane (floorY − icon half-height) with bounded drift
  assert.equal(evidence.bonk.present, true, "bonk aftermath object must be present");
  assert.equal(evidence.bonk.phase, "settled", "bonk must be in the settled phase");
  assert.ok(evidence.bonk.elapsedMs >= 600, `bonk sample must post-date the flight: elapsed=${evidence.bonk.elapsedMs} ms`);
  assert.ok(Math.abs(evidence.bonk.position.y - evidence.bonk.floorY) < 0.05, `bonk must rest at floor height: y=${evidence.bonk.position.y}, floorY=${evidence.bonk.floorY}`);
  assert.ok(Math.abs(evidence.bonk.position.z) < 1.0, `bonk Z drift must be bounded: |z|=${Math.abs(evidence.bonk.position.z).toFixed(3)}`);

  // (d) Glow active: vignette adds a measurable red shift in the screen-edge band over the center
  assert.ok(evidence.glow.intensity > 0.5, `glow intensity must be high near the ramp: ${evidence.glow.intensity}`);
  assert.equal(evidence.glow.vignetteEnabled, true, "vignette quad must be enabled when glow is active");
  assert.equal(evidence.glow.vignetteMeshCount, 1, `vignette quad must have exactly one mesh instance (set via render.meshInstances, not an addComponent option): ${evidence.glow.vignetteMeshCount}`);
  assert.ok(evidence.glow.shiftedPixels > 3000, `vignette must visibly tint a large edge region: ${evidence.glow.shiftedPixels} px`);
  assert.ok(evidence.glow.redExcess > evidence.glow.shiftedPixels * 4, `tinted pixels must carry real red excess: mean=${(evidence.glow.redExcess / Math.max(1, evidence.glow.shiftedPixels)).toFixed(1)}`);
  assert.ok(evidence.glow.centerRed <= evidence.idle.redCenter + 4, `screen center must stay near baseline red: center=${evidence.glow.centerRed}, idle=${evidence.idle.redCenter}`);

  // (d) Glow decayed: back to baseline
  assert.equal(evidence.glowDecay.intensity, 0, `glow must be fully decayed at 800 ms: ${evidence.glowDecay.intensity}`);
  assert.equal(evidence.glowDecay.vignetteEnabled, false, "vignette must be disabled once the envelope decays");
  assert.ok(evidence.glowDecay.shiftedPixels < 200, `decayed glow must return to baseline: ${evidence.glowDecay.shiftedPixels} shifted px`);

  // (f) RED CUBE ABSENT: an active glow decaying from full strength tints the edges but leaves the
  // scene center flat — no obstacle-colored primitive at world origin; only applyHazardGlow consumes
  // the hazard_glow object. (Envelope for the sample instant: ramped past 150 ms → in decay.)
  assert.ok(Math.abs(evidence.redCubeAbsent.intensity - 0.8833333333333333) < 1e-9, `cube check runs with the expected decaying glow intensity: ${evidence.redCubeAbsent.intensity}`);
  assert.equal(evidence.redCubeAbsent.vignetteEnabled, true, "vignette quad enabled during the cube check");
  assert.equal(evidence.redCubeAbsent.hasOriginPrimitive, false, "no obstacle primitive at world origin while the glow is active (red cube eliminated)");
  assert.ok(evidence.redCubeAbsent.centerMaxChannelDelta < 16, `scene-center region stays at baseline: max channel delta ${evidence.redCubeAbsent.centerMaxChannelDelta} ≥ 16`);
  assert.ok(evidence.redCubeAbsent.centerShiftedPixels === 0, `scene center must show zero shifted pixels: ${evidence.redCubeAbsent.centerShiftedPixels}`);

  // (g) STATE-DRIVEN PULSING VIGNETTE: active state drives a visible pulsing vignette; release decays to baseline.
  assert.equal(evidence.wallRampEnd.intensity, 0.6, "wall vignette reaches I0 = 0.6 at ramp end");
  assert.equal(evidence.wallRampEnd.vignetteEnabled, true, "vignette enabled while wall contact is active");
  assert.ok(evidence.wallRampEnd.shifted > 3000, `active wall pulse must visibly tint the edges: ${evidence.wallRampEnd.shifted}px`);
  assert.ok(evidence.wallRampEnd.redExcess > evidence.wallRampEnd.shifted * 4, "wall pulse carries real red excess");
  assert.ok(Math.abs(evidence.wallMidPulse.intensity - 0.6) <= 0.6 * 0.35 + 1e-9 && Math.abs(evidence.wallMidPulse.intensity - 0.6) >= 0, "mid-pulse intensity within [I0*(1-depth), I0]");
  assert.ok(evidence.wallMidPulse.vignetteEnabled, "vignette still enabled mid-pulse");
  assert.ok(evidence.wallAfterRelease.intensity > 0 && evidence.wallAfterRelease.intensity < 0.6, `release starts a decaying tail below I0: ${evidence.wallAfterRelease.intensity}`);
  assert.equal(evidence.wallAfterRelease.vignetteEnabled, true, "vignette stays on through the decay window");
  assert.equal(evidence.wallDecayDone.intensity, 0, "wall vignette decays to exactly 0 by releasedAtMs+decayMs");
  assert.equal(evidence.wallDecayDone.vignetteEnabled, false, "vignette disabled after the decay completes");
  assert.ok(evidence.wallDecayDone.shifted < 200, `post-decay frame returns to baseline: ${evidence.wallDecayDone.shifted}px`);

  // Zero console noise beyond pinned ReadPixels grammar
  assert.deepEqual(noise, [], `unexpected console noise: ${JSON.stringify(noise)}`);
  console.log("W1-C facade pixel oracles (slice cut, punch displacement, bonk floor, glow envelope, idle, red-cube-absent, state-driven pulsing vignette) all passed.");
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
