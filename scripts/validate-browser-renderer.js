// @ts-check

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const brandingRoot = resolve(root, "../aerobeat-branding/icons/web-gameplay");
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const brandingRelative = pathname.startsWith("/branding/") ? pathname.slice("/branding/".length) : null;
    const relative = pathname === "/" ? ".testbed/demo/index.html" : pathname.slice(1);
    const file = brandingRelative === null ? normalize(join(root, relative)) : normalize(join(brandingRoot, brandingRelative === "manifest.json" ? "manifest.json" : brandingRelative));
    const allowedRoot = brandingRelative === null ? root : brandingRoot;
    if (!file.startsWith(allowedRoot)) { response.writeHead(403).end(); return; }
    const content = await readFile(file);
    const types = { ".html":"text/html", ".js":"text/javascript", ".json":"application/json", ".svg":"image/svg+xml" };
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control":"no-store" }); response.end(content);
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Browser test server failed");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 760 }, deviceScaleFactor: 1.5 });
  const noise = [];
  page.on("console", (message) => {
    const text = message.text();
    const chromiumDriverNoise = message.type() === "warning" && text.includes("GL Driver Message") && text.includes("GPU stall due to ReadPixels");
    if (!chromiumDriverNoise && (message.type() === "warning" || message.type() === "error")) noise.push(`${message.type()}: ${text}`);
  });
  page.on("pageerror", (error) => noise.push(`pageerror: ${error.message}`));
  await page.goto(`http://127.0.0.1:${address.port}/.testbed/demo/index.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => globalThis.__AERO_RENDERER_TEST__?.ready === true);
  const initial = await page.evaluate(() => ({
    test: globalThis.__AERO_RENDERER_TEST__,
    sizes: [...document.querySelectorAll("canvas")].map((entry) => ({ width: entry.width, height: entry.height, cssWidth: entry.style.width, cssHeight: entry.style.height }))
  }));
  assert.equal(initial.test.primary.state, "running"); assert.equal(initial.test.secondary.state, "running");
  assert.equal(initial.test.primary.iconAtlasReady, true); assert.equal(initial.test.secondary.iconAtlasReady, true);
  assert.ok(initial.test.primaryCommands >= 20); assert.ok(initial.test.secondaryCommands >= 8);
  assert.notEqual(initial.sizes[0].width, initial.sizes[1].width);
  await page.setViewportSize({ width: 620, height: 900 });
  await page.evaluate(() => globalThis.__AERO_RENDERER_TEST__.resize());
  const resized = await page.evaluate(() => [...document.querySelectorAll("canvas")].map((entry) => ({ width: entry.width, height: entry.height })));
  assert.notEqual(resized[0].width, initial.sizes[0].width);
  const contextResult = await page.evaluate(async () => {
    const renderer = globalThis.__AERO_RENDERER_TEST__.renderers[0];
    const canvas = document.querySelector("canvas");
    const gl = canvas.getContext("webgl2"); const extension = gl.getExtension("WEBGL_lose_context");
    if (!extension) return { supported:false, state:renderer.describe().state };
    extension.loseContext(); await new Promise((resolve) => setTimeout(resolve, 40)); const lost = renderer.describe().state;
    extension.restoreContext(); await new Promise((resolve) => setTimeout(resolve, 100)); return { supported:true,lost,restored:renderer.describe().state,atlas:renderer.describe().iconAtlasReady };
  });
  if (contextResult.supported) { assert.equal(contextResult.lost, "context_lost"); assert.equal(contextResult.restored, "ready"); assert.equal(contextResult.atlas, true); }
  await page.evaluate(() => globalThis.__AERO_RENDERER_TEST__.resize());
  await mkdir(join(root, "screenshots"), { recursive: true });
  await page.screenshot({ path: join(root, "screenshots/task8-renderer-chromium.png"), fullPage: true });
  assert.deepEqual(noise, []);
  console.log(`Chromium renderer visual/resize/context/multi-instance validation passed at http://127.0.0.1:${address.port}/.testbed/demo/index.html`);
  console.log(`Visual evidence: ${join(root, "screenshots/task8-renderer-chromium.png")}`);
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
