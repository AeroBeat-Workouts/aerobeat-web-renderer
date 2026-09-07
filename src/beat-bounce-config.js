// @ts-check

export const beatBounceConfigSchema = "aerobeat/beat_bounce_config";
export const beatBounceConfigVersion = 1;
export const beatBounceConfigArtifactFilename = "aerobeat-beat-bounce-config.v1.json";
export const beatBounceConfigArtifactMimeType = "application/json";
export const maximumBeatBounceConfigBytes = 16 * 1024;
export const beatBounceEasings = Object.freeze(["linear", "in_quad", "out_quad", "in_out_sine"]);
export const beatBounceConfigBounds = deepFreeze({ leadBeats:[0.25,8], heightWorldUnits:[0,1.5], apexFraction:[0.15,0.85] });
const keys = Object.freeze(["schema","version","leadBeats","heightWorldUnits","apexFraction","riseEasing","fallEasing"]);

export const defaultBeatBounceConfig = normalizeBeatBounceConfig({
  schema:beatBounceConfigSchema,
  version:beatBounceConfigVersion,
  leadBeats:4,
  heightWorldUnits:0.9,
  apexFraction:0.4,
  riseEasing:"out_quad",
  fallEasing:"in_quad"
});

/** Strictly validate and canonicalize one v1 bounce config. @param {unknown} value */
export function normalizeBeatBounceConfig(value){
  if(typeof globalThis.structuredClone!=="function")throw new TypeError("Beat bounce config structured-clone validation is unavailable");
  try{globalThis.structuredClone(value);}catch{throw new TypeError("Beat bounce config is not structured-cloneable");}
  if(value===null||typeof value!=="object"||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new TypeError("Beat bounce config must be a plain record");
  const ownKeys=Reflect.ownKeys(value);
  if(ownKeys.length!==keys.length||ownKeys.some((key)=>typeof key!=="string"||!keys.includes(key)))throw new TypeError("Beat bounce config keys are invalid");
  for(const key of ownKeys){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor||!("value" in descriptor)||!descriptor.enumerable)throw new TypeError("Beat bounce config must contain ordinary enumerable data properties");}
  const data=(key)=>Object.getOwnPropertyDescriptor(value,key)?.value;
  if(data("schema")!==beatBounceConfigSchema||data("version")!==beatBounceConfigVersion)throw new TypeError("Beat bounce config schema/version is invalid");
  const leadBeats=bounded(data("leadBeats"),beatBounceConfigBounds.leadBeats,"leadBeats");
  const heightWorldUnits=bounded(data("heightWorldUnits"),beatBounceConfigBounds.heightWorldUnits,"heightWorldUnits");
  const apexFraction=bounded(data("apexFraction"),beatBounceConfigBounds.apexFraction,"apexFraction");
  const riseEasing=easing(data("riseEasing"),"riseEasing"),fallEasing=easing(data("fallEasing"),"fallEasing");
  return deepFreeze({schema:beatBounceConfigSchema,version:beatBounceConfigVersion,leadBeats,heightWorldUnits,apexFraction,riseEasing,fallEasing});
}

/** @param {unknown} value */
export function serializeBeatBounceConfig(value){return `${JSON.stringify(normalizeBeatBounceConfig(value),null,2)}\n`;}

/** Pure absolute-time offset with exact endpoint branches. @param {number} nowMs @param {number} startMs @param {number} hitMs @param {unknown} config */
export function beatBounceOffsetY(nowMs,startMs,hitMs,config=defaultBeatBounceConfig){
  const normalized=config===defaultBeatBounceConfig?defaultBeatBounceConfig:normalizeBeatBounceConfig(config);
  if(!Number.isFinite(nowMs)||!Number.isFinite(startMs)||!Number.isFinite(hitMs))throw new TypeError("Beat bounce timestamps must be finite");
  const duration=hitMs-startMs;
  if(duration<=0||nowMs<startMs||nowMs>=hitMs||normalized.heightWorldUnits===0)return 0;
  const q=Math.max(0,Math.min(1,(nowMs-startMs)/duration)),apex=normalized.apexFraction;
  if(q===0)return 0;
  if(q===apex)return normalized.heightWorldUnits;
  if(q<apex)return normalized.heightWorldUnits*ease(normalized.riseEasing,q/apex);
  return normalized.heightWorldUnits*(1-ease(normalized.fallEasing,(q-apex)/(1-apex)));
}

function ease(name,value){if(value<=0)return 0;if(value>=1)return 1;if(name==="linear")return value;if(name==="in_quad")return value*value;if(name==="out_quad")return 1-(1-value)*(1-value);return (1-Math.cos(Math.PI*value))/2;}
function easing(value,label){if(typeof value!=="string"||!beatBounceEasings.includes(value))throw new TypeError(`Beat bounce ${label} is invalid`);return value;}
function bounded(value,limits,label){if(typeof value!=="number"||!Number.isFinite(value)||value<limits[0]||value>limits[1])throw new TypeError(`Beat bounce ${label} is out of bounds`);const rounded=Number(value.toFixed(6));return Object.is(rounded,-0)?0:rounded;}
/** @template T @param {T} value @returns {T} */
function deepFreeze(value){if(value&&typeof value==="object")for(const child of Object.values(value))deepFreeze(child);return Object.freeze(value);}
