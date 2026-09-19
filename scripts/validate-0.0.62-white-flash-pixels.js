// @ts-check
// 0.0.62 L-A (bead 0hou, Option A) real-pixel no-flash oracle — white flash on
// the beat success→miss transition.
//
// WHAT THIS ORACLE PROVES (in real rendered pixels, not model values):
//   A missed note goes song-color → dark gray, with NO bright spike and NO white.
//   The pre-fix renderer had two bright sources on the transition:
//     (1) the white success-core: as an unresolved note entered the success zone
//         the note FILL was lerped toward #ffffff (tintMix 0→1) — a bright fill;
//     (2) the pale miss fill: at miss commit the fill hard-swapped to #7c828c
//         (a mid gray that renders pale/bright).
//   Option A removes the white success-core entirely (unresolved notes keep their
//   song color the whole approach) and darkens the miss fill to #2a3038, so a
//   miss now reads as a darken, not a flash. The authored white note OUTLINE is
//   structural GLB geometry (present from spawn, constant) and is EXCLUDED from
//   the fill region — exactly as the 0.0.61 oracle excluded it for its label-box
//   vs note-box guard.
//
// Repro (deterministic chart/pose, canonical production camera):
//   One Flow note (cell 5, song color #2468AC) crossing the judge plane at
//   beatCenterMs = 1000, timing window 180/180. It is a genuine miss: gameplay
//   records judgement:"miss" at the exact late-window commit (missCommitMs =
//   1181). The oracle samples the note from approach (860 ms) through the
//   success zone (910/940 ms), the crossing (1000 ms), the late window
//   (1090 ms), miss commit (1181 ms) and post-commit (1201 ms), then the
//   miss-expiry cull (1531 ms).
//
// Detector (region anchored on the MODEL icon position at the sample frame —
//   worldToScreen is only valid after that frame has rendered):
//   (1) fill region = the note box SHRUNK from its authored extent: the authored
//       white outline (the light structural ring) is excluded, so the luma gate
//       measures the FILL only, not the constant outline.
//   (2) no bright spike: the MAX fill luma across the whole approach→success→
//       late window must stay below MAX_LUMA (a white core reads ~255 and blows
//       it through; song-color + dark-gray pass with margin).
//   (3) luma continuity: max frame-to-frame |Δluma| of the fill MEAN across the
//       miss-commit frame must stay small (song color → #2a3038 is a bounded
//       step; a white→gray or song→white transition is not).
//   (4) miss fill is dark: at commit+20 ms the fill region matches #2a3038
//       ±tolerance, and the model iconAppearanceColor === "#2a3038".
//   (5) kept 0.0.61 good gates: the Miss label separation ring is dark
//       (#171a22) with 0 white px in the label box at commit+20, the gray/dark
//       fill is present in the note box, and the authored note outline (white
//       ring) is still present (counted, NOT gated — it is glyph art by design).
//   (6) cull: at commit+350 ms the note is gone (no icon in the model).
//
// Crops are saved under scripts/evidence/0.0.62-white-flash/<run>/ as
// approach.png, success-zone.png, note-at-commit.png, note-commit-plus-20.png,
// post-commit.png, expired.png plus a side-by-side. Run mode is explicit:
//   node scripts/validate-0.0.62-white-flash-pixels.js assert-after
//   node scripts/validate-0.0.62-white-flash-pixels.js capture-before
//   node scripts/validate-0.0.62-white-flash-pixels.js capture-after
// `assert-after` asserts every no-flash gate and fails otherwise (the CI gate
// shape). `capture-before` records the numbers + crops on the pre-fix build and
// asserts the pre-fix bright spike IS present, so the fail-before proof is
// recorded. `capture-after` records numbers without asserting the direction.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";
import { isExpectedReadPixelsWarning } from "./browser-console-policy.js";

