// @ts-check
// Normal browser gate: real pinned arrow GLB plus PlayCanvas-generated world glyph pixels, including full Almost texture bounds.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";
import { isExpectedReadPixelsWarning } from "./browser-console-policy.js";

const root = process.cwd();
const brandingRoot = resolve(root, "../aerobeat-branding/icons/web-gameplay");
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const brandingRelative = pathname.startsWith("/branding/") ? pathname.slice(10) : null;
    const base = brandingRelative === null ? root : brandingRoot;
    const relative = brandingRelative ?? (pathname === "/" ? ".testbed/demo/index.html" : pathname.slice(1));
    const file = normalize(join(base, relative));
    if (file !== base && !file.startsWith(`${base}/`)) { response.writeHead(403).end(); return; }
    const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".glb": "model/gltf-binary" };
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Feedback browser server failed");
const url = `http://127.0.0.1:${address.port}/.testbed/demo/index.html`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const noise = [];
  page.on("console", (message) => {
    const location = message.location();
    if (["warning", "error"].includes(message.type()) && !isExpectedReadPixelsWarning(message.type(), message.text(), location.url, location.lineNumber, location.columnNumber, url)) noise.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => noise.push(`pageerror: ${error.message}`));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => globalThis.__AERO_RENDERER_TEST__?.ready === true && globalThis.__AERO_RENDERER_TEST__.renderers[0].describe().gameplayAssets.state === "ready");
  for (const [viewport, width, height] of [["landscape", 844, 390], ["portrait", 390, 844]]) {
    await page.setViewportSize({ width, height });
    const result = await page.evaluate(({ width, height }) => {
      const renderer = globalThis.__AERO_RENDERER_TEST__.renderers[0];
      const canvas = document.querySelector("#primary canvas");
      renderer.resize({ widthCssPx: width, heightCssPx: height, devicePixelRatio: 1 });
      renderer.setEnvironmentVisible(false);
      const target = (judgement, tier) => ({
        id: "three-tier-glb", kind: "flow", hand: "left", family: "flow", cell: 5, cells: [], lane: "left",
        beatCenterMs: 1000, direction: "right", appearanceColor: "#2468AC", judgement, tier,
        ...(judgement === "hit" ? { feedbackProgress: 0 } : { missCommitMs: 1181 }),
      });
      const capture = (judgement, tier, nowMs, boxing = false) => {
        const note = target(judgement, tier);
        if (boxing) { note.kind = "punch"; note.family = "straight"; }
        const rendered = renderer.renderGameplayFrame({ presentation: boxing ? "boxing_spatial_grid" : "flow", nowMs, timingWindowBeforeMs: 180, timingWindowAfterMs: 180, targets: [note] });
        const icon = rendered.model.objects.find((entry) => entry.kind === "icon" && entry.targetId === "three-tier-glb");
        const feedback = rendered.model.objects.find((entry) => entry.kind === "feedback" && entry.targetId === "three-tier-glb");
        const glb = renderer.assetPools.get("directional-arrow/rounded-outline-v1")?.find((entry) => entry.enabled && entry.name === "three-tier-glb:0");
        const glyph = renderer.feedbackPool.find((entry) => entry.root.enabled && entry.root.name === "three-tier-glb:feedback:0");
        const fill = renderer.assetMaterials.get(glb)?.find((entry) => entry.name.includes("tint") || entry.name.includes("fill"));
        const display = new OffscreenCanvas(canvas.width, canvas.height);
        const context = display.getContext("2d", { willReadFrequently: true });
        context.drawImage(canvas, 0, 0);
        const pixels = context.getImageData(0, 0, width, height).data;
        const camera = renderer.cameraEntity.camera;
        const projected = (entity) => { const p = camera.worldToScreen(entity.getPosition()); return { x: p.x, y: p.y }; };
        const glyphScreen = glyph ? projected(glyph.root) : null;
        const glbScreen = glb ? projected(glb) : null;
        const count = (point, radius, predicate) => {
          if (!point) return 0;
          let total = 0;
          for (let y = Math.max(0, Math.floor(point.y - radius)); y < Math.min(height, Math.ceil(point.y + radius)); y++) {
            for (let x = Math.max(0, Math.floor(point.x - radius)); x < Math.min(width, Math.ceil(point.x + radius)); x++) {
              const i = (y * width + x) * 4;
              if (pixels[i + 3] > 0 && predicate(pixels[i], pixels[i + 1], pixels[i + 2])) total++;
            }
          }
          return total;
        };
        const blue = (r, g, b) => b > 95 && b > r * 1.15 && g > r * 1.05 && g > 65;
        const red = (r, g, b) => r > 100 && r > g * 1.25 && r > b * 1.25;
        const white = (r, g, b) => r > 155 && g > 155 && b > 155 && Math.max(r, g, b) - Math.min(r, g, b) < 65;
        const gray = (r, g, b) => r > 30 && r < 145 && Math.max(r, g, b) - Math.min(r, g, b) < 22;
        const yellow = (r, g, b) => r > 120 && g > 100 && b < g * .7 && r > b * 1.5;
        const texture = glyph?.quad?.render?.meshInstances?.[0]?.material?.diffuseMap;
        const texturePixels = texture?.lock();
        const faceColumns = [];
        const faceSignatures = [];
        if (texturePixels) for (let x = 0; x < texture.width; x++) {
          let found = false;
          let signature = "";
          for (let y = 0; y < texture.height; y++) {
            const i = (y * texture.width + x) * 4;
            const face = Boolean(texturePixels[i + 3] && yellow(texturePixels[i], texturePixels[i + 1], texturePixels[i + 2]));
            signature += face ? "1" : "0";
            if (face) found = true;
          }
          if (found) faceColumns.push(x);
          faceSignatures[x] = signature;
        }
        if (texturePixels) texture.unlock();
        const groups = faceColumns.filter((x, index) => index === 0 || x > faceColumns[index - 1] + 1);
        const letters = groups.map((start, index) => faceSignatures.slice(start, (groups[index + 1] ?? texture.width) - 2).join("|"));
        return {
          ready: renderer.describe().gameplayAssets.state, fallback: renderer.describe().sceneVisuals.fallbackInstanceCount,
          icon: { state: icon?.state, tint: icon?.appearanceColor, asset: icon?.assetId, screen: glbScreen, fill: fill ? [fill.material.diffuse.r, fill.material.diffuse.g, fill.material.diffuse.b] : null },
          feedback: { text: feedback?.feedback?.text, face: feedback?.feedback?.faceColor, position: feedback?.position, screen: glyphScreen, texture: texture?.name, quadAspect: glyph?.quad?.getLocalScale().x / glyph?.quad?.getLocalScale().z },
          textureFace: { width: texture?.width, height: texture?.height, first: faceColumns[0], last: faceColumns.at(-1), groups: groups.length, distinctLetters: new Set(letters).size },
          glyphPixels: { blue: count(glyphScreen, 25, blue), red: count(glyphScreen, 25, red), white: count(glyphScreen, 25, white), yellow: count(glyphScreen, 65, yellow) },
          iconPixels: { blue: count(glbScreen, 28, blue), gray: count(glbScreen, 28, gray) },
        };
      };
      return { almost: capture("miss", "almost", 1200), boxerGood: capture("miss", "good", 1200, true), great: capture("hit", "great", 1000), miss: capture("miss", "miss", 1200) };
    }, { width, height });
    for (const [state, sample] of Object.entries(result)) {
      assert.equal(sample.ready, "ready", `${viewport}/${state}: real pinned GLBs ready`);
      assert.equal(sample.fallback, 0, `${viewport}/${state}: no primitive fallback`);
      assert.equal(sample.icon.asset, "directional-arrow/rounded-outline-v1", `${viewport}/${state}: real arrow GLB`);
      assert.ok(sample.icon.fill, `${viewport}/${state}: real tintable GLB material`);
      assert.ok(sample.icon.screen && sample.feedback.screen, `${viewport}/${state}: both objects project into viewport`);
      assert.ok(sample.icon.screen.x > 0 && sample.icon.screen.x < width && sample.feedback.screen.x > 0 && sample.feedback.screen.x < width, `${viewport}/${state}: objects lie in viewport`);
      assert.ok(sample.feedback.texture?.startsWith("aero-feedback-"), `${viewport}/${state}: facade uses generated glyph texture`);
    }
    const near = result.almost;
    assert.equal(near.icon.state, "miss", `${viewport}: no fabricated hit or slice`);
    assert.equal(near.icon.tint, "#2468AC", `${viewport}: intact icon keeps authored color`);
    assert.equal(near.feedback.text, "Almost");
    assert.equal(near.feedback.face, "#facc15");
    assert.equal(near.feedback.texture, "aero-feedback-almost");
    assert.deepEqual(near.feedback.position, { x: -.5, y: 1, z: 0 });
    assert.equal(near.textureFace.groups, 6, `${viewport}: all six letter faces: ${JSON.stringify(near)}`);
    assert.equal(near.textureFace.distinctLetters, 6, `${viewport}: no missing glyph rendered as repeated '?' fallback`);
    assert.ok(near.textureFace.first > 0 && near.textureFace.last < near.textureFace.width - 1, `${viewport}: yellow word fully inside texture`);
    assert.ok(Math.abs(near.feedback.quadAspect - near.textureFace.width / near.textureFace.height) < .01, `${viewport}: world quad matches texture aspect`);
    assert.ok(near.glyphPixels.yellow > 100, `${viewport}: yellow glyph pixels visible: ${JSON.stringify(near)}`);
    assert.ok(near.iconPixels.blue > 100, `${viewport}: authored real GLB remains visible: ${JSON.stringify(near)}`);
    const boxer = result.boxerGood;
    assert.equal(boxer.icon.state, "miss", `${viewport}: Boxing near note remains unsliced`);
    assert.equal(boxer.icon.tint, "#2468AC", `${viewport}: Boxing near note remains tinted`);
    assert.equal(boxer.feedback.text, "Good", `${viewport}: Boxing miss/good label remains Good`);
    assert.equal(boxer.feedback.face, "#6ec6ff", `${viewport}: Boxing miss/good label remains blue`);
    assert.equal(boxer.feedback.texture, "aero-feedback-good");
    assert.deepEqual(boxer.feedback.position, { x: -.5, y: 1, z: 0 });
    assert.ok(boxer.glyphPixels.blue > 100, `${viewport}: blue Boxing Good glyph pixels visible: ${JSON.stringify(boxer)}`);
    assert.ok(boxer.iconPixels.blue > 100, `${viewport}: real Boxing GLB authored blue fill visible`);
    assert.equal(result.great.icon.state, "hit");
    assert.equal(result.great.feedback.text, "Great");
    assert.equal(result.great.feedback.face, "#ffffff");
    assert.equal(result.great.feedback.texture, "aero-feedback-great");
    assert.ok(result.great.glyphPixels.white > 100, `${viewport}: Great white pixels visible: ${JSON.stringify(result.great)}`);
    assert.equal(result.miss.icon.tint, "#2a3038");
    assert.equal(result.miss.feedback.text, "Miss");
    assert.equal(result.miss.feedback.face, "#e5484d");
    assert.equal(result.miss.feedback.texture, "aero-feedback-miss");
    assert.deepEqual(result.miss.feedback.position, { x: -1.5, y: 1.5, z: 1.5 });
    assert.ok(result.miss.glyphPixels.red > 100, `${viewport}: Miss red pixels visible: ${JSON.stringify(result.miss)}`);
    assert.ok(result.miss.iconPixels.gray > 100, `${viewport}: Miss gray real GLB visible: ${JSON.stringify(result.miss)}`);
    console.log(`${viewport} real-GLB feedback pixels: Almost yellow=${near.glyphPixels.yellow}, Great white=${result.great.glyphPixels.white}, Miss red=${result.miss.glyphPixels.red}; icon Almost blue=${near.iconPixels.blue}, Miss gray=${result.miss.iconPixels.gray}`);
  }
  assert.deepEqual(noise, [], "browser console clean");
  console.log("Three-tier real GLB feedback pixel validation passed in landscape and portrait.");
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
