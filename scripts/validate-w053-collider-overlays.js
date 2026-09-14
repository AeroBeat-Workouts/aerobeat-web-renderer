// @ts-check
// 0.0.53 W2 browser pixel oracles for the two debug-visibility overlays:
//   (a) Visible tolerance range — a directional note's entry cone (translucent sector) renders
//       only when `frame.visibleToleranceRange` is true; distinct from the background.
//   (b) Collider radius visibility — the inflated target square renders only when
//       `frame.visibleColliderRadius` is true; a different color than the cone.
//   (c) Both off (or absent) — NOTHING is drawn: zero overlay scene objects, no pixel shift
//       versus the baseline frame (zero cost), backward-compatible with frames that omit the fields.
//   (d) Backward compatibility — a frame with no overlay fields is byte-identical to before
//       (colliderOverlay defaults, no overlay objects) and does not break rendering.
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
    const shiftCount = (pixels, base, threshold = 24) => {
      let count = 0,
        greenExcess = 0,
        purpleExcess = 0;
      for (let index = 0; index < pixels.length; index += 4)
        if (deltaRGB(pixels, base, index) > threshold) {
          count++;
          // Cone is green (#39c96b); collider square is purple (#9a67ea). Attribute by channel excess.
          greenExcess += Math.max(0, pixels[index + 1] - base[index + 1]);
          purpleExcess += Math.max(0, pixels[index + 2] - base[index + 2]);
        }
      return { count, greenExcess, purpleExcess };
    };
    // A single directional Flow note near the active timing line so the overlay sits in view.
    const target = { id: "note-a", kind: "flow", hand: "left", family: "flow", cell: 5, cells: [5], lane: null, beatCenterMs: 1350, direction: "up" };
    const baseFrame = { presentation: "flow", nowMs: 1000, targets: [target] };

    // --- (c) Baseline / both-off: no overlay fields at all (backward compatible). ---
    renderer.renderGameplayFrame(baseFrame);
    const baseline = sample(),
      baselineModel = renderer.lastModel,
      baselineOverlay = baselineModel.colliderOverlay,
      baselineOverlayObjects = baselineModel.objects.filter((o) => o.kind === "tolerance_cone" || o.kind === "collider_square").length,
      baselineOverlayEntities = [...(renderer.colliderOverlayPrimitivePool ?? []), ...(renderer.colliderOverlayConePool ?? [])].filter((e) => e.enabled).length;

    // Explicit both-false must equal the absent-fields baseline.
    renderer.renderGameplayFrame({ ...baseFrame, visibleToleranceRange: false, visibleColliderRadius: false });
    const explicitOffModel = renderer.lastModel,
      explicitOffObjects = explicitOffModel.objects.filter((o) => o.kind === "tolerance_cone" || o.kind === "collider_square").length,
      explicitOffPixels = sample();
    const explicitOffShift = shiftCount(explicitOffPixels, baseline).count;

    // --- (a) Tolerance range ON: cone renders, green-shifted, distinct from background. ---
    renderer.renderGameplayFrame({ ...baseFrame, visibleToleranceRange: true });
    const coneModel = renderer.lastModel,
      coneOverlay = coneModel.colliderOverlay,
      coneObjects = coneModel.objects.filter((o) => o.kind === "tolerance_cone"),
      coneRealFan = coneObjects.filter((o) => o.aftermath && "directionX" in o.aftermath),
      coneMarker = coneObjects.filter((o) => o.aftermath === null),
      conePixels = sample();
    const coneShift = shiftCount(conePixels, baseline);

    // --- (b) Collider radius ON: square renders, purple-shifted, a different color than the cone. ---
    renderer.renderGameplayFrame({ ...baseFrame, visibleColliderRadius: true });
    const squareModel = renderer.lastModel,
      squareOverlay = squareModel.colliderOverlay,
      squareObjects = squareModel.objects.filter((o) => o.kind === "collider_square"),
      squarePixels = sample();
    const squareShift = shiftCount(squarePixels, baseline);

    // --- Both ON: both overlays present simultaneously. ---
    renderer.renderGameplayFrame({ ...baseFrame, visibleToleranceRange: true, visibleColliderRadius: true });
    const bothModel = renderer.lastModel,
      bothCones = bothModel.objects.filter((o) => o.kind === "tolerance_cone"),
      bothSquares = bothModel.objects.filter((o) => o.kind === "collider_square"),
      bothOverlay = bothModel.colliderOverlay,
      bothPixels = sample();
    const bothShift = shiftCount(bothPixels, baseline);

    // --- (d) Backward compatibility: a frame with only the new numeric fields (no booleans)
    // must not error and must keep overlays off. ---
    renderer.renderGameplayFrame({ ...baseFrame, colliderRadius: 0.2, directionToleranceDegrees: 30 });
    const numericOnlyModel = renderer.lastModel,
      numericOnlyOverlay = numericOnlyModel.colliderOverlay,
      numericOnlyObjects = numericOnlyModel.objects.filter((o) => o.kind === "tolerance_cone" || o.kind === "collider_square").length;

    // Restore idle state
    renderer.renderGameplayFrame(baseFrame);

    return {
      baseline: {
        overlay: baselineOverlay,
        overlayObjects: baselineOverlayObjects,
        overlayEntities: baselineOverlayEntities
      },
      explicitOff: { overlayObjects: explicitOffObjects, shiftedPixels: explicitOffShift, overlay: explicitOffModel.colliderOverlay },
      cone: {
        overlay: coneOverlay,
        fanCount: coneRealFan.length,
        markerCount: coneMarker.length,
        shiftedPixels: coneShift.count,
        greenExcess: coneShift.greenExcess,
        purpleExcess: coneShift.purpleExcess,
        firstVisual: coneRealFan[0]?.aftermath ? {
          directionX: coneRealFan[0].aftermath.directionX,
          directionY: coneRealFan[0].aftermath.directionY,
          toleranceDegrees: coneRealFan[0].aftermath.toleranceDegrees,
          innerRadius: coneRealFan[0].aftermath.innerRadius,
          vertexCount: coneRealFan[0].aftermath.vertexCount
        } : null,
        layerId: renderer.gameplayColliderOverlayLayer?.id ?? null
      },
      square: {
        overlay: squareOverlay,
        count: squareObjects.length,
        shiftedPixels: squareShift.count,
        purpleExcess: squareShift.purpleExcess,
        greenExcess: squareShift.greenExcess,
        halfExtent: squareObjects[0]?.aftermath?.halfExtent ?? null
      },
      both: {
        overlay: bothOverlay,
        coneCount: bothCones.length,
        squareCount: bothSquares.length,
        shiftedPixels: bothShift.count
      },
      numericOnly: { overlay: numericOnlyOverlay, overlayObjects: numericOnlyObjects },
      canvasSize: { width: canvas.width, height: canvas.height }
    };
  });

  console.log("W0.0.53 collider-overlay pixel evidence", JSON.stringify(evidence));

  // (c) Baseline / both-off: no overlay objects, no enabled overlay entities, defaults.
  assert.equal(evidence.baseline.overlay.visibleToleranceRange, false, "absent visibleToleranceRange defaults to false");
  assert.equal(evidence.baseline.overlay.visibleColliderRadius, false, "absent visibleColliderRadius defaults to false");
  assert.equal(evidence.baseline.overlay.colliderRadius, 0.12, "absent colliderRadius defaults to 0.12");
  assert.equal(evidence.baseline.overlay.directionToleranceDegrees, 45, "absent directionToleranceDegrees defaults to 45");
  assert.equal(evidence.baseline.overlayObjects, 0, "baseline (absent fields) must have zero overlay scene objects");
  assert.equal(evidence.baseline.overlayEntities, 0, "baseline must have zero enabled overlay entities");

  // Explicit both-false is identical to the absent baseline (zero cost, no pixel shift).
  assert.equal(evidence.explicitOff.overlayObjects, 0, "explicit false must have zero overlay objects");
  assert.ok(evidence.explicitOff.shiftedPixels < 40, `explicit false must draw nothing vs baseline: ${evidence.explicitOff.shiftedPixels} shifted px`);

  // (a) Tolerance range ON: cone fan + marker present, green-shifted, distinct from background.
  assert.equal(evidence.cone.overlay.visibleToleranceRange, true, "cone overlay flag on");
  assert.ok(evidence.cone.fanCount >= 1, `cone fan must be present: ${evidence.cone.fanCount}`);
  assert.ok(evidence.cone.markerCount >= 1, `target-point marker must be present: ${evidence.cone.markerCount}`);
  assert.ok(evidence.cone.shiftedPixels > 150, `cone must render visibly: ${evidence.cone.shiftedPixels} px`);
  assert.ok(evidence.cone.greenExcess > 0, `cone must be green-shifted: greenExcess=${evidence.cone.greenExcess}`);
  assert.ok(evidence.cone.greenExcess > evidence.cone.purpleExcess, `cone must be green, not purple: green=${evidence.cone.greenExcess}, purple=${evidence.cone.purpleExcess}`);
  assert.ok(evidence.cone.firstVisual, "cone fan must carry direction geometry");
  assert.equal(evidence.cone.firstVisual.directionX, 0, "up direction unit vector x=0");
  assert.equal(evidence.cone.firstVisual.directionY, 1, "up direction unit vector y=1");
  assert.equal(evidence.cone.firstVisual.toleranceDegrees, 45, "cone half-angle defaults to 45");
  assert.ok(Math.abs(evidence.cone.firstVisual.innerRadius - (0.375 + 0.12)) < 1e-9, `cone inner radius is the inflated footprint: ${evidence.cone.firstVisual.innerRadius}`);
  assert.ok(evidence.cone.firstVisual.vertexCount > 10, `cone fan must be tessellated: ${evidence.cone.firstVisual.vertexCount} vertices`);
  assert.ok(evidence.cone.layerId !== null, "dedicated collider-overlay layer must exist");

  // (b) Collider radius ON: square present, purple-shifted, a different color than the cone.
  assert.equal(evidence.square.overlay.visibleColliderRadius, true, "square overlay flag on");
  assert.ok(evidence.square.count >= 1, `collider square must be present: ${evidence.square.count}`);
  assert.ok(evidence.square.shiftedPixels > 150, `collider square must render visibly: ${evidence.square.shiftedPixels} px`);
  assert.ok(evidence.square.purpleExcess > 0, `square must be purple-shifted: purpleExcess=${evidence.square.purpleExcess}`);
  assert.ok(evidence.square.purpleExcess > evidence.square.greenExcess, `square must be purple, not green: purple=${evidence.square.purpleExcess}, green=${evidence.square.greenExcess}`);
  assert.ok(Math.abs((evidence.square.halfExtent ?? 0) - (0.375 + 0.12)) < 1e-9, `square half-extent is inflated footprint: ${evidence.square.halfExtent}`);

  // Both ON: both overlays present simultaneously.
  assert.ok(evidence.both.coneCount >= 1 && evidence.both.squareCount >= 1, `both overlays must coexist: cones=${evidence.both.coneCount}, squares=${evidence.both.squareCount}`);
  assert.ok(evidence.both.shiftedPixels > Math.max(evidence.cone.shiftedPixels, evidence.square.shiftedPixels), `both-on must show at least as much shift as either alone: both=${evidence.both.shiftedPixels}`);
  assert.equal(evidence.both.overlay.visibleToleranceRange, true, "both-on cone flag");
  assert.equal(evidence.both.overlay.visibleColliderRadius, true, "both-on square flag");

  // (d) Backward compatibility: numeric fields without booleans keep overlays off and do not break.
  assert.equal(evidence.numericOnly.overlayObjects, 0, "numeric-only frame must have zero overlay objects");
  assert.equal(evidence.numericOnly.overlay.visibleToleranceRange, false, "numeric-only frame keeps cone off");
  assert.equal(evidence.numericOnly.overlay.visibleColliderRadius, false, "numeric-only frame keeps square off");
  assert.equal(evidence.numericOnly.overlay.colliderRadius, 0.2, "numeric colliderRadius is honored in the model summary");
  assert.equal(evidence.numericOnly.overlay.directionToleranceDegrees, 30, "numeric directionToleranceDegrees is honored in the model summary");

  // Zero console noise beyond pinned ReadPixels grammar
  assert.deepEqual(noise, [], `unexpected console noise: ${JSON.stringify(noise)}`);
  console.log("W0.0.53 collider-overlay pixel oracles (cone, square, both, off/idle, backward-compat) all passed.");
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