const ROOT = resolve(process.cwd());
const BRANDING_ROOT = resolve(ROOT, "../aerobeat-branding/icons/web-gameplay");
const EVIDENCE_ROOT = resolve(ROOT, "scripts/evidence/0.0.62-white-flash");
const MODE = process.argv[2] ?? "capture-after";
assert.ok(["assert-after", "capture-before", "capture-after"].includes(MODE), `unknown mode ${MODE}`);
const RUN_TAG = `${MODE}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
const EVIDENCE_DIR = join(EVIDENCE_ROOT, RUN_TAG);

// Deterministic chart/pose constants (canonical camera; see gameplay-camera-pose.js).
const BEAT_CENTER_MS = 1000;
const MISS_COMMIT_MS = 1181; // exact late-window commit for 180/180 windows
const SAMPLE_MS = MISS_COMMIT_MS + 20; // commit+20: the dark miss fill
const POST_COMMIT_MS = MISS_COMMIT_MS + 20;
const EXPIRY_MS = MISS_COMMIT_MS + 350; // miss-expiry cull boundary
const APPROACH_MS = 860; // approach, before the success zone
const SUCCESS_ZONE_MS = 910; // inside the success zone (white-core peak pre-fix)
const LATE_MS = 1090; // late window, unresolved, pre-commit
const NOTE_COLOR = "#2468AC";
const NOTE_CELL = 5; // left column mid row — same cell the 0.0.61 oracle uses
const DARK_MISS = { r: 0x2a, g: 0x30, b: 0x38 }; // #2a3038
// Region sizing in canvas px at DPR 1 (844x390): the note renders ~90 px wide at
// the sample depth and the Miss label ~100 px wide above it.
const LABEL_HALF_X = 60;
const LABEL_TOP_PAD = 40;
const NOTE_HALF = 60; // authored glyph extent (white outline + fill + shadow)
const FILL_SHRINK = 55; // shrink the note box to exclude the authored white outline ring
const OUTLINE_SHRINK = 10; // smaller shrink: captures the outline ring for the outline-presence guard
const NOTE_TOP_CLEARANCE = 45; // label box ends this far above the note center
const VIEW_PAD = 12;
// No-flash gate thresholds.
const MAX_LUMA = 210; // a white core reads ~255; song-color fill + AA outline edges pass with margin
const MAX_COMMIT_DELTALUMA = 80; // song→#2a3038 is a bounded step; white/gray transitions are not
const DARK_TOL = 24; // commit+20 fill must match #2a3038 within this per-channel tolerance

// Serve the repo's own testbed surface (real GLBs via assets/gameplay, same
// origin rules as the existing validate-w1c-facade-pixels.js harness).
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const brandingRelative = pathname.startsWith("/branding/") ? pathname.slice(10) : null;
    const relative = pathname === "/" ? ".testbed/demo/index.html" : pathname.slice(1);
    const file =
      brandingRelative === null ? normalize(join(ROOT, relative)) : normalize(join(BRANDING_ROOT, brandingRelative));
    const allowed = brandingRelative === null ? ROOT : BRANDING_ROOT;
    if (file !== allowed && !file.startsWith(allowed)) {
      response.writeHead(403).end();
      return;
    }
    const content = await readFile(file);
    const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".jpg": "image/jpeg" };
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
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
let evidence = null;
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const noise = [];
  page.on("console", (message) => {
    const type = message.type(),
      text = message.text(),
      location = message.location(),
      sourceUrl = location.url;
    if (["warning", "error"].includes(type) && !isExpectedReadPixelsWarning(type, text, sourceUrl, location.lineNumber, location.columnNumber, expectedPageUrl))
      noise.push(`${type}: ${text} [sourceUrl=${JSON.stringify(sourceUrl)}]`);
  });
  page.on("pageerror", (error) => noise.push(`pageerror: ${error.message}`));
  await page.goto(expectedPageUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => globalThis.__AERO_RENDERER_TEST__?.ready === true && globalThis.__AERO_RENDERER_TEST__.renderers[0].describe().gameplayAssets.state === "ready");
  evidence = await page.evaluate(async (args) => {
    const { APPROACH_MS, SUCCESS_ZONE_MS, LATE_MS, BEAT_CENTER_MS, SAMPLE_MS, EXPIRY_MS, MISS_COMMIT_MS, NOTE_COLOR, NOTE_CELL, LABEL_HALF_X, LABEL_TOP_PAD, NOTE_HALF, FILL_SHRINK, OUTLINE_SHRINK, NOTE_TOP_CLEARANCE, VIEW_PAD, DARK_MISS, DARK_TOL } = args;
    const renderer = globalThis.__AERO_RENDERER_TEST__.renderers[0],
      canvas = document.querySelector("#primary canvas");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Primary canvas missing");
    renderer.resize({ widthCssPx: 844, heightCssPx: 390, devicePixelRatio: 1 });
    renderer.setEnvironmentVisible(false);
    renderer.setBackgroundProjection({ kind: "solid", colors: ["#102030"], angleDeg: 180 });
    const sample = () => {
      const out = new OffscreenCanvas(canvas.width, canvas.height),
        context = out.getContext("2d", { willReadFrequently: true });
      context.drawImage(canvas, 0, 0);
      return context.getImageData(0, 0, out.width, out.height).data;
    };
    const frameFor = (nowMs) => ({
      presentation: "flow",
      nowMs,
      timingWindowBeforeMs: 180,
      timingWindowAfterMs: 180,
      targets: [
        {
          id: "wd-note",
          kind: "flow",
          hand: "left",
          family: "flow",
          cell: NOTE_CELL,
          cells: [],
          lane: null,
          beatCenterMs: BEAT_CENTER_MS,
          direction: "right",
          appearanceColor: NOTE_COLOR,
          judgement: nowMs >= MISS_COMMIT_MS ? "miss" : "pending",
          ...(nowMs >= MISS_COMMIT_MS ? { missCommitMs: MISS_COMMIT_MS } : {})
        }
      ]
    });
    const render = (nowMs) => renderer.renderGameplayFrame(frameFor(nowMs));
    const cropPng = (x0, y0, x1, y1) =>
      new Promise((done) => {
        const c = document.createElement("canvas");
        c.width = x1 - x0;
        c.height = y1 - y0;
        c.getContext("2d").drawImage(canvas, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
        done(c.toDataURL("image/png"));
      });
    // Render the sample (commit+20) frame FIRST: the model positions are the
    // truth the oracle anchors on, and worldToScreen is only valid after the
    // frame has rendered.
    const sampled = render(SAMPLE_MS);
    const objects = sampled.model.objects;
    const icon = objects.find((e) => e.targetId === "wd-note" && e.kind === "icon");
    const fb = objects.find((e) => e.targetId === "wd-note" && e.kind === "feedback");
    if (!icon || !fb) throw new Error("sample frame must contain the missed note icon and its Miss label");
    const project = (p) => {
      const out = renderer.cameraEntity.camera.worldToScreen({ x: p.x, y: p.y, z: p.z });
      return { x: out.x, y: out.y };
    };
    const iconP = project(icon.position),
      fbP = project(fb.position);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    // Fill region: the note box shrunk from its authored extent so the authored
    // white outline ring (the light structural edge, constant from spawn) is
    // excluded — the luma gate measures the FILL only. The 0.0.61 oracle used a
    // label-box vs note-box guard for the same exclusion; here the fill box is
    // directly shrunk around the icon center.
    const noteBox = {
      x0: clamp(Math.floor(iconP.x - NOTE_HALF), 0, canvas.width),
      x1: clamp(Math.ceil(iconP.x + NOTE_HALF), 0, canvas.width),
      y0: clamp(Math.floor(iconP.y - NOTE_HALF), 0, canvas.height),
      y1: clamp(Math.ceil(iconP.y + NOTE_HALF), 0, canvas.height)
    };
    const fillBox = {
      x0: clamp(Math.floor(iconP.x - (NOTE_HALF - FILL_SHRINK)), 0, canvas.width),
      x1: clamp(Math.ceil(iconP.x + (NOTE_HALF - FILL_SHRINK)), 0, canvas.width),
      y0: clamp(Math.floor(iconP.y - (NOTE_HALF - FILL_SHRINK)), 0, canvas.height),
      y1: clamp(Math.ceil(iconP.y + (NOTE_HALF - FILL_SHRINK)), 0, canvas.height)
    };
    const outlineBox = {
      x0: clamp(Math.floor(iconP.x - (NOTE_HALF - OUTLINE_SHRINK)), 0, canvas.width),
      x1: clamp(Math.ceil(iconP.x + (NOTE_HALF - OUTLINE_SHRINK)), 0, canvas.width),
      y0: clamp(Math.floor(iconP.y - (NOTE_HALF - OUTLINE_SHRINK)), 0, canvas.height),
      y1: clamp(Math.ceil(iconP.y + (NOTE_HALF - OUTLINE_SHRINK)), 0, canvas.height)
    };
    const labelBox = {
      x0: clamp(Math.floor(fbP.x - LABEL_HALF_X), 0, canvas.width),
      x1: clamp(Math.ceil(fbP.x + LABEL_HALF_X), 0, canvas.height),
      y0: clamp(Math.floor(fbP.y - LABEL_TOP_PAD), 0, canvas.height),
      y1: clamp(Math.ceil(iconP.y - NOTE_TOP_CLEARANCE), 0, canvas.height)
    };
    const view = {
      x0: clamp(Math.floor(Math.min(labelBox.x0, noteBox.x0)) - VIEW_PAD, 0, canvas.width),
      x1: clamp(Math.ceil(Math.max(labelBox.x1, noteBox.x1)) + VIEW_PAD, 0, canvas.width),
      y0: clamp(Math.floor(Math.min(labelBox.y0, noteBox.y0)) - VIEW_PAD, 0, canvas.height),
      y1: clamp(Math.ceil(Math.max(noteBox.y1, labelBox.y1)) + VIEW_PAD, 0, canvas.height)
    };
    const luma = (p, i) => 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2];
    const isWhite = (p, i) => p[i] >= 210 && p[i + 1] >= 210 && p[i + 2] >= 210;
    const isDark = (p, i) => Math.abs(p[i] - DARK_MISS.r) <= DARK_TOL && Math.abs(p[i + 1] - DARK_MISS.g) <= DARK_TOL && Math.abs(p[i + 2] - DARK_MISS.b) <= DARK_TOL;
    const isRed = (p, i) => p[i] > 180 && p[i + 1] < 120 && p[i + 2] < 120;
    // Per-pixel region luma, excluding background/AA (sub-threshold delta from
    // the no-note baseline of the SAME frame is treated as background).
    const regionLuma = (pixels, baseline, box, fillOnly = false) => {
      let max = 0,
        sum = 0,
        count = 0,
        white = 0,
        dark = 0;
      for (let y = box.y0; y < box.y1; y++) {
        for (let x = box.x0; x < box.x1; x++) {
          const i = (y * canvas.width + x) * 4;
          const dr = Math.abs(pixels[i] - baseline[i]) + Math.abs(pixels[i + 1] - baseline[i + 1]) + Math.abs(pixels[i + 2] - baseline[i + 2]);
          if (dr <= 12) continue; // background / sub-threshold AA
          const l = luma(pixels, i);
          if (isWhite(pixels, i)) { white += 1; if (fillOnly) continue; }
          if (l > max) max = l;
          sum += l;
          count += 1;
          if (isDark(pixels, i)) dark += 1;
        }
      }
      return { maxLuma: max, meanLuma: count > 0 ? sum / count : 0, count, whitePx: white, darkPx: dark };
    };
    const labelRegionLuma = (pixels, baseline, box) => {
      let white = 0;
      for (let y = box.y0; y < box.y1; y++)
        for (let x = box.x0; x < box.x1; x++) {
          const i = (y * canvas.width + x) * 4;
          const dr = Math.abs(pixels[i] - baseline[i]) + Math.abs(pixels[i + 1] - baseline[i + 1]) + Math.abs(pixels[i + 2] - baseline[i + 2]);
          if (dr <= 12) continue;
          if (isWhite(pixels, i)) white += 1;
        }
      return white;
    };
    const captureFrame = async (nowMs, box) => {
      // Baseline: same frame with the note removed, so the region delta excludes
      // the static track/timing rows and only counts the note itself.
      renderer.renderGameplayFrame({ ...frameFor(nowMs), targets: [] });
      const baseline = sample();
      render(nowMs); // restore the note frame so the pixels + crop are the note present
      const pixels = sample();
      const crop = await cropPng(view.x0, view.y0, view.x1, view.y1);
      return { nowMs, fill: regionLuma(pixels, baseline, box, true), outline: regionLuma(pixels, baseline, outlineBox), labelWhitePx: labelRegionLuma(pixels, baseline, labelBox), crop };
    };
    // Approach → success zone → crossing → late window → commit → commit+20.
    const approach = await captureFrame(APPROACH_MS, fillBox);
    const success = await captureFrame(SUCCESS_ZONE_MS, fillBox);
    const crossing = await captureFrame(BEAT_CENTER_MS, fillBox);
    const late = await captureFrame(LATE_MS, fillBox);
    const commit = await captureFrame(MISS_COMMIT_MS, fillBox);
    const sampleFrame = await captureFrame(SAMPLE_MS, fillBox);
    const fillStats = { approach: approach.fill, success: success.fill, crossing: crossing.fill, late: late.fill, commit: commit.fill, "commit+20": sampleFrame.fill };
    const maxLumaWindow = Math.max(approach.fill.maxLuma, success.fill.maxLuma, crossing.fill.maxLuma, late.fill.maxLuma);
    const commitDeltaLuma = Math.abs(sampleFrame.fill.meanLuma - late.fill.meanLuma);
    // Cull: at commit+350 ms the note is gone (no icon in the model).
    const cullModel = render(EXPIRY_MS);
    const cullIconPresent = cullModel.model.objects.some((e) => e.targetId === "wd-note" && e.kind === "icon");
    const expired = await captureFrame(EXPIRY_MS, fillBox);
    // Side-by-side: approach | success-zone | commit+20 | expired.
    const side = document.createElement("canvas");
    const rw = view.x1 - view.x0,
      rh = view.y1 - view.y0;
    side.width = rw * 4 + 12;
    side.height = rh;
    const sideCtx = side.getContext("2d");
    sideCtx.fillStyle = "#000";
    sideCtx.fillRect(0, 0, side.width, side.height);
    const putRegion = (dx) => sideCtx.drawImage(canvas, view.x0, view.y0, rw, rh, dx, 0, rw, rh);
    render(APPROACH_MS);
    putRegion(0);
    render(SUCCESS_ZONE_MS);
    putRegion(rw + 4);
    render(SAMPLE_MS);
    putRegion(rw * 2 + 8);
    render(EXPIRY_MS);
    putRegion(rw * 3 + 12);
    return {
      approachMs: APPROACH_MS,
      successZoneMs: SUCCESS_ZONE_MS,
      beatCenterMs: BEAT_CENTER_MS,
      lateMs: LATE_MS,
      missCommitMs: MISS_COMMIT_MS,
      sampleMs: SAMPLE_MS,
      expiryMs: EXPIRY_MS,
      iconScreen: iconP,
      feedbackScreen: fbP,
      labelBox,
      noteBox,
      fillBox,
      view,
      fillStats,
      maxLumaWindow,
      commitDeltaLuma,
      labelWhitePx: sampleFrame.labelWhitePx,
      cullIconPresent,
      glyphGuard: {
        darkPx: sampleFrame.fill.darkPx,
        redPx: (() => {
          let n = 0;
          render(SAMPLE_MS);
          const pixels = sample();
          for (let y = labelBox.y0; y < labelBox.y1; y++)
            for (let x = labelBox.x0; x < labelBox.x1; x++) {
              const i = (y * canvas.width + x) * 4;
              if (isRed(pixels, i)) n += 1;
            }
          return n;
        })(),
        whiteOutlinePx: sampleFrame.outline.whitePx,
        modelIconState: icon.state,
        modelIconAppearance: icon.appearanceColor
      },
      canvasSize: { width: canvas.width, height: canvas.height },
      crops: { approachCrop: approach.crop, successCrop: success.crop, commitCrop: commit.crop, sampleCrop: sampleFrame.crop, expiredCrop: expired.crop, sideBySidePng: side.toDataURL("image/png") }
    };
  }, { APPROACH_MS, SUCCESS_ZONE_MS, LATE_MS, BEAT_CENTER_MS, SAMPLE_MS, EXPIRY_MS, MISS_COMMIT_MS, NOTE_COLOR, NOTE_CELL, LABEL_HALF_X, LABEL_TOP_PAD, NOTE_HALF, FILL_SHRINK, OUTLINE_SHRINK, NOTE_TOP_CLEARANCE, VIEW_PAD, DARK_MISS, DARK_TOL });
  assert.deepEqual(noise, [], `unexpected console noise: ${JSON.stringify(noise)}`);
} catch (error) {
  await browser.close();
  await new Promise((done) => server.close(done));
  throw error;
}
await browser.close();
await new Promise((done) => server.close(done));

// Persist evidence: crops + numbers.
mkdirSync(EVIDENCE_DIR, { recursive: true });
const pngFromDataUrl = (dataUrl) => Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
writeFileSync(join(EVIDENCE_DIR, "approach.png"), pngFromDataUrl(evidence.crops.approachCrop));
writeFileSync(join(EVIDENCE_DIR, "success-zone.png"), pngFromDataUrl(evidence.crops.successCrop));
writeFileSync(join(EVIDENCE_DIR, "note-at-commit.png"), pngFromDataUrl(evidence.crops.commitCrop));
writeFileSync(join(EVIDENCE_DIR, "note-commit-plus-20.png"), pngFromDataUrl(evidence.crops.sampleCrop));
writeFileSync(join(EVIDENCE_DIR, "expired.png"), pngFromDataUrl(evidence.crops.expiredCrop));
writeFileSync(join(EVIDENCE_DIR, "side-by-side.png"), pngFromDataUrl(evidence.crops.sideBySidePng));
const numbers = {
  mode: MODE,
  runTag: RUN_TAG,
  approachMs: evidence.approachMs,
  successZoneMs: evidence.successZoneMs,
  beatCenterMs: evidence.beatCenterMs,
  lateMs: evidence.lateMs,
  missCommitMs: evidence.missCommitMs,
  sampleMs: evidence.sampleMs,
  expiryMs: evidence.expiryMs,
  iconScreen: evidence.iconScreen,
  feedbackScreen: evidence.feedbackScreen,
  labelBox: evidence.labelBox,
  noteBox: evidence.noteBox,
  fillBox: evidence.fillBox,
  view: evidence.view,
  fillStats: evidence.fillStats,
  maxLumaWindow: evidence.maxLumaWindow,
  commitDeltaLuma: evidence.commitDeltaLuma,
  labelWhitePx: evidence.labelWhitePx,
  cullIconPresent: evidence.cullIconPresent,
  glyphGuard: evidence.glyphGuard,
  canvasSize: evidence.canvasSize
};
writeFileSync(join(EVIDENCE_DIR, "numbers.json"), `${JSON.stringify(numbers, null, 2)}\n`);
console.log(
  `0.0.62 white-flash ${MODE} run=${RUN_TAG} maxLuma(window)=${evidence.maxLumaWindow} commitΔluma=${evidence.commitDeltaLuma.toFixed(1)} fill=${JSON.stringify(evidence.fillStats)} labelWhite=${evidence.labelWhitePx} cull=${evidence.cullIconPresent} guard=${JSON.stringify(evidence.glyphGuard)}`
);

// Build-independent guards (hold on BOTH the pre-fix and post-fix builds, so
// capture-before can still record evidence): the region really is the missed
// beat, the note culls at the lifetime boundary, and the Miss label does not
// flash white.
assert.equal(evidence.glyphGuard.modelIconState, "miss", "model must show the miss state at the sample frame");
assert.ok(evidence.glyphGuard.redPx > 10, `glyph guard: Miss label red face must be visible in the crop: ${evidence.glyphGuard.redPx} px`);
assert.ok(evidence.glyphGuard.whiteOutlinePx > 10, `glyph guard: the authored white note outline must still be present: ${evidence.glyphGuard.whiteOutlinePx} px`);
// Cull guard: at commit+350 ms the note is gone.
assert.equal(evidence.cullIconPresent, false, "missed note must cull at the exact 350 ms lifetime boundary");
// Kept 0.0.61 good gate: the Miss label separation ring is dark (#171a22) —
// 0 white px in the label box at commit+20.
assert.equal(evidence.labelWhitePx, 0, `the Miss label must not flash white at commit+20 ms: ${evidence.labelWhitePx} white px in the label box`);

if (MODE === "assert-after") {
  // The gate shape: after Option A the flash is GONE.
  assert.equal(evidence.glyphGuard.modelIconAppearance, "#2a3038", "AFTER: model must carry the dark miss appearance (#2a3038)");
  assert.ok(evidence.glyphGuard.darkPx > 40, `AFTER: glyph guard — dark miss fill must be visible in the crop: ${evidence.glyphGuard.darkPx} px`);
  assert.ok(evidence.maxLumaWindow < MAX_LUMA, `AFTER: no bright spike — max fill luma across approach→success→late must be < ${MAX_LUMA}: got ${evidence.maxLumaWindow} (a white core reads ~255)`);
  assert.ok(evidence.commitDeltaLuma < MAX_COMMIT_DELTALUMA, `AFTER: luma continuity — max |Δluma| across the miss-commit frame must be < ${MAX_COMMIT_DELTALUMA}: got ${evidence.commitDeltaLuma.toFixed(1)}`);
  assert.ok(evidence.fillStats["commit+20"].darkPx > 40, `AFTER: miss fill is dark — commit+20 fill must match #2a3038: got ${evidence.fillStats["commit+20"].darkPx} px`);
  console.log(`ORACLE 0.0.62-white-flash PASS: no bright spike (maxLuma ${evidence.maxLumaWindow} < ${MAX_LUMA}), luma continuity (Δ ${evidence.commitDeltaLuma.toFixed(1)} < ${MAX_COMMIT_DELTALUMA}), dark miss fill. Dark-miss + Miss label + authored outline intact.`);
} else if (MODE === "capture-before") {
  // Record-only for the BEFORE build: the white-core bright spike IS present.
  assert.ok(evidence.maxLumaWindow >= MAX_LUMA, `BEFORE: expected a bright spike (white core) at the success zone, got max fill luma ${evidence.maxLumaWindow} (< ${MAX_LUMA} — the white core is not rendering a bright fill, detector or scene is wrong)`);
  console.log(`ORACLE 0.0.62-white-flash capture-before: bright spike present at the success zone (max fill luma ${evidence.maxLumaWindow} >= ${MAX_LUMA}); commit Δluma ${evidence.commitDeltaLuma.toFixed(1)}. Crops: ${EVIDENCE_DIR}`);
} else {
  // capture-after: record numbers without asserting direction.
  console.log(`ORACLE 0.0.62-white-flash capture-after: maxLuma(window)=${evidence.maxLumaWindow} commitΔluma=${evidence.commitDeltaLuma.toFixed(1)}. Crops: ${EVIDENCE_DIR}`);
}
