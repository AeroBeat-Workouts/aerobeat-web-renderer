// @ts-check
// 0.0.52 W1-C follow-up browser pixel oracles for the PlayCanvas facade:
//   (a) Flow slice aftermath — two clip-plane half icons (hard local-Y cut, distinct horizontal offsets)
//   (b) Boxing straight punch aftermath — projected position/size shifts toward the background over 0→500 ms
//   (c) Guard bonk aftermath — 0.0.59 B14: the piece keeps a single off-screen fall (no floor
//       rest): below the track surface and still descending at the sample, with bounded −Z drift
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
import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";
import { isExpectedReadPixelsWarning } from "./browser-console-policy.js";

// 0.0.63 D5 evidence: the off-center sliceT clip plane + wider half separation are proven
// with REAL pixels, written under scripts/evidence/0.0.63-d5-slice/<run>/ per the repo
// evidence convention (timestamped run dirs committed alongside the oracle).
const D5_EVIDENCE_ROOT = resolve(process.cwd(), "scripts/evidence/0.0.63-d5-slice");
const D5_RUN_TAG = `d5-sliceT-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
const D5_EVIDENCE_DIR = join(D5_EVIDENCE_ROOT, D5_RUN_TAG);

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
    // 0.0.58 B11c: aftermath halves live in the DEDICATED aftermath pool (isolated from the
    // live-icon assetPools slots), so look up the half slots there.
    const circleAftermathPool = renderer.aftermathAssetPools.get("any-note/outlined-circle-v1") ?? [];
    const minusSlot = circleAftermathPool.find((e) => String(e.name).includes("half-")),
      plusSlot = circleAftermathPool.find((e) => String(e.name).includes("half+"));
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

    // --- (h) 0.0.63 D5: real-pixel evidence for the off-center sliceT clip plane + wider half separation.
    // Same arrow glyph (rounded-outline-v1), same hand/seed (42)/timing, ONLY sliceT differs:
    //   mid  = sliceT 0.5  (explicit midpoint — must equal the legacy plane)
    //   off  = sliceT 0.25 (off-center toward the tail; plane shifted (0.25-0.5)*0.78 = -0.195 WU)
    //   legacy = NO sliceT (legacy midpoint plane + the legacy .16 base spread)
    // The camera's real WU→px scale at the corpse depth is measured IN-PAGE (the harness
    // camera is not the canonical pose; scale is pinned from the probe, never assumed).
    const D5_NOW_MS = 1300;
    const d5EntryFor = (sliceT) => {
      const entry = { targetId: "d5", hitCommitMs: 850, family: "flow", hand: "neutral", mode: "slice", spawn: { x: 0, y: 1, z: 0 }, seed: 42, shape: "arrow", appearanceColor: "#3B82C4" };
      if (sliceT !== undefined) entry.sliceT = sliceT;
      return entry;
    };
    const d5Probe = (() => {
      const p = { x: 0, y: 0, z: 0 };
      return (x, y, z) => { p.x = x; p.y = y; p.z = z; const out = renderer.cameraEntity.camera.worldToScreen(p); return { x: out.x, y: out.y }; };
    })();
    // World→px scale along the corpse depth (z=-0.9 at the D5 sample): project a 0.5 WU
    // baseline and take the pixel distance — the known WU→px scale of THIS fixture.
    const d5Z = -0.9;
    const d5Scale = d5Probe(0.5, 1, d5Z).x - d5Probe(0, 1, d5Z).x; // px per 0.5 WU
    const d5Measure = (sliceT) => {
      const entry = d5EntryFor(sliceT);
      renderer.renderGameplayFrame({ ...idleFrame, nowMs: D5_NOW_MS, targets: [], aftermath: [] });
      const baseline = sample();
      renderer.renderGameplayFrame({ ...idleFrame, nowMs: D5_NOW_MS, targets: [], aftermath: [entry] });
      const pixels = sample();
      const halves = renderer.lastModel.objects.filter((o) => o.targetId === "d5" && o.kind === "aftermath");
      const pool = renderer.aftermathAssetPools.get("directional-arrow/rounded-outline-v1") ?? [];
      const stats = [];
      let combined = 0;
      for (let index = 0; index < pixels.length; index += 4) if (deltaRGB(pixels, baseline, index) > 24) combined++;
      for (const half of halves) {
        const slot = pool.find((e) => String(e.name).includes(half.aftermath.sliceSign === 1 ? "half+" : "half-"));
        let count = 0, sumX = 0, sumY = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        if (slot) {
          slot.enabled = false; renderer.manualTick();
          const without = sample(); slot.enabled = true; renderer.manualTick();
          const withIt = sample();
          for (let index = 0; index < withIt.length; index += 4) {
            if (deltaRGB(withIt, without, index) > 24) {
              const x = (index / 4) % canvas.width, y = Math.floor(index / 4 / canvas.width);
              count++; sumX += x; sumY += y;
              if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
        }
        const sp = d5Probe(half.position.x, half.position.y, half.position.z);
        stats.push({ sign: half.aftermath.sliceSign, offsetXWU: half.aftermath.offsetXWU, sliceT: half.aftermath.sliceT ?? null, world: [half.position.x, half.position.y, half.position.z], screen: [sp.x, sp.y], own: { count, meanX: count ? sumX / count : 0, meanY: count ? sumY / count : 0, minX, maxX, minY, maxY } });
      }
      return { combined, halves: stats };
    };
    const d5Legacy = d5Measure(undefined),
      d5Mid = d5Measure(0.5),
      d5Off = d5Measure(0.25);
    // Per-frame full-frame pixel diff (off vs mid) — OFF-CENTER IS REAL beyond a noise floor.
    const d5FrameDiff = (a, b) => {
      renderer.renderGameplayFrame({ ...idleFrame, nowMs: D5_NOW_MS, targets: [], aftermath: [a] });
      const pa = sample();
      renderer.renderGameplayFrame({ ...idleFrame, nowMs: D5_NOW_MS, targets: [], aftermath: [b] });
      const pb = sample();
      let diff = 0;
      for (let index = 0; index < pa.length; index += 4) if (deltaRGB(pa, pb, index) > 24) diff++;
      return diff;
    };
    const d5DiffPx = d5FrameDiff(d5EntryFor(0.25), d5EntryFor(0.5));
    // The clip plane slides along the glyph's local LONG axis (local Y, the arrow's tip axis).
    // In the screen frame we read the cut as a centroid split: the plane sits at the screen-Y
    // weighted boundary of the two halves, and an off-center (tail) cut moves the heavier (tip)
    // mass's centroid toward the tip. `centroidX`/`centroidY` are each half's own-pixel means.
    const d5Half = (m, sign) => m.halves.find((h) => h.sign === sign);
    const d5 = {
      scale: { d5Z, pxPerHalfWU: d5Scale, pxPerWU: d5Scale / 0.5 },
      diffPx: d5DiffPx,
      legacy: { halves: d5Legacy.halves.map((h) => ({ sign: h.sign, offsetXWU: h.offsetXWU, sliceT: h.sliceT, world: h.world.map((v) => +v.toFixed(4)), own: { count: h.own.count, meanX: +h.own.meanX.toFixed(1), meanY: +h.own.meanY.toFixed(1) } })) },
      mid: { halves: d5Mid.halves.map((h) => ({ sign: h.sign, offsetXWU: h.offsetXWU, sliceT: h.sliceT, world: h.world.map((v) => +v.toFixed(4)), own: { count: h.own.count, meanX: +h.own.meanX.toFixed(1), meanY: +h.own.meanY.toFixed(1) } })) },
      off: { halves: d5Off.halves.map((h) => ({ sign: h.sign, offsetXWU: h.offsetXWU, sliceT: h.sliceT, world: h.world.map((v) => +v.toFixed(4)), own: { count: h.own.count, meanX: +h.own.meanX.toFixed(1), meanY: +h.own.meanY.toFixed(1) } })) },
      // (b) separation: world-position half-distance (WU) — exact, no rotation.
      sepLegacyWU: Math.abs(d5Legacy.halves[0].world[0] - d5Legacy.halves[1].world[0]),
      sepMidWU: Math.abs(d5Mid.halves[0].world[0] - d5Mid.halves[1].world[0]),
      sepLegacyPx: Math.abs(d5Legacy.halves[0].screen[0] - d5Legacy.halves[1].screen[0]),
      sepMidPx: Math.abs(d5Mid.halves[0].screen[0] - d5Mid.halves[1].screen[0]),
      sepDeltaPx: Math.abs(d5Mid.halves[0].screen[0] - d5Mid.halves[1].screen[0]) - Math.abs(d5Legacy.halves[0].screen[0] - d5Legacy.halves[1].screen[0]),
      // (a) cut position: screen-Y of the centroid boundary between the two halves (plane proxy)
      //     + per-half mass, so an off-center cut moves the heavier (tip) side's centroid.
      midBoundaryY: (d5Mid.halves[0].own.meanY + d5Mid.halves[1].own.meanY) / 2,
      offBoundaryY: (d5Off.halves[0].own.meanY + d5Off.halves[1].own.meanY) / 2,
      boundaryDeltaY: (d5Off.halves[0].own.meanY + d5Off.halves[1].own.meanY) / 2 - (d5Mid.halves[0].own.meanY + d5Mid.halves[1].own.meanY) / 2,
      // tail-shift: the off-center (tail) cut leaves MORE mass on the tail (heavier) side.
      // tip side = the half that contains the glyph tip; for sliceT<0.5 the tip is on the sign=+1
      // side (the plane keeps localY>=plane on the + side). Mass asymmetry = heavier-tip - lighter-tail.
      midTipMass: Math.max(d5Mid.halves[0].own.count, d5Mid.halves[1].own.count),
      midTailMass: Math.min(d5Mid.halves[0].own.count, d5Mid.halves[1].own.count),
      offTipMass: Math.max(d5Off.halves[0].own.count, d5Off.halves[1].own.count),
      offTailMass: Math.min(d5Off.halves[0].own.count, d5Off.halves[1].own.count),
      midMassSplit: Math.max(d5Mid.halves[0].own.count, d5Mid.halves[1].own.count) - Math.min(d5Mid.halves[0].own.count, d5Mid.halves[1].own.count),
      offMassSplit: Math.max(d5Off.halves[0].own.count, d5Off.halves[1].own.count) - Math.min(d5Off.halves[0].own.count, d5Off.halves[1].own.count),
      massSplitDelta: (Math.max(d5Off.halves[0].own.count, d5Off.halves[1].own.count) - Math.min(d5Off.halves[0].own.count, d5Off.halves[1].own.count)) - (Math.max(d5Mid.halves[0].own.count, d5Mid.halves[1].own.count) - Math.min(d5Mid.halves[0].own.count, d5Mid.halves[1].own.count)),
      // full-frame captures for the side-by-side PNGs
      crops: {
        legacy: (() => { renderer.renderGameplayFrame({ ...idleFrame, nowMs: D5_NOW_MS, targets: [], aftermath: [d5EntryFor(undefined)] }); return canvas.toDataURL("image/png"); })(),
        mid: (() => { renderer.renderGameplayFrame({ ...idleFrame, nowMs: D5_NOW_MS, targets: [], aftermath: [d5EntryFor(0.5)] }); return canvas.toDataURL("image/png"); })(),
        off: (() => { renderer.renderGameplayFrame({ ...idleFrame, nowMs: D5_NOW_MS, targets: [], aftermath: [d5EntryFor(0.25)] }); return canvas.toDataURL("image/png"); })()
      }
    };
    // The full-frame off vs mid diff PNG (pixel-diff evidence).
    d5.crops.diff = (() => {
      renderer.renderGameplayFrame({ ...idleFrame, nowMs: D5_NOW_MS, targets: [], aftermath: [d5EntryFor(0.25)] });
      const pa = sample();
      renderer.renderGameplayFrame({ ...idleFrame, nowMs: D5_NOW_MS, targets: [], aftermath: [d5EntryFor(0.5)] });
      const pb = sample();
      const c = document.createElement("canvas");
      c.width = canvas.width; c.height = canvas.height;
      const ctx = c.getContext("2d");
      const img = ctx.createImageData(canvas.width, canvas.height);
      for (let index = 0; index < pa.length; index += 4) {
        const d = deltaRGB(pa, pb, index);
        img.data[index] = d > 24 ? 255 : 0; img.data[index + 1] = 0; img.data[index + 2] = 0; img.data[index + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return c.toDataURL("image/png");
    })();
    // Side-by-side: legacy | mid | off | diff.
    d5.crops.sideBySide = (() => {
      const c = document.createElement("canvas");
      c.width = canvas.width * 4 + 12; c.height = canvas.height;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, c.width, c.height);
      const put = (entry, dx) => { renderer.renderGameplayFrame({ ...idleFrame, nowMs: D5_NOW_MS, targets: [], aftermath: [entry] }); ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, dx, 0, canvas.width, canvas.height); };
      put(d5EntryFor(undefined), 0); put(d5EntryFor(0.5), canvas.width + 4); put(d5EntryFor(0.25), canvas.width * 2 + 8);
      // diff
      renderer.renderGameplayFrame({ ...idleFrame, nowMs: D5_NOW_MS, targets: [], aftermath: [d5EntryFor(0.25)] });
      const pa = sample(); renderer.renderGameplayFrame({ ...idleFrame, nowMs: D5_NOW_MS, targets: [], aftermath: [d5EntryFor(0.5)] });
      const pb = sample();
      const img = ctx.createImageData(canvas.width, canvas.height);
      for (let index = 0; index < pa.length; index += 4) { const d = deltaRGB(pa, pb, index); img.data[index] = d > 24 ? 255 : 0; img.data[index + 1] = 0; img.data[index + 2] = 0; img.data[index + 3] = 255; }
      const tmp = document.createElement("canvas"); tmp.width = canvas.width; tmp.height = canvas.height;
      tmp.getContext("2d").putImageData(img, 0, 0);
      ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height, canvas.width * 3 + 12, 0, canvas.width, canvas.height);
      return c.toDataURL("image/png");
    })();

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

    // --- (c) Guard bonk aftermath: 0.0.59 B14 — the piece is still in its single off-screen
    // fall (no floor rest): below the track surface, still descending, bounded drift ---
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
    const bonkObject = renderer.lastModel.objects.find((o) => o.targetId === "bonk-c" && o.kind === "aftermath");
    renderer.renderGameplayFrame({ ...idleFrame, nowMs: 1880, aftermath: [bonkEntry] });
    const bonkLaterObject = renderer.lastModel.objects.find((o) => o.targetId === "bonk-c" && o.kind === "aftermath"),
      bonkTrackY = renderer.lastModel.grid.floorY - 0.08,
      bonkPosition = bonkObject?.position ?? { x: 0, y: 0, z: 0 },
      bonkLaterPosition = bonkLaterObject?.position ?? null,
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
        laterPresent: Boolean(bonkLaterObject),
        position: bonkPosition,
        laterPosition: bonkLaterPosition,
        trackY: bonkTrackY,
        phase: bonkObject?.aftermath?.phase ?? null,
        elapsedMs: bonkObject?.aftermath?.elapsedMs ?? null,
        fallingScreen: bonkScreen
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
      d5,
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

  // (c) 0.0.59 B14: Bonk: NO floor rest — the piece is still in its single off-screen fall at the
  // sample: below the track surface, still descending (later y strictly lower), bounded drift.
  assert.equal(evidence.bonk.present, true, "bonk aftermath object must be present");
  assert.equal(evidence.bonk.laterPresent, true, "bonk aftermath still present 150 ms later (off-screen fade tail)");
  assert.equal(evidence.bonk.phase, "flight", "B14: bonk stays in the single flight phase (no settled phase)");
  assert.ok(evidence.bonk.elapsedMs >= 600, `bonk sample must post-date the launch arc: elapsed=${evidence.bonk.elapsedMs} ms`);
  assert.ok(evidence.bonk.position.y < evidence.bonk.trackY, `B14: bonk must be BELOW the track surface, not resting on a floor: y=${evidence.bonk.position.y}, trackY=${evidence.bonk.trackY}`);
  assert.ok(evidence.bonk.laterPosition.y < evidence.bonk.position.y - 1e-3, `B14: bonk must STILL be descending 80 ms later (no rest): ${evidence.bonk.position.y} → ${evidence.bonk.laterPosition.y}`);
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

  // (h) 0.0.63 D5: the off-center sliceT clip plane + wider half separation render in REAL pixels.
  // MEASURED_* anchors are pinned from a deterministic in-page measurement pass (no env overrides).
  // The WU→px scale is measured at the corpse depth (z=-0.9) by projecting a 0.5 WU baseline.
  const MEASURED_PX_PER_WU = 74.23; // px per WU at the D5 corpse depth (z=-0.9, harness camera pose)
  const MEASURED_SEPARATION_DELTA_PX = 22.3; // |screen-sep(sliceT .5) - screen-sep(legacy)| at z=-0.9
  const MEASURED_SEP_TOLERANCE_PX = 5;
  const MEASURED_MASS_SPLIT_DELTA = 1053; // (off massSplit) - (mid massSplit): the tail-cut tip side gains mass
  const MEASURED_MASS_SPLIT_TOLERANCE = 200;
  const MEASURED_BOUNDARY_DELTA_PX = 6.6; // |off boundaryY - mid boundaryY|: the cut line moved
  const MEASURED_BOUNDARY_TOLERANCE_PX = 4;
  const MEASURED_OFF_CENTER_DIFF_FLOOR = 200; // off-vs-mid full-frame pixel diff must exceed this
  const MEASURED_LEGACY_OFFSET_DELTA_PX = 11.9; // |legacy screen-sep| at z=-0.9 (the legacy .16 base spread)
  const MEASURED_LEGACY_OFFSET_TOLERANCE_PX = 4;

  // (a) OFF-CENTER IS REAL: the 0.25 render differs from the 0.5 render beyond a noise floor.
  assert.ok(evidence.d5.diffPx > MEASURED_OFF_CENTER_DIFF_FLOOR, `D5 off-center clip plane must render a real diff: diffPx=${evidence.d5.diffPx} (floor ${MEASURED_OFF_CENTER_DIFF_FLOOR})`);
  // The cut line moved toward the tail: the centroid boundary between the two halves shifted.
  assert.ok(
    Math.abs(evidence.d5.boundaryDeltaY) >= MEASURED_BOUNDARY_DELTA_PX - MEASURED_BOUNDARY_TOLERANCE_PX &&
      Math.abs(evidence.d5.boundaryDeltaY) <= MEASURED_BOUNDARY_DELTA_PX + MEASURED_BOUNDARY_TOLERANCE_PX,
    `D5 off-center cut line must move by the measured delta: |ΔboundaryY|=${Math.abs(evidence.d5.boundaryDeltaY).toFixed(1)} (measured ${MEASURED_BOUNDARY_DELTA_PX} ± ${MEASURED_BOUNDARY_TOLERANCE_PX})`
  );
  // The off-center (tail) cut leaves MORE mass on the tip side (heavier) than the midpoint.
  assert.ok(
    evidence.d5.massSplitDelta >= MEASURED_MASS_SPLIT_DELTA - MEASURED_MASS_SPLIT_TOLERANCE &&
      evidence.d5.massSplitDelta <= MEASURED_MASS_SPLIT_DELTA + MEASURED_MASS_SPLIT_TOLERANCE,
    `D5 off-center cut must shift mass toward the tail: massSplitDelta=${evidence.d5.massSplitDelta} (measured ${MEASURED_MASS_SPLIT_DELTA} ± ${MEASURED_MASS_SPLIT_TOLERANCE})`
  );

  // (b) WIDER SEPARATION IS REAL: the sliceT-present entry spreads WIDER than the legacy no-sliceT
  // entry by the .46-vs-.16 WU ratio, converted via the measured in-page WU→px scale.
  const measuredScale = evidence.d5.scale.pxPerWU;
  assert.ok(
    Math.abs(measuredScale - MEASURED_PX_PER_WU) <= 1.5,
    `D5 in-page WU→px scale must match the fixture: ${measuredScale.toFixed(3)} (pinned ${MEASURED_PX_PER_WU} ± 1.5)`
  );
  assert.ok(
    Math.abs(evidence.d5.sepDeltaPx - MEASURED_SEPARATION_DELTA_PX) <= MEASURED_SEP_TOLERANCE_PX,
    `D5 wider half separation must match the measured delta: Δsep=${evidence.d5.sepDeltaPx.toFixed(1)} px (measured ${MEASURED_SEPARATION_DELTA_PX} ± ${MEASURED_SEP_TOLERANCE_PX})`
  );
  // The world-position half-distance carries the exact .46 vs .16 WU spread (no rotation error).
  assert.ok(
    Math.abs(evidence.d5.sepMidWU - 0.46) < 1e-3 && Math.abs(evidence.d5.sepLegacyWU - 0.16) < 1e-3,
    `D5 world half-distance must carry the exact WU spread: mid=${evidence.d5.sepMidWU.toFixed(4)} (0.46), legacy=${evidence.d5.sepLegacyWU.toFixed(4)} (0.16)`
  );
  assert.ok(
    Math.abs((evidence.d5.sepMidWU - evidence.d5.sepLegacyWU) * measuredScale - MEASURED_SEPARATION_DELTA_PX) <= MEASURED_SEP_TOLERANCE_PX,
    `D5 wider spread in px must equal the WU delta × measured scale: ${((evidence.d5.sepMidWU - evidence.d5.sepLegacyWU) * measuredScale).toFixed(1)} vs ${MEASURED_SEPARATION_DELTA_PX}`
  );

  // (c) NO REGRESSION: the legacy no-sliceT case keeps the exact legacy .16-based offset spread,
  // and the existing (a) slice assertions above (offsets/signs/bbox) are unchanged and intact.
  assert.ok(
    Math.abs(evidence.d5.sepLegacyPx - MEASURED_LEGACY_OFFSET_DELTA_PX) <= MEASURED_LEGACY_OFFSET_TOLERANCE_PX,
    `D5 legacy no-sliceT half separation must keep the legacy .16-based offset: ${evidence.d5.sepLegacyPx.toFixed(1)} px (measured ${MEASURED_LEGACY_OFFSET_DELTA_PX} ± ${MEASURED_LEGACY_OFFSET_TOLERANCE_PX})`
  );
  assert.ok(
    evidence.d5.legacy.halves.every((h) => h.sliceT === null),
    "D5 legacy (no sliceT) halves must omit the sliceT visual"
  );

  // Persist D5 evidence: side-by-side + diff PNGs + numbers.
  mkdirSync(D5_EVIDENCE_DIR, { recursive: true });
  const d5Png = (dataUrl) => Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
  writeFileSync(join(D5_EVIDENCE_DIR, "legacy.png"), d5Png(evidence.d5.crops.legacy));
  writeFileSync(join(D5_EVIDENCE_DIR, "mid.png"), d5Png(evidence.d5.crops.mid));
  writeFileSync(join(D5_EVIDENCE_DIR, "off.png"), d5Png(evidence.d5.crops.off));
  writeFileSync(join(D5_EVIDENCE_DIR, "diff-off-vs-mid.png"), d5Png(evidence.d5.crops.diff));
  writeFileSync(join(D5_EVIDENCE_DIR, "side-by-side.png"), d5Png(evidence.d5.crops.sideBySide));
  writeFileSync(
    join(D5_EVIDENCE_DIR, "numbers.json"),
    `${JSON.stringify({ runTag: D5_RUN_TAG, nowMs: 1300, scale: evidence.d5.scale, diffPx: evidence.d5.diffPx, legacy: evidence.d5.legacy, mid: evidence.d5.mid, off: evidence.d5.off, sepLegacyWU: evidence.d5.sepLegacyWU, sepMidWU: evidence.d5.sepMidWU, sepLegacyPx: evidence.d5.sepLegacyPx, sepMidPx: evidence.d5.sepMidPx, sepDeltaPx: evidence.d5.sepDeltaPx, midBoundaryY: evidence.d5.midBoundaryY, offBoundaryY: evidence.d5.offBoundaryY, boundaryDeltaY: evidence.d5.boundaryDeltaY, massSplitDelta: evidence.d5.massSplitDelta }, null, 2)}\n`
  );
  console.log(`D5 evidence written to ${D5_EVIDENCE_DIR}: diffPx=${evidence.d5.diffPx} Δsep=${evidence.d5.sepDeltaPx.toFixed(1)}px ΔboundaryY=${evidence.d5.boundaryDeltaY.toFixed(1)}px massSplitΔ=${evidence.d5.massSplitDelta}`);

  // Zero console noise beyond pinned ReadPixels grammar
  assert.deepEqual(noise, [], `unexpected console noise: ${JSON.stringify(noise)}`);
  console.log("W1-C facade pixel oracles (slice cut, punch displacement, bonk floor, glow envelope, idle, red-cube-absent, state-driven pulsing vignette, D5 off-center sliceT + wider separation) all passed.");
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
