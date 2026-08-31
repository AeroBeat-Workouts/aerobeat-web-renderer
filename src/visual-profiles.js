// @ts-check

import { isThemeDescriptor } from "@aerobeat/web-contracts/theme-contracts";
import { defaultRendererThemeTokens, defaultRendererTuning } from "./gameplay-scene-model.js";

/** @typedef {import("./gameplay-scene-model.js").AeroRendererThemeTokens} AeroRendererThemeTokens */
/** @typedef {import("./gameplay-scene-model.js").AeroRendererTuning} AeroRendererTuning */
/** @typedef {{schema:"aerobeat/theme_descriptor",version:1,id:string,themeVersion:string,tokens:AeroRendererThemeTokens,contentHash:Readonly<{algorithm:string,value:string}>}} AeroThemeDescriptor */
/** @typedef {{kind:"solid"|"linear-gradient",colors:readonly string[],angleDeg:number}} AeroRendererBackgroundProjection */
/** @typedef {Readonly<{schema:"aerobeat/prototype_tuning_identity",version:1,profileId:string,profileVersion:string,contentHash:string,class:"live_visual",regenerationRequired:false}>} AeroRendererVisualIdentity */
/** @typedef {Readonly<{motionIntensity:number,roleScale:number}>} AeroRendererVisualSettings */
/** @typedef {Readonly<{identity:AeroRendererVisualIdentity,settings:AeroRendererVisualSettings}>} AeroRendererVisualProfileSelection */

const DEFAULT_VISUAL_HASH = "fdcf478c91e21ef88970299e29fcc35d574bfe69e0d7d00d9f823ee9507f39a3";
const COMPACT_VISUAL_HASH = "e65d53dfaafe8a859c08837acb3d447b10b03508bd5ae64677d273c93657d603";

/** @type {AeroRendererVisualProfileSelection} */
export const defaultRendererVisualProfile = visualProfile("aero.visual.default", DEFAULT_VISUAL_HASH, 1, 1);
/** @type {AeroRendererVisualProfileSelection} */
export const compactRendererVisualProfile = visualProfile("aero.visual.compact", COMPACT_VISUAL_HASH, 0.8, 0.86);

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
  if (!colorNames.every((name) => isRendererColorToken(tokens[name])) || !easingNames.every((name) => isNamedEasing(tokens[name]))) {
    return defaultRendererThemeTokens;
  }
  if (typeof tokens.approachLeadMs !== "number" || !Number.isFinite(tokens.approachLeadMs) || tokens.approachLeadMs < 1 || tokens.approachLeadMs > 10_000 || typeof tokens.targetStartScale !== "number" || !Number.isFinite(tokens.targetStartScale) || tokens.targetStartScale < 0.05 || tokens.targetStartScale > 3 || typeof tokens.targetHitScale !== "number" || !Number.isFinite(tokens.targetHitScale) || tokens.targetHitScale < 0.05 || tokens.targetHitScale > 3) {
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
  const numberNames = ["dprCap","roleScale","worldUnitsPerMs","futureCullMs","spentCullMs","targetSize","obstacleHeight","timingZoneHeight","feedbackDurationMs","hitPulseScale","greatEndScale"];
  const requiredNames = ["id","version",...numberNames];
  const keys = Object.keys(value);
  if (!keys.every((key)=>requiredNames.includes(key)||key==="hash") || !requiredNames.every((key)=>keys.includes(key)) || typeof value.id!=="string" || value.id.length===0 || typeof value.version!=="string" || value.version.length===0 || !numberNames.every((name)=>typeof value[name]==="number"&&Number.isFinite(value[name]))) return defaultRendererTuning;
  const normalized = {
    id:value.id,version:value.version,
    dprCap:clamp(Number(value.dprCap),1,4),roleScale:clamp(Number(value.roleScale),0.5,1.5),worldUnitsPerMs:clamp(Number(value.worldUnitsPerMs),0.001,0.02),futureCullMs:clamp(Number(value.futureCullMs),500,10_000),spentCullMs:clamp(Number(value.spentCullMs),100,2000),targetSize:clamp(Number(value.targetSize),0.3,2),obstacleHeight:clamp(Number(value.obstacleHeight),1,8),timingZoneHeight:clamp(Number(value.timingZoneHeight),0.005,0.2),feedbackDurationMs:clamp(Number(value.feedbackDurationMs),120,1000),hitPulseScale:clamp(Number(value.hitPulseScale),1,1.25),greatEndScale:clamp(Number(value.greatEndScale),1,1.5)
  };
  const hash=stableVisualHash(normalized);
  if(value.hash!==undefined&&value.hash!==hash&&value.hash!==defaultRendererTuning.hash)return defaultRendererTuning;
  return Object.freeze({...normalized,hash});
}

/**
 * Strictly narrow one public gameplay visual selection without depending on the
 * gameplay package. Only the two content-hashed experimental Task 11 profiles
 * are renderer inputs; scoring/converter identities never cross this adapter.
 *
 * @param {unknown} value
 * @returns {AeroRendererVisualProfileSelection}
 */
