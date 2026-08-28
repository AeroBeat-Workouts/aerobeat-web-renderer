// @ts-check

import { isThemeDescriptor } from "@aerobeat/web-contracts/theme-contracts";
import { defaultRendererThemeTokens, defaultRendererTuning } from "./gameplay-plan.js";

/** @typedef {import("./gameplay-plan.js").AeroRendererThemeTokens} AeroRendererThemeTokens */
/** @typedef {import("./gameplay-plan.js").AeroRendererTuning} AeroRendererTuning */
/** @typedef {{schema:"aerobeat/theme_descriptor",version:1,id:string,themeVersion:string,tokens:AeroRendererThemeTokens,contentHash:Readonly<{algorithm:string,value:string}>}} AeroThemeDescriptor */
/** @typedef {{kind:"solid"|"linear-gradient",colors:readonly string[],angleDeg:number}} AeroRendererBackgroundProjection */

/**
 * Narrow a public theme descriptor into renderer-owned immutable tokens.
 *
 * @param {unknown} value
 * @returns {AeroRendererThemeTokens}
 */
export function normalizeRendererTheme(value) {
  if (!isThemeDescriptor(value) || !isRecord(value.tokens)) {
    return defaultRendererThemeTokens;
  }
  const tokens = value.tokens;
  const colorNames = ["leftHandColor", "rightHandColor", "guardColor", "obstacleColor", "receptorColor"];
  const easingNames = ["approachEasing", "hitEasing", "missEasing"];
  if (!colorNames.every((name) => isCssColorToken(tokens[name])) || !easingNames.every((name) => typeof tokens[name] === "string" && tokens[name].length > 0)) {
    return defaultRendererThemeTokens;
  }
  if (!["approachLeadMs", "targetStartScale", "targetHitScale"].every((name) => typeof tokens[name] === "number" && Number.isFinite(tokens[name]) && tokens[name] >= 0)) {
    return defaultRendererThemeTokens;
  }
  return Object.freeze({
    leftHandColor: String(tokens.leftHandColor), rightHandColor: String(tokens.rightHandColor), guardColor: String(tokens.guardColor), obstacleColor: String(tokens.obstacleColor), receptorColor: String(tokens.receptorColor),
    approachLeadMs: Number(tokens.approachLeadMs), targetStartScale: Number(tokens.targetStartScale), targetHitScale: Number(tokens.targetHitScale),
    approachEasing: String(tokens.approachEasing), hitEasing: String(tokens.hitEasing), missEasing: String(tokens.missEasing)
  });
}

/**
 * Normalize renderer-only visual tuning. Scoring/converter values are deliberately absent.
 *
 * @param {unknown} value
 * @returns {AeroRendererTuning}
 */
export function normalizeRendererTuning(value) {
  if (!isRecord(value)) return defaultRendererTuning;
  const numberNames = ["gridInset", "gridGap", "receptorAlpha", "approachRingScale", "approachRingWidth", "laneWidth", "dprCap"];
  if (typeof value.id !== "string" || value.id.length === 0 || typeof value.version !== "string" || value.version.length === 0 || !numberNames.every((name) => typeof value[name] === "number" && Number.isFinite(value[name]))) {
    return defaultRendererTuning;
  }
  const normalized = {
    id: value.id, version: value.version,
    gridInset: clamp(Number(value.gridInset), 0, 0.25), gridGap: clamp(Number(value.gridGap), 0, 0.08), receptorAlpha: clamp(Number(value.receptorAlpha), 0, 1),
    approachRingScale: clamp(Number(value.approachRingScale), 1, 3), approachRingWidth: clamp(Number(value.approachRingWidth), 0.01, 0.3), laneWidth: clamp(Number(value.laneWidth), 0.1, 0.4), dprCap: clamp(Number(value.dprCap), 1, 4)
  };
  return Object.freeze({ ...normalized, hash: stableVisualHash(normalized) });
}

/**
 * @param {unknown} value
 * @returns {AeroRendererBackgroundProjection}
 */
export function normalizeBackgroundProjection(value) {
  if (!isRecord(value) || (value.kind !== "solid" && value.kind !== "linear-gradient") || !Array.isArray(value.colors) || value.colors.length === 0 || !value.colors.every(isCssColorToken)) {
    return Object.freeze({ kind: "linear-gradient", colors: Object.freeze(["#071426", "#153b5d"]), angleDeg: 180 });
  }
  return Object.freeze({ kind: value.kind, colors: Object.freeze(value.colors.map(String).slice(0, 4)), angleDeg: typeof value.angleDeg === "number" && Number.isFinite(value.angleDeg) ? value.angleDeg : 180 });
}

/**
 * Convert supported CSS tokens to linear renderer RGBA. Unknown CSS variables degrade
 * to the supplied fallback instead of pretending WebGL can resolve the cascade.
 *
 * @param {string} token
 * @param {readonly [number,number,number,number]} fallback
 * @returns {readonly [number,number,number,number]}
 */
export function colorTokenToRgba(token, fallback) {
  const hex = token.trim().match(/^#([0-9a-f]{6}|[0-9a-f]{8})$/iu);
  if (hex) {
    const value = hex[1];
    return Object.freeze([parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255, value.length === 8 ? parseInt(value.slice(6, 8), 16) / 255 : 1]);
  }
  const rgb = token.trim().match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d*(?:\.\d+)?))?\s*\)$/iu);
  if (rgb) return Object.freeze([clamp(Number(rgb[1]) / 255, 0, 1), clamp(Number(rgb[2]) / 255, 0, 1), clamp(Number(rgb[3]) / 255, 0, 1), clamp(rgb[4] === undefined ? 1 : Number(rgb[4]), 0, 1)]);
  return fallback;
}

/** @param {Readonly<Record<string, string|number>>} value @returns {string} */
function stableVisualHash(value) {
  const canonical = Object.keys(value).sort().map((key) => `${key}:${String(value[key])}`).join("|");
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) { hash ^= canonical.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `visual-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** @param {unknown} value @returns {value is string} */
function isCssColorToken(value) { return typeof value === "string" && value.length > 0 && value.length <= 128 && !/[;{}]/u.test(value); }
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
/** @param {number} value @param {number} minimum @param {number} maximum */
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
