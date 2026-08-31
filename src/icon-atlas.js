// @ts-check

import { gameplayIconIds } from "./gameplay-plan.js";

/** @typedef {{id:string,file:string,viewBox:string}} AeroBrandingIconAsset */
/** @typedef {{schemaId:string,schemaVersion:number,colorContract:string,webglContract:string,assets:readonly AeroBrandingIconAsset[]}} AeroBrandingIconManifest */
/** @typedef {{id:string,u0:number,v0:number,u1:number,v1:number}} AeroIconAtlasEntry */
/** @typedef {{width:number,height:number,pixels:Uint8Array,entries:readonly AeroIconAtlasEntry[]}} AeroIconAtlasData */

/**
 * Validate the normalized branding manifest and retain only stable semantic metadata.
 *
 * @param {unknown} value
 * @returns {AeroBrandingIconManifest}
 */
export function normalizeBrandingIconManifest(value) {
  if (!isRecord(value) || value.schemaId !== "aerobeat.branding.web-gameplay-icons.v1" || value.schemaVersion !== 1 || value.colorContract !== "currentColor" || value.webglContract !== "alpha-mask-atlas-input" || !Array.isArray(value.assets)) {
    throw new TypeError("Branding icon manifest is incompatible");
  }
  /** @type {AeroBrandingIconAsset[]} */
  const assets = [];
  const seen = new Set();
  for (const raw of value.assets) {
    if (!isRecord(raw) || typeof raw.id !== "string" || !gameplayIconIds.includes(raw.id) || seen.has(raw.id) || typeof raw.file !== "string" || !/^[a-z0-9-]+\.svg$/u.test(raw.file) || raw.viewBox !== expectedViewBox(raw.id)) {
      throw new TypeError("Branding icon asset is invalid");
    }
    seen.add(raw.id);
    assets.push(Object.freeze({ id: raw.id, file: raw.file, viewBox: String(raw.viewBox) }));
  }
  if (assets.length !== gameplayIconIds.length || gameplayIconIds.some((id) => !seen.has(id))) {
    throw new TypeError("Branding icon manifest does not contain the expected semantic set");
  }
  return Object.freeze({ schemaId: value.schemaId, schemaVersion: 1, colorContract: value.colorContract, webglContract: value.webglContract, assets: Object.freeze(assets) });
}

/**
 * Narrow atlas bytes and UV metadata before they become private GPU state.
 * Every semantic icon is required; malformed or colored RGB inputs degrade to shapes.
 *
 * @param {unknown} value
 * @returns {AeroIconAtlasData}
 */
export function normalizeIconAtlasData(value) {
  if (!isRecord(value) || !Number.isInteger(value.width) || !Number.isInteger(value.height) || Number(value.width) <= 0 || Number(value.height) <= 0 || Number(value.width) > 4096 || Number(value.height) > 4096 || !(value.pixels instanceof Uint8Array) || !Array.isArray(value.entries)) {
    throw new TypeError("Icon atlas data is invalid");
  }
  const width = Number(value.width);
  const height = Number(value.height);
  if (value.pixels.length !== width * height * 4) throw new TypeError("Icon atlas pixel length is invalid");
  for (let index = 0; index < value.pixels.length; index += 4) {
    if (value.pixels[index] !== 255 || value.pixels[index + 1] !== 255 || value.pixels[index + 2] !== 255) throw new TypeError("Icon atlas RGB must be normalized white");
  }
  /** @type {AeroIconAtlasEntry[]} */
  const entries = [];
  const seen = new Set();
  for (const raw of value.entries) {
    if (!isRecord(raw) || typeof raw.id !== "string" || !gameplayIconIds.includes(raw.id) || seen.has(raw.id) || ![raw.u0, raw.v0, raw.u1, raw.v1].every((entry) => typeof entry === "number" && Number.isFinite(entry) && entry >= 0 && entry <= 1) || Number(raw.u0) >= Number(raw.u1) || Number(raw.v0) >= Number(raw.v1)) {
      throw new TypeError("Icon atlas entry is invalid");
    }
    seen.add(raw.id);
    entries.push(Object.freeze({ id: raw.id, u0: Number(raw.u0), v0: Number(raw.v0), u1: Number(raw.u1), v1: Number(raw.v1) }));
  }
  if (entries.length !== gameplayIconIds.length || gameplayIconIds.some((id) => !seen.has(id))) throw new TypeError("Icon atlas does not contain the expected semantic set");
  return Object.freeze({ width, height, pixels: value.pixels.slice(), entries: Object.freeze(entries) });
}