export function normalizeRendererVisualProfile(value) {
  const outer = exactDataRecord(value, ["identity", "settings"], "Visual profile selection");
  const identity = exactDataRecord(outer.identity, ["schema", "version", "profileId", "profileVersion", "contentHash", "class", "regenerationRequired"], "Visual profile identity");
  const settings = exactDataRecord(outer.settings, ["motionIntensity", "roleScale"], "Visual profile settings");
  if (identity.schema !== "aerobeat/prototype_tuning_identity" || identity.version !== 1 || identity.class !== "live_visual" || identity.regenerationRequired !== false) throw new TypeError("Visual profile identity is incompatible with live renderer tuning");
  for (const name of ["profileId", "profileVersion", "contentHash"]) if (typeof identity[name] !== "string" || identity[name].length === 0 || identity[name].length > 128) throw new TypeError(`Visual profile ${name} is invalid`);
  if (!/^[0-9a-f]{64}$/u.test(String(identity.contentHash))) throw new TypeError("Visual profile contentHash must be bare lowercase SHA-256");
  if (typeof settings.motionIntensity !== "number" || !Number.isFinite(settings.motionIntensity) || settings.motionIntensity < 0 || settings.motionIntensity > 2 || typeof settings.roleScale !== "number" || !Number.isFinite(settings.roleScale) || settings.roleScale < 0.5 || settings.roleScale > 1.5) throw new TypeError("Visual profile settings are outside renderer bounds");
  const normalized = visualProfile(String(identity.profileId), String(identity.contentHash), Number(settings.motionIntensity), Number(settings.roleScale), String(identity.profileVersion));
  const expected = normalized.identity.profileId === "aero.visual.default" ? defaultRendererVisualProfile : normalized.identity.profileId === "aero.visual.compact" ? compactRendererVisualProfile : null;
  if (!expected || !sameVisualSelection(normalized, expected)) throw new TypeError("Visual profile identity, settings, or content hash is not a supported experimental profile");
  return expected;
}

/** @param {AeroRendererVisualProfileSelection} profile @returns {AeroRendererTuning} */
export function rendererTuningFromVisualProfile(profile) {
  const motionIntensity = profile.settings.motionIntensity;
  const roleScale = profile.settings.roleScale;
  return normalizeRendererTuning({
    ...defaultRendererTuning,
    id:profile.identity.profileId,
    version:profile.identity.profileVersion,
    hash:undefined,
    roleScale,
    targetSize:defaultRendererTuning.targetSize*(0.9+0.1*motionIntensity)
  });
}

/**
 * @param {unknown} value
 * @returns {AeroRendererBackgroundProjection}
 */
export function normalizeBackgroundProjection(value) {
  if (!isRecord(value) || !Object.keys(value).every((key) => key === "kind" || key === "colors" || key === "angleDeg") || (value.kind !== "solid" && value.kind !== "linear-gradient") || !Array.isArray(value.colors) || value.colors.length === 0 || !value.colors.every(isRendererColorToken)) {
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
function isRendererColorToken(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) return false;
  return /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/iu.test(value.trim()) || /^rgba?\(\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?(?:\s*,\s*\d*(?:\.\d+)?)?\s*\)$/iu.test(value.trim());
}
/** @param {unknown} value @returns {value is string} */
function isNamedEasing(value) { return value === "linear" || value === "ease-in" || value === "ease-out" || value === "ease-in-out"; }
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
/** @param {number} value @param {number} minimum @param {number} maximum */
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }

/** @param {string} profileId @param {string} contentHash @param {number} motionIntensity @param {number} roleScale @param {string} [profileVersion] @returns {AeroRendererVisualProfileSelection} */
function visualProfile(profileId, contentHash, motionIntensity, roleScale, profileVersion = "1.0.0") {
  return Object.freeze({
    identity: Object.freeze({ schema: "aerobeat/prototype_tuning_identity", version: 1, profileId, profileVersion, contentHash, class: "live_visual", regenerationRequired: false }),
    settings: Object.freeze({ motionIntensity, roleScale })
  });
}

/** @param {unknown} value @param {readonly string[]} keys @param {string} label @returns {Record<string,unknown>} */
function exactDataRecord(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a plain data record`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const names = Object.keys(descriptors);
  if (names.length !== keys.length || !keys.every((key) => names.includes(key))) throw new TypeError(`${label} fields are invalid`);
  /** @type {Record<string,unknown>} */ const result = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) throw new TypeError(`${label} must not contain accessors or hidden fields`);
    result[key] = descriptor.value;
  }
  return result;
}

/** @param {AeroRendererVisualProfileSelection} left @param {AeroRendererVisualProfileSelection} right */
function sameVisualSelection(left, right) {
  return left.identity.profileId === right.identity.profileId && left.identity.profileVersion === right.identity.profileVersion && left.identity.contentHash === right.identity.contentHash && left.settings.motionIntensity === right.settings.motionIntensity && left.settings.roleScale === right.settings.roleScale;
}
