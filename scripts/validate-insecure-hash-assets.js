// @ts-check

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const gameplayAssetIds = ["any-note/circle-v1", "athlete-marker/sphere-v1", "bomb/urchin-v1", "directional-arrow/outline-v1", "guard/shield-v1", "track/blue-glass-v1", "wall/red-glass-v1"];
const gameplayInventorySha256 = "69b88d38113a56061dfc0ea5e92ec51a0b181fcade6a99e1dcc5df1baecdde03";
const gameplayProofSha256 = "287adc43a0456782044f0fd7601efd7b5087342972d9da4525923598754b1efc";
const environmentRoot = resolve(root, "../aerobeat-environment-community");
const brandingRoot = resolve(root, "../aerobeat-branding/icons/web-gameplay");
const catalog = JSON.parse(await readFile(resolve(environmentRoot, ".testbed/assets/images/photosphere-catalog.json"), "utf8"));
assert.equal(catalog.entryCount, 8);
const descriptors = catalog.entries.map((entry) => Object.freeze({
  id: entry.id,
  url: `/owned-environments/${entry.id}.jpg`,
  mimeType: "image/jpeg",
  bytes: entry.image.bytes,
  sha256: entry.image.sha256,
  projection: "equirectangular",
  dimensions: [4096, 2048],
  centerForward: [0, 0, -1],
  worldUp: [0, 1, 0]
}));
const environmentFiles = new Map(catalog.entries.map((entry) => [
  `/owned-environments/${entry.id}.jpg`,
  resolve(environmentRoot, entry.image.path)
]));

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://invalid").pathname;
    let file;
    let allowedRoot;
    if (environmentFiles.has(pathname)) {
      file = environmentFiles.get(pathname);
      allowedRoot = environmentRoot;
    } else if (pathname.startsWith("/branding/")) {
      file = normalize(join(brandingRoot, pathname.slice(10)));
      allowedRoot = brandingRoot;
    } else {
      const relative = pathname === "/" ? ".testbed/demo/index.html" : pathname.slice(1);
      file = normalize(join(root, relative));
      allowedRoot = root;
    }
    if (file !== allowedRoot && !file.startsWith(`${allowedRoot}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    const content = await readFile(file);
    const contentTypes = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".jpg": "image/jpeg" };
    response.writeHead(200, { "content-type": contentTypes[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    response.end(content);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolveReady, reject) => {
  server.once("error", reject);
  server.listen(0, "0.0.0.0", resolveReady);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Hash asset browser server did not bind");
const interfaces = Object.values(networkInterfaces()).flat().filter(Boolean)
  .filter((entry) => entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("127."));
const nonLoopback = interfaces.find((entry) => entry.address.startsWith("100.")) ?? interfaces[0];
assert.ok(nonLoopback, "A genuine non-loopback IPv4 interface is required");

const browser = await chromium.launch({ headless: true });
try {
  const run = async (origin, expectedSecure) => {
    const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
    const noise = [];
    page.on("console", (message) => {
      if (["warning", "error"].includes(message.type()) && !message.text().includes("GPU stall due to ReadPixels")) noise.push(`console:${message.type()}:${message.text()}`);
    });
    page.on("pageerror", (error) => noise.push(`pageerror:${error.message}`));
    page.on("response", (response) => { if (!response.ok()) noise.push(`http:${response.status()}:${response.url()}`); });
    await page.goto(`${origin}/.testbed/demo/index.html`, { waitUntil: "networkidle" });
    const context = await page.evaluate(() => ({ isSecureContext, subtleType: typeof globalThis.crypto?.subtle, hostname: location.hostname }));
    assert.equal(context.isSecureContext, expectedSecure);
    assert.equal(context.subtleType, expectedSecure ? "object" : "undefined");
    if (!expectedSecure) {
      assert.notEqual(context.hostname, "localhost");
      assert.equal(context.hostname.startsWith("127."), false);
    }
    await page.waitForFunction(() => globalThis.__AERO_RENDERER_TEST__?.ready === true);
    await page.waitForFunction(() => globalThis.__AERO_RENDERER_TEST__.renderers.every((renderer) => renderer.describe().gameplayAssets.state === "ready"));
    const gameplay = await page.evaluate(() => globalThis.__AERO_RENDERER_TEST__.renderers.map((renderer) => renderer.describe().gameplayAssets));
    assert.ok(gameplay.every((status) => status.ready && !status.fallback && status.assetCount === 7 && status.loadedAssetIds.length === 7));
    for (const status of gameplay) {
      assert.deepEqual(status.loadedAssetIds, gameplayAssetIds);
      assert.equal(status.inventorySha256, gameplayInventorySha256);
      assert.equal(status.proofSha256, gameplayProofSha256);
    }

    const parity = await page.evaluate(async (secure) => {
      const { sha256Hex } = await import("/node_modules/@aerobeat/web-hash/src/index.js");
      const bytes = new Uint8Array([0, 128, 255, 1, 2, 3]);
      const auto = await sha256Hex(bytes);
      const fallback = await sha256Hex(bytes, { backend: "fallback" });
      let native = null;
      let nativeRejected = false;
      try { native = await sha256Hex(bytes, { backend: "native" }); } catch { nativeRejected = true; }
      return { secure, auto, fallback, native, nativeRejected };
    }, expectedSecure);
    assert.equal(parity.auto, parity.fallback);
    if (expectedSecure) assert.equal(parity.native, parity.fallback);
    else assert.equal(parity.nativeRejected, true);

    const environments = await page.evaluate(async (entries) => {
      const renderer = globalThis.__AERO_RENDERER_TEST__.renderers[0];
      const results = [];
      let previousRoot = null;
      for (const descriptor of entries) {
        let previousDestroyCount = null;
        if (previousRoot) {
          previousDestroyCount = { value: 0 };
          const destroy = previousRoot.destroy.bind(previousRoot);
          previousRoot.destroy = () => { previousDestroyCount.value += 1; return destroy(); };
        }
        renderer.setEnvironmentAsset(descriptor);
        await renderer.environmentLoadPromise;
        const status = renderer.describe().environment;
        results.push({ status, previousDestroyCount: previousDestroyCount?.value ?? 0 });
        previousRoot = renderer.environmentOwner.record?.root ?? null;
      }
      return results;
    }, descriptors);
    assert.equal(environments.length, 8);
    environments.forEach((entry, index) => {
      assert.deepEqual(entry.status, { id: descriptors[index].id, state: "ready", visible: true, fallback: false, hash: descriptors[index].sha256, count: 1, projection: "equirectangular" });
      assert.equal(entry.previousDestroyCount, index === 0 ? 0 : 1, "environment replacement must dispose the prior resident exactly once");
    });

    const lifecycle = await page.evaluate(async () => {
      const renderer = globalThis.__AERO_RENDERER_TEST__.renderers[0];
      const canvas = document.querySelector("#primary canvas");
      const before = renderer.describe();
      const generationBefore = renderer.gameplayAssetLoader.generation;
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
      const lost = renderer.describe();
      canvas.dispatchEvent(new Event("webglcontextrestored"));
      await Promise.all([renderer.gameplayAssetLoadPromise, renderer.environmentLoadPromise]);
      const restored = renderer.describe();
      const generationRestored = renderer.gameplayAssetLoader.generation;
      renderer.detach();
      const detached = renderer.describe();
      renderer.attach(canvas);
      renderer.resize({ widthCssPx: 320, heightCssPx: 180, devicePixelRatio: 1 });
      await Promise.all([renderer.gameplayAssetLoadPromise, renderer.environmentLoadPromise]);
      const reattached = renderer.describe();
      return { before, lost, restored, detached, reattached, generationBefore, generationRestored };
    });
    assert.equal(lifecycle.before.gameplayAssets.state, "ready");
    assert.equal(lifecycle.before.environment.state, "ready");
    assert.equal(lifecycle.lost.gameplayAssets.state, "fallback");
    assert.equal(lifecycle.lost.environment.state, "idle");
    assert.equal(lifecycle.restored.gameplayAssets.state, "ready");
    assert.equal(lifecycle.restored.gameplayAssets.loadedAssetIds.length, 7);
    assert.equal(lifecycle.restored.environment.state, "ready");
    assert.equal(lifecycle.restored.environment.count, 1);
    assert.ok(lifecycle.generationRestored > lifecycle.generationBefore);
    assert.equal(lifecycle.detached.gameplayAssets.state, "disposed");
    assert.equal(lifecycle.detached.environment.state, "disposed");
    assert.equal(lifecycle.reattached.gameplayAssets.state, "ready");
    assert.equal(lifecycle.reattached.environment.state, "ready");

    const corruption = await page.evaluate(async (descriptor) => {
      const Renderer = globalThis.__AERO_RENDERER_TEST__.renderers[0].constructor;
      const makeCanvas = () => { const canvas = document.createElement("canvas"); document.body.append(canvas); return canvas; };
      const glbCanvas = makeCanvas();
      const glb = new Renderer({ fetch: async (url, options) => {
        const response = await fetch(url, options);
        if (String(url).endsWith(".glb")) {
          const bytes = new Uint8Array(await response.arrayBuffer());
          bytes[0] ^= 1;
          return new Response(bytes, { status: 200, headers: { "content-type": "model/gltf-binary" } });
        }
        return response;
      } });
      glb.attach(glbCanvas);
      await glb.gameplayAssetLoadPromise;
      const glbStatus = glb.describe().gameplayAssets;
      const jpegCanvas = makeCanvas();
      const jpeg = new Renderer({ fetch: async (url, options) => {
        const response = await fetch(url, options);
        if (String(url).includes("owned-environments")) {
          const bytes = new Uint8Array(await response.arrayBuffer());
          bytes[bytes.length - 1] ^= 1;
          return new Response(bytes, { status: 200, headers: { "content-type": "image/jpeg" } });
        }
        return response;
      } });
      jpeg.attach(jpegCanvas);
      await jpeg.gameplayAssetLoadPromise;
      jpeg.setEnvironmentAsset(descriptor);
      await jpeg.environmentLoadPromise;
      const jpegStatus = jpeg.describe().environment;
      glb.destroy(); jpeg.destroy(); glbCanvas.remove(); jpegCanvas.remove();
      return { glbStatus, jpegStatus };
    }, descriptors[0]);
    assert.equal(corruption.glbStatus.state, "error");
    assert.equal(corruption.glbStatus.ready, false);
    assert.equal(corruption.glbStatus.loadedAssetIds.length, 0);
    assert.match(corruption.glbStatus.errorMessage, /hash mismatch/);
    assert.deepEqual(corruption.jpegStatus, { id: descriptors[0].id, state: "error", visible: true, fallback: true, hash: descriptors[0].sha256, count: 0, projection: "equirectangular" });
    assert.deepEqual(noise, []);
    await page.close();
    return { context, gameplay, environments: environments.map((entry) => entry.status), lifecycle: { restored: lifecycle.restored, reattached: lifecycle.reattached } };
  };

  const secure = await run(`http://localhost:${address.port}`, true);
  const insecure = await run(`http://${nonLoopback.address}:${address.port}`, false);
  console.log(JSON.stringify({ secure: { context: secure.context, glbs: secure.gameplay[0].loadedAssetIds.length, environments: secure.environments.length }, insecure: { context: insecure.context, glbs: insecure.gameplay[0].loadedAssetIds.length, environments: insecure.environments.length }, corruption: "PASS", lifecycle: "PASS" }));
} finally {
  const cleanup = await Promise.allSettled([
    browser.close(),
    new Promise((resolveClosed, reject) => server.close((error) => error ? reject(error) : resolveClosed()))
  ]);
  const failure = cleanup.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}