/**
 * Rasterize currentColor SVG masters to one RGBA atlas. The renderer samples alpha
 * only; source RGB never controls gameplay role color.
 *
 * @param {unknown} manifestValue
 * @param {{resolveUrl:(asset:AeroBrandingIconAsset)=>string,fetch?:typeof fetch,createCanvas?:(width:number,height:number)=>HTMLCanvasElement|OffscreenCanvas,createBitmap?:(blob:Blob)=>Promise<ImageBitmap>,cellSize?:number,signal?:AbortSignal}} options
 * @returns {Promise<AeroIconAtlasData>}
 */
export async function rasterizeBrandingIconAtlas(manifestValue, options) {
  const manifest = normalizeBrandingIconManifest(manifestValue);
  const cellSize = Number.isInteger(options.cellSize) ? Math.max(256, Math.min(512, Number(options.cellSize))) : 256;
  const columns = 4;
  const rows = Math.ceil(manifest.assets.length / columns);
  const width = columns * cellSize;
  const height = rows * cellSize;
  const canvas = options.createCanvas?.(width, height) ?? createCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || !("drawImage" in context) || !("getImageData" in context)) throw new Error("2D canvas is unavailable for icon atlas rasterization");
  context.clearRect(0, 0, width, height);
  const fetcher = options.fetch ?? globalThis.fetch;
  const bitmapFactory = options.createBitmap ?? globalThis.createImageBitmap;
  if (typeof fetcher !== "function" || typeof bitmapFactory !== "function") throw new Error("Icon atlas rasterization APIs are unavailable");
  /** @type {AeroIconAtlasEntry[]} */
  const entries = [];
  for (let index = 0; index < manifest.assets.length; index += 1) {
    throwIfAborted(options.signal);
    const asset = manifest.assets[index];
    const response = await fetcher(options.resolveUrl(asset), { signal: options.signal });
    throwIfAborted(options.signal);
    if (!response.ok) throw new Error(`Icon fetch failed for ${asset.id}: ${response.status}`);
    const blob = await response.blob();
    throwIfAborted(options.signal);
    const bitmap = await decodeSvgBlob(blob, bitmapFactory);
    try {
      throwIfAborted(options.signal);
      const column = index % columns;
      const row = Math.floor(index / columns);
      const inset = Math.max(1, Math.round(cellSize * 0.08));
      context.drawImage(bitmap, column * cellSize + inset, row * cellSize + inset, cellSize - inset * 2, cellSize - inset * 2);
      entries.push(Object.freeze({ id: asset.id, u0: column / columns, v0: row / rows, u1: (column + 1) / columns, v1: (row + 1) / rows }));
    } finally {
      if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
    }
  }
  const rgba = context.getImageData(0, 0, width, height).data;
  const pixels = new Uint8Array(rgba.length);
  for (let index = 0; index < rgba.length; index += 4) {
    pixels[index] = 255; pixels[index + 1] = 255; pixels[index + 2] = 255; pixels[index + 3] = rgba[index + 3];
  }
  throwIfAborted(options.signal);
  return normalizeIconAtlasData({ width, height, pixels, entries });
}

/**
 * Chromium does not consistently decode SVG blobs through createImageBitmap. Try the
 * worker-friendly path first, then use a DOM Image without exposing it publicly.
 *
 * @param {Blob} blob
 * @param {(blob:Blob)=>Promise<ImageBitmap>} bitmapFactory
 * @returns {Promise<ImageBitmap|HTMLImageElement>}
 */
async function decodeSvgBlob(blob, bitmapFactory) {
  try { return await bitmapFactory(blob); }
  catch (error) {
    if (typeof Image !== "function" || typeof URL?.createObjectURL !== "function") throw error;
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.decoding = "sync";
      image.src = url;
      await image.decode();
      return image;
    } finally { URL.revokeObjectURL(url); }
  }
}

/** @param {number} width @param {number} height @returns {HTMLCanvasElement|OffscreenCanvas} */
function createCanvas(width, height) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
  if (typeof document === "undefined") throw new Error("Canvas creation is unavailable");
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; return canvas;
}
/** @param {AbortSignal|undefined} signal */
function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (typeof signal.throwIfAborted === "function") signal.throwIfAborted();
  throw new DOMException("Icon atlas rasterization was aborted", "AbortError");
}
/** @param {string} id */
function expectedViewBox(id) { if (id === "feedback.great") return "0 0 128 32"; if (id.includes("guard")) return "0 0 48 24"; return "0 0 64 64"; }

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
