// @ts-check

import { compactRendererVisualProfile, createAeroWebGl2Renderer, gameplayIconIds, rasterizeBrandingIconAtlas } from "../../src/index.js";

const surfaces = [...document.querySelectorAll(".surface")];
const canvases = [...document.querySelectorAll("canvas")];
const status = document.querySelector("#status");
const renderers = canvases.map((canvas) => {
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Testbed canvas is missing");
  const renderer = createAeroWebGl2Renderer(); renderer.attach(canvas); return renderer;
});
const fallbackManifest = { schemaId: "aerobeat.branding.web-gameplay-icons.v1", schemaVersion: 1, colorContract: "currentColor", webglContract: "alpha-mask-atlas-input", assets: gameplayIconIds.map((id) => ({ id, file: `${id.replaceAll(".", "-")}.svg`, viewBox: id.includes("guard") ? "0 0 48 24" : "0 0 64 64" })) };
const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="currentColor" d="M8 28h22V12l26 20-26 20V36H8z"/></svg>`;
let manifest = fallbackManifest;
let brandingBase = "";
try {
  const response = await fetch("/branding/manifest.json");
  if (response.ok) { manifest = await response.json(); brandingBase = "/branding/"; }
} catch {}
const atlas = await rasterizeBrandingIconAtlas(manifest, { resolveUrl: (asset) => brandingBase ? `${brandingBase}${asset.file}` : `data:image/svg+xml,${encodeURIComponent(fallbackSvg)}` });
renderers[0].uploadIconAtlas(atlas); renderers[1].uploadIconAtlas(atlas);

function draw() {
  renderers.forEach((renderer, index) => {
    const surface = surfaces[index]; renderer.resize({ widthCssPx: surface.clientWidth, heightCssPx: surface.clientHeight, devicePixelRatio: window.devicePixelRatio });
  });
  const targets = [
    { id:"straight",kind:"punch",hand:"left",family:"straight",cell:5,cells:[],lane:"left",beatCenterMs:1000 },
    { id:"hook",kind:"punch",hand:"right",family:"hook",cell:6,cells:[],lane:"right",beatCenterMs:1000 },
    { id:"guard-standard",kind:"guard",hand:"both",family:"guard",cell:null,cells:[1,2],lane:null,beatCenterMs:1000 },
    { id:"guard",kind:"guard",hand:"both",family:"crossed_guard",cell:null,cells:[8,9],lane:null,beatCenterMs:1000 }
  ];
  const primary = renderers[0].renderGameplayFrame({ presentation:"boxing_spatial_grid",nowMs:650,targets,blockedCells:[0,3],safeCells:[10],overlay:"none" });
  const secondary = renderers[1].renderGameplayFrame({ presentation:"boxing_lanes",nowMs:1000,targets:targets.slice(0,2),timingWindowBeforeMs:180,timingWindowAfterMs:180,overlay:"calibrating",calibrationDim:0.18,countdown:3 });
  const snapshot = { ready:true, primary:primary.status, secondary:secondary.status, primaryCommands:primary.plan.commands.length, secondaryCommands:secondary.plan.commands.length, primaryGrid:primary.plan.grid, secondaryGrid:secondary.plan.grid, primaryTargetRects:primary.plan.commands.filter((entry) => entry.targetId !== null).map((entry) => entry.rect), secondaryTargetRects:secondary.plan.commands.filter((entry) => entry.targetId !== null).map((entry) => entry.rect), secondaryTargetRect:secondary.plan.commands.find((entry) => entry.targetId === "straight" && entry.kind === "icon")?.rect ?? null };
  if (status) status.textContent = JSON.stringify(snapshot, null, 2);
  globalThis.__AERO_RENDERER_TEST__ = { ...snapshot, resize: draw, renderers, compactRendererVisualProfile };
}
draw();
