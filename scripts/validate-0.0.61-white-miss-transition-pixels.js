// @ts-check
// 0.0.61 L-D (bead 0hou) real-pixel before/after oracle — white flash on the
// beat success→miss transition (friend playtest found it confusing).
//
// ROOT CAUSE (proven by pixel evidence from this oracle): the white flash is
// the Miss feedback glyph's SEPARATION OUTLINE, not the note fill. The Miss
// label pops in at full alpha on commit and pre-fix was rendered with a white
// one-cell border around its red face ("red/white separation", old README),
// so a burst of new white appeared beside the note at the success→miss
// transition. The note fill is NOT a source: the scene model is a pure
// function of nowMs and the facade applies material state synchronously each
// frame (applyAssetAppearance is immediate, state-cached, no tween), so the
// fill is fully gray at commit+0 ms — the commit-frame anti-lag guard below
// pins that. The note's own structural white outline is authored geometry
// (present from spawn; validate-browser-renderer.js asserts "directional
// structural white outline must remain authored white") — it is constant, not
// a flash, so the detector does not count note-outline white and only gates
// the white that the transition itself introduces.
//
// Repro (deterministic chart/pose, canonical production camera):
//   One Flow note (cell 5, song color #2468AC) crossing the judge plane at
//   beatCenterMs = 1000, timing window 180/180. It is a genuine miss: gameplay
//   records judgement:"miss" at the exact late-window commit (missCommitMs =
//   1181). Before commit the note is UNRESOLVED inside the green success zone
//   (renderer-owned success-area white core, tintMix=1 — the same white
//   styling the spec keeps for success adjacency). At commit the scene model
//   atomically switches the icon to the gray miss state (#7c828c).
//
// Detector (baseline-subtracted, region anchored on the MODEL positions —
//   worldToScreen is only valid after the frame has rendered):
//   (1) label box = above the note around the Miss label: the ONLY place new
//       white appears at the transition
//   (2) flash white = baseline-subtracted white px (all channels >= 210) in
//       the label box; white px in the note box (its authored outline, always
//       present) are recorded but not gated
//   (3) glyph-presence guards: gray fill (#7c828c ±30) > 40 px in the note
//       box and red Miss face > 10 px in the label box — the region really is
//       the missed beat
//   (4) commit-frame anti-lag guard: at commit+0 ms the model already reports
//       whiteCore=false and the fill reads gray — no fill lag exists
//   (5) white-control: a note INSIDE the green success zone at 900 ms must
//       read > 200 white px in its note box — the detector itself is alive
//
// BEFORE build: flash white px > 30 in the commit+20 ms label box (flash visible).
// AFTER build : flash white px == 0 (flash removed; gray miss + Miss label remain).
//
// Crops are saved under scripts/evidence/0.0.61-white-miss-transition/<run>/
// as baseline.png, note-at-commit.png, note-commit-plus-20.png,
// white-control-success-zone.png plus a side-by-side. Run mode is explicit:
//   node scripts/validate-0.0.61-white-miss-transition-pixels.js assert-after
//   node scripts/validate-0.0.61-white-miss-transition-pixels.js capture-before
//   node scripts/validate-0.0.61-white-miss-transition-pixels.js capture-after
// `assert-after` asserts flash white px == 0 and fails otherwise (the CI gate
// shape). `capture-before` / `capture-after` record the numbers + crops
// without asserting the direction, so a pre-fix checkout can still run the
// oracle and produce the BEFORE evidence.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";
import { isExpectedReadPixelsWarning } from "./browser-console-policy.js";

