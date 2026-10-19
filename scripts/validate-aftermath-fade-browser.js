// @ts-check
// Genuine native-GLB framebuffer regression for per-mode aftermath timers.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const file = normalize(join(root, pathname === "/" ? ".testbed/demo/index.html" : pathname.slice(1)));
    if (!file.startsWith(`${root}/`)) { response.writeHead(403).end(); return; }
    const content = await readFile(file);
    response.writeHead(200, { "content-type": ({ ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".glb": "model/gltf-binary", ".jpg": "image/jpeg" })[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    response.end(content);
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Browser server failed");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/.testbed/demo/index.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => globalThis.__AERO_RENDERER_TEST__?.ready === true && globalThis.__AERO_RENDERER_TEST__.renderers[0].describe().gameplayAssets.state === "ready");
  const evidence = await page.evaluate(() => {
    const renderer = globalThis.__AERO_RENDERER_TEST__.renderers[0];
    const canvas = document.querySelector("#primary canvas");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Renderer canvas missing");
    renderer.resize({ widthCssPx: 844, heightCssPx: 390, deviceScaleFactor: 1 });
    renderer.setEnvironmentVisible(false);
    renderer.setBackgroundProjection({ kind: "solid", colors: ["#102030"], angleDeg: 180 });
    const readPixels = () => {
      const out = new OffscreenCanvas(canvas.width, canvas.height);
      const ctx = out.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(canvas, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const distance = (a, b) => {
      let total = 0;
      for (let i = 0; i < a.length; i += 4) total += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      return total;
    };
    const config = { flow: { enabled: true, delayMs: 100, durationMs: 200 }, boxing: { enabled: true, delayMs: 100, durationMs: 200 } };
    const off = { flow: { ...config.flow, enabled: false }, boxing: { ...config.boxing, enabled: false } };
    const zero = { flow: { enabled: true, delayMs: 100, durationMs: 0 }, boxing: { enabled: true, delayMs: 100, durationMs: 0 } };
    const familyCases = [
      ["flow", "flow", "slice", "left", "arrow", "up", 2],
      ["punch", "boxing_spatial_grid", "straight", "left", "arrow", "up", 1],
      ["guard", "boxing_spatial_grid", "bonk", "both", undefined, undefined, 2]
    ];
    const result = [];
    for (const [family, presentation, mode, hand, shape, direction, count] of familyCases) {
      const entry = { targetId: `fade-${family}`, hitCommitMs: 1000, family, hand, mode, spawn: { x: 0, y: 1, z: 0 }, seed: 42, evictedAtMs: 1020, ...(shape ? { shape, direction } : {}) };
      const frame = (nowMs, aftermathFadeByMode) => ({ presentation, nowMs, targets: [], aftermath: [entry], aftermathFadeByMode });
      const capture = (nowMs, setting) => {
        renderer.renderGameplayFrame(frame(nowMs, setting));
        const objects = renderer.lastModel.objects.filter((object) => object.kind === "aftermath");
        const pool = renderer.aftermathAssetPools.get(objects[0]?.assetId) ?? [];
        return { pixels: readPixels(), alpha: objects.map((object) => object.alpha), asset: objects[0]?.assetId, nativeRoots: pool.filter((entity) => entity.enabled).length };
      };
      const hidden = capture(1300, config);
      const opaque = capture(1100, config);
      const partial = capture(1200, config);
      const legacy = capture(1100, off);
      const immediate = capture(1100, zero);
      result.push({ family, expectedCount: count, opaque: opaque.alpha, partial: partial.alpha, legacy: legacy.alpha, nativeRoots: opaque.nativeRoots, asset: opaque.asset, opacityPixels: distance(opaque.pixels, hidden.pixels), partialPixels: distance(partial.pixels, hidden.pixels), zeroPixels: distance(immediate.pixels, hidden.pixels) });
    }
    return result;
  });
  for (const row of evidence) {
    assert.equal(row.opaque.length, row.expectedCount, `${row.family}: expected complete native corpses`);
    assert.equal(row.nativeRoots, row.expectedCount, `${row.family}: native asset roots active`);
    assert.ok(row.asset && !row.asset.includes("fallback"), `${row.family}: native GLB asset selected`);
    assert.ok(row.opaque.every((alpha) => alpha === 1), `${row.family}: opaque through delay despite eviction`);
    assert.ok(row.partial.every((alpha) => alpha === 0.5), `${row.family}: linear midpoint alpha`);
    assert.ok(row.legacy.every((alpha) => alpha < 1), `${row.family}: legacy eviction still fades when OFF`);
    assert.ok(row.opacityPixels > 500, `${row.family}: actual GLB changes framebuffer`);
    assert.ok(row.partialPixels > 100 && row.partialPixels < row.opacityPixels, `${row.family}: partial alpha visibly fades native GLB pixels`);
    assert.equal(row.zeroPixels, 0, `${row.family}: duration zero disappears at delay`);
  }
  assert.deepEqual(errors, []);
  console.log("Native GLB aftermath Flow halves, Boxing punch and guard pair: timer OFF/ON, partial alpha, zero duration and framebuffer pixels passed", evidence.map(({ family, opacityPixels, partialPixels }) => ({ family, opacityPixels, partialPixels })));
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