const ROOT = resolve(process.cwd());
const BRANDING_ROOT = resolve(ROOT, "../aerobeat-branding/icons/web-gameplay");
const EVIDENCE_ROOT = resolve(ROOT, "scripts/evidence/0.0.61-white-miss-transition");
const MODE = process.argv[2] ?? "capture-after";
assert.ok(["assert-after", "capture-before", "capture-after"].includes(MODE), `unknown mode ${MODE}`);
const RUN_TAG = `${MODE}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
const EVIDENCE_DIR = join(EVIDENCE_ROOT, RUN_TAG);

// Deterministic chart/pose constants (canonical camera; see gameplay-camera-pose.js).
const BEAT_CENTER_MS = 1000;
const MISS_COMMIT_MS = 1181; // exact late-window commit for 180/180 windows
const SAMPLE_MS = MISS_COMMIT_MS + 20; // commit+20: flash frame BEFORE, gray+Miss AFTER
const NOTE_COLOR = "#2468AC";
const NOTE_CELL = 5; // left column mid row — same cell the 0.0.59 oracle uses
// Region sizing in canvas px at DPR 1 (844x390): the note renders ~90 px wide
// at the sample depth and the Miss label ~100 px wide above it.
const LABEL_HALF_X = 60;
const LABEL_TOP_PAD = 40;
const NOTE_HALF = 60;
const NOTE_TOP_CLEARANCE = 45; // label box ends this far above the note center
const VIEW_PAD = 12;

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
    const { SAMPLE_MS, MISS_COMMIT_MS, BEAT_CENTER_MS, CONTROL_MS, NOTE_COLOR, NOTE_CELL, LABEL_HALF_X, LABEL_TOP_PAD, NOTE_HALF, NOTE_TOP_CLEARANCE, VIEW_PAD } = args;
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
    const deltaRGB = (a, b, i) => Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    const frameFor = (nowMs, withNote) => ({
      presentation: "flow",
      nowMs,
      timingWindowBeforeMs: 180,
      timingWindowAfterMs: 180,
      targets: withNote
        ? [
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
        : []
    });
    const render = (nowMs, withNote) => renderer.renderGameplayFrame(frameFor(nowMs, withNote));
    const cropPng = (x0, y0, x1, y1) =>
      new Promise((done) => {
        const c = document.createElement("canvas");
        c.width = x1 - x0;
        c.height = y1 - y0;
        c.getContext("2d").drawImage(canvas, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
        done(c.toDataURL("image/png"));
      });
    // Model positions FIRST: the frame must be rendered before worldToScreen
    // is valid, and the sample frame's model is the truth the oracle anchors on.
    const sampled = render(SAMPLE_MS, true);
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
    // Control position: note unresolved inside the green success zone at 900 ms.
    const control = render(CONTROL_MS, true);
    const icon900 = control.model.objects.find((e) => e.targetId === "wd-note" && e.kind === "icon");
    const icon900P = project(icon900.position);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const labelBox = {
      x0: clamp(Math.floor(fbP.x - LABEL_HALF_X), 0, canvas.width),
      x1: clamp(Math.ceil(fbP.x + LABEL_HALF_X), 0, canvas.width),
      y0: clamp(Math.floor(fbP.y - LABEL_TOP_PAD), 0, canvas.height),
      y1: clamp(Math.ceil(iconP.y - NOTE_TOP_CLEARANCE), 0, canvas.height)
    };
    const noteBox = {
      x0: clamp(Math.floor(iconP.x - NOTE_HALF), 0, canvas.width),
      x1: clamp(Math.ceil(iconP.x + NOTE_HALF), 0, canvas.width),
      y0: clamp(Math.floor(iconP.y - NOTE_HALF), 0, canvas.height),
      y1: clamp(Math.ceil(iconP.y + NOTE_HALF), 0, canvas.height)
    };
    const noteBox900 = {
      x0: clamp(Math.floor(icon900P.x - NOTE_HALF), 0, canvas.width),
      x1: clamp(Math.ceil(icon900P.x + NOTE_HALF), 0, canvas.width),
      y0: clamp(Math.floor(icon900P.y - NOTE_HALF), 0, canvas.height),
      y1: clamp(Math.ceil(icon900P.y + NOTE_HALF), 0, canvas.height)
    };
    const view = {
      x0: clamp(Math.floor(Math.min(labelBox.x0, noteBox.x0, noteBox900.x0)) - VIEW_PAD, 0, canvas.width),
      x1: clamp(Math.ceil(Math.max(labelBox.x1, noteBox.x1, noteBox900.x1)) + VIEW_PAD, 0, canvas.width),
      y0: clamp(Math.floor(Math.min(labelBox.y0, noteBox.y0, noteBox900.y0)) - VIEW_PAD, 0, canvas.height),
      y1: clamp(Math.ceil(Math.max(noteBox.y1, noteBox900.y1)) + VIEW_PAD, 0, canvas.height)
    };
    const isWhite = (p, i) => p[i] >= 210 && p[i + 1] >= 210 && p[i + 2] >= 210;
    const isGray = (p, i) => Math.abs(p[i] - 124) <= 30 && Math.abs(p[i + 1] - 130) <= 30 && Math.abs(p[i + 2] - 140) <= 30;
    const isRed = (p, i) => p[i] > 180 && p[i + 1] < 120 && p[i + 2] < 120;
    const countIn = (pixels, baseline, box, pred, whole = false) => {
      let n = 0;
      const y0 = whole ? 0 : box.y0,
        y1 = whole ? canvas.height : box.y1,
        x0 = whole ? 0 : box.x0,
        x1 = whole ? canvas.width : box.x1;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * canvas.width + x) * 4;
          if (deltaRGB(pixels, baseline, i) <= 12) continue; // background / sub-threshold AA
          if (pred(pixels, i)) n += 1;
        }
      }
      return n;
    };
    // Baseline: same scene, note removed (track/timing rows identical).
    render(SAMPLE_MS, false);
    const baseline = sample(),
      baselineCrop = await cropPng(view.x0, view.y0, view.x1, view.y1);
    // Commit frame (commit+0): the anti-lag guard — fill must already be gray.
    render(MISS_COMMIT_MS, false);
    const commitBaseline = sample();
    const commitSampled = render(MISS_COMMIT_MS, true);
    const commitIcon = commitSampled.model.objects.find((e) => e.targetId === "wd-note" && e.kind === "icon");
    const commitPixels = sample(),
      commitCrop = await cropPng(view.x0, view.y0, view.x1, view.y1);
    const grayCommitPx = countIn(commitPixels, commitBaseline, null, isGray, true);
    // Sample frame: the missed beat at commit+20 ms (the flash frame BEFORE).
    render(SAMPLE_MS, true);
    const samplePixels = sample(),
      sampleCrop = await cropPng(view.x0, view.y0, view.x1, view.y1);
    const stats = {
      whiteFlashPx: countIn(samplePixels, baseline, labelBox, isWhite),
      whiteInNotePx: countIn(samplePixels, baseline, noteBox, isWhite),
      grayPx: countIn(samplePixels, baseline, noteBox, isGray),
      redPx: countIn(samplePixels, baseline, labelBox, isRed)
    };
    // White-control: the success-zone white core must read as real white.
    render(CONTROL_MS, false);
    const controlBaseline = sample();
    render(CONTROL_MS, true);
    const controlPixels = sample(),
      controlCrop = await cropPng(view.x0, view.y0, view.x1, view.y1);
    const whiteControlPx = countIn(controlPixels, controlBaseline, noteBox900, isWhite);
    // Side-by-side: baseline | sample | white-control.
    const side = document.createElement("canvas");
    const rw = view.x1 - view.x0,
      rh = view.y1 - view.y0;
    side.width = rw * 3 + 8;
    side.height = rh;
    const sideCtx = side.getContext("2d");
    sideCtx.fillStyle = "#000";
    sideCtx.fillRect(0, 0, side.width, side.height);
    const putRegion = (dx) => sideCtx.drawImage(canvas, view.x0, view.y0, rw, rh, dx, 0, rw, rh);
    render(SAMPLE_MS, false);
    putRegion(0);
    render(SAMPLE_MS, true);
    putRegion(rw + 4);
    render(CONTROL_MS, true);
    putRegion(rw * 2 + 8);
    return {
      sampleMs: SAMPLE_MS,
      missCommitMs: MISS_COMMIT_MS,
      beatCenterMs: BEAT_CENTER_MS,
      iconScreen: iconP,
      feedbackScreen: fbP,
      labelBox,
      noteBox,
      noteBox900,
      view,
      stats,
      whiteControlPx,
      grayCommitPx,
      glyphGuard: {
        grayPx: stats.grayPx,
        redPx: stats.redPx,
        modelIconState: icon.state,
        modelIconAppearance: icon.appearanceColor,
        modelIconWhiteCore: icon.whiteCore,
        modelFeedbackText: fb.feedback.text,
        commitIconState: commitIcon?.state ?? null,
        commitIconAppearance: commitIcon?.appearanceColor ?? null,
        commitIconWhiteCore: commitIcon?.whiteCore ?? null
      },
      canvasSize: { width: canvas.width, height: canvas.height },
      crops: { baselineCrop, commitCrop, sampleCrop, controlCrop, sideBySidePng: side.toDataURL("image/png") }
    };
  }, { SAMPLE_MS, MISS_COMMIT_MS, BEAT_CENTER_MS, CONTROL_MS: 900, NOTE_COLOR, NOTE_CELL, LABEL_HALF_X, LABEL_TOP_PAD, NOTE_HALF, NOTE_TOP_CLEARANCE, VIEW_PAD });
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
writeFileSync(join(EVIDENCE_DIR, "baseline.png"), pngFromDataUrl(evidence.crops.baselineCrop));
writeFileSync(join(EVIDENCE_DIR, "note-at-commit.png"), pngFromDataUrl(evidence.crops.commitCrop));
writeFileSync(join(EVIDENCE_DIR, "note-commit-plus-20.png"), pngFromDataUrl(evidence.crops.sampleCrop));
writeFileSync(join(EVIDENCE_DIR, "white-control-success-zone.png"), pngFromDataUrl(evidence.crops.controlCrop));
writeFileSync(join(EVIDENCE_DIR, "side-by-side-baseline-sample-control.png"), pngFromDataUrl(evidence.crops.sideBySidePng));
const numbers = {
  mode: MODE,
  runTag: RUN_TAG,
  beatCenterMs: evidence.beatCenterMs,
  missCommitMs: evidence.missCommitMs,
  sampleMs: evidence.sampleMs,
  iconScreen: evidence.iconScreen,
  feedbackScreen: evidence.feedbackScreen,
  labelBox: evidence.labelBox,
  noteBox: evidence.noteBox,
  noteBox900: evidence.noteBox900,
  view: evidence.view,
  stats: evidence.stats,
  whiteControlPx: evidence.whiteControlPx,
  grayCommitPx: evidence.grayCommitPx,
  glyphGuard: evidence.glyphGuard,
  canvasSize: evidence.canvasSize
};
writeFileSync(join(EVIDENCE_DIR, "numbers.json"), `${JSON.stringify(numbers, null, 2)}\n`);
console.log(
  `0.0.61 white-miss-transition ${MODE} run=${RUN_TAG} sample@${evidence.sampleMs}ms stats=${JSON.stringify(evidence.stats)} control=${evidence.whiteControlPx} gray@commit=${evidence.grayCommitPx} guard=${JSON.stringify(evidence.glyphGuard)}`
);

// Glyph-presence guard: the region really is the missed beat (gray fill +
// Miss label + model state), so "0 flash white px" means the flash is gone,
// not that the note region is empty.
assert.equal(evidence.glyphGuard.modelIconState, "miss", "model must show the miss state at the sample frame");
assert.equal(evidence.glyphGuard.modelIconAppearance, "#7c828c", "model must carry the gray miss appearance");
assert.equal(evidence.glyphGuard.modelIconWhiteCore, false, "model must not carry the success white core at the sample frame");
assert.equal(evidence.glyphGuard.modelFeedbackText, "Miss", "model must carry the Miss label at the sample frame");
assert.ok(evidence.glyphGuard.grayPx > 40, `glyph guard: gray miss fill must be visible in the crop: ${evidence.glyphGuard.grayPx} px`);
assert.ok(evidence.glyphGuard.redPx > 10, `glyph guard: Miss label red face must be visible in the crop: ${evidence.glyphGuard.redPx} px`);
// Anti-lag guard: at commit+0 the fill is already gray — no fill lag exists.
assert.equal(evidence.glyphGuard.commitIconState, "miss", "commit frame must already be in the miss state");
assert.equal(evidence.glyphGuard.commitIconWhiteCore, false, "commit frame must already carry no white core");
assert.ok(evidence.grayCommitPx > 40, `anti-lag guard: gray fill must already render at commit+0: ${evidence.grayCommitPx} px`);
// White-control: the detector itself reads real white when the success-area
// white core is alive (the 900 ms frame, note inside the green zone).
assert.ok(evidence.whiteControlPx > 200, `white detector control: the success-zone white core must render measurable white: ${evidence.whiteControlPx} px`);

if (MODE === "assert-after") {
  // The gate shape: after the fix the flash is GONE.
  assert.equal(evidence.stats.whiteFlashPx, 0, `AFTER: the success→miss transition must not flash white: ${evidence.stats.whiteFlashPx} white px in the label box at commit+20 ms (crops: ${EVIDENCE_DIR})`);
  console.log("ORACLE 0.0.61-white-miss-transition PASS: no white flash on the success→miss transition (gray miss + Miss label intact).");
} else if (MODE === "capture-before") {
  // Record-only for the BEFORE build: the flash IS present.
  assert.ok(evidence.stats.whiteFlashPx > 30, `BEFORE: expected the white flash at commit+20 ms, found ${evidence.stats.whiteFlashPx} white px (flash must be > 30 px to be a real flash)`);
  console.log(`ORACLE 0.0.61-white-miss-transition capture-before: flash present at commit+20 ms (${evidence.stats.whiteFlashPx} white px). Crops: ${EVIDENCE_DIR}`);
} else {
  // capture-after: record numbers without asserting direction.
  console.log(`ORACLE 0.0.61-white-miss-transition capture-after: flash white px at commit+20 ms = ${evidence.stats.whiteFlashPx}. Crops: ${EVIDENCE_DIR}`);
}
