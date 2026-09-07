// @ts-check

export const beatBounceConfigSchema = "aerobeat/beat_bounce_config";
export const beatBounceConfigVersion = 1;
export const beatBounceConfigArtifactFilename = "aerobeat-beat-bounce-config.v1.json";
export const beatBounceConfigArtifactMimeType = "application/json";
export const maximumBeatBounceConfigBytes = 16 * 1024;
export const beatBounceEasings = Object.freeze(["linear", "in_quad", "out_quad", "in_out_sine"]);
export const beatBounceConfigBounds = deepFreeze({ leadBeats:[0.25,8], heightWorldUnits:[0,1.5], apexFraction:[0.15,0.85] });
const keys = Object.freeze(["schema","version","leadBeats","heightWorldUnits","apexFraction","riseEasing","fallEasing"]);
/** @typedef {{schema:string,version:number,leadBeats:number,heightWorldUnits:number,apexFraction:number,riseEasing:"linear"|"in_quad"|"out_quad"|"in_out_sine",fallEasing:"linear"|"in_quad"|"out_quad"|"in_out_sine"}} BeatBounceConfig */
/** @type {WeakSet<BeatBounceConfig>} */
const trustedBeatBounceConfigs = new WeakSet();

/**
 * Construct one trusted config from primitives only. No arbitrary record is
 * inspected or branded at this boundary.
 * @param {number} leadBeats
 * @param {number} heightWorldUnits
 * @param {number} apexFraction
 * @param {string} riseEasing
 * @param {string} fallEasing
 * @returns {BeatBounceConfig}
 */
export function createBeatBounceConfig(leadBeats,heightWorldUnits,apexFraction,riseEasing,fallEasing){
  return brand({
    schema:beatBounceConfigSchema,
    version:beatBounceConfigVersion,
    leadBeats:bounded(leadBeats,beatBounceConfigBounds.leadBeats,"leadBeats"),
    heightWorldUnits:bounded(heightWorldUnits,beatBounceConfigBounds.heightWorldUnits,"heightWorldUnits"),
    apexFraction:bounded(apexFraction,beatBounceConfigBounds.apexFraction,"apexFraction"),
    riseEasing:easing(riseEasing,"riseEasing"),
    fallEasing:easing(fallEasing,"fallEasing")
  });
}

export const defaultBeatBounceConfig = createBeatBounceConfig(4,0.9,0.4,"out_quad","in_quad");

/** Parse and strictly validate JSON text inside the trusted module boundary. @param {unknown} text @returns {BeatBounceConfig} */
export function parseBeatBounceConfig(text){
  if(typeof text!=="string")throw new TypeError("Beat bounce config JSON must be text");
  let value;try{value=JSON.parse(text);}catch{throw new TypeError("Beat bounce config JSON is invalid");}
  return normalizeParsedRecord(value);
}

/**
 * Accept only an exact module-created branded config. Arbitrary objects,
 * Proxies, accessors, clones and cross-realm lookalikes fail by WeakSet
 * identity without property inspection.
 * @param {unknown} value
 * @returns {BeatBounceConfig}
 */
export function normalizeBeatBounceConfig(value){
  if((typeof value!=="object"&&typeof value!=="function")||value===null||!trustedBeatBounceConfigs.has(/** @type {BeatBounceConfig} */(value)))throw new TypeError("Beat bounce config must be created by the trusted constructor or JSON parser");
  return /** @type {BeatBounceConfig} */(value);
}

/** @param {unknown} value */
export function serializeBeatBounceConfig(value){return `${JSON.stringify(normalizeBeatBounceConfig(value),null,2)}\n`;}

/** Pure absolute-time offset with exact endpoint branches. @param {number} nowMs @param {number} startMs @param {number} hitMs @param {unknown} config */
export function beatBounceOffsetY(nowMs,startMs,hitMs,config=defaultBeatBounceConfig){
  const normalized=normalizeBeatBounceConfig(config);
  if(!Number.isFinite(nowMs)||!Number.isFinite(startMs)||!Number.isFinite(hitMs))throw new TypeError("Beat bounce timestamps must be finite");
  const duration=hitMs-startMs;
  if(duration<=0||nowMs<startMs||nowMs>=hitMs||normalized.heightWorldUnits===0)return 0;
  const q=Math.max(0,Math.min(1,(nowMs-startMs)/duration)),apex=normalized.apexFraction;
  if(q===0)return 0;
  if(q===apex)return normalized.heightWorldUnits;
  if(q<apex)return normalized.heightWorldUnits*ease(normalized.riseEasing,q/apex);
  return normalized.heightWorldUnits*(1-ease(normalized.fallEasing,(q-apex)/(1-apex)));
}

/** @param {unknown} value @returns {BeatBounceConfig} */
function normalizeParsedRecord(value){
  if(value===null||typeof value!=="object"||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new TypeError("Beat bounce config JSON must contain a plain record");
  const ownKeys=Reflect.ownKeys(value);
  if(ownKeys.length!==keys.length||ownKeys.some((key)=>typeof key!=="string"||!keys.includes(key)))throw new TypeError("Beat bounce config keys are invalid");
  for(const key of ownKeys){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor||!("value" in descriptor)||!descriptor.enumerable)throw new TypeError("Beat bounce config must contain ordinary enumerable data properties");}
  const data=(key)=>Object.getOwnPropertyDescriptor(value,key)?.value;
  if(data("schema")!==beatBounceConfigSchema||data("version")!==beatBounceConfigVersion)throw new TypeError("Beat bounce config schema/version is invalid");
  return createBeatBounceConfig(data("leadBeats"),data("heightWorldUnits"),data("apexFraction"),data("riseEasing"),data("fallEasing"));
}

/** @param {BeatBounceConfig} value @returns {BeatBounceConfig} */
function brand(value){const frozen=deepFreeze(value);trustedBeatBounceConfigs.add(frozen);return frozen;}
function ease(name,value){if(value<=0)return 0;if(value>=1)return 1;if(name==="linear")return value;if(name==="in_quad")return value*value;if(name==="out_quad")return 1-(1-value)*(1-value);return (1-Math.cos(Math.PI*value))/2;}
/** @param {unknown} value @param {string} label @returns {"linear"|"in_quad"|"out_quad"|"in_out_sine"} */
function easing(value,label){if(typeof value!=="string"||!beatBounceEasings.includes(value))throw new TypeError(`Beat bounce ${label} is invalid`);return /** @type {"linear"|"in_quad"|"out_quad"|"in_out_sine"} */(value);}
function bounded(value,limits,label){if(typeof value!=="number"||!Number.isFinite(value)||value<limits[0]||value>limits[1])throw new TypeError(`Beat bounce ${label} is out of bounds`);const rounded=Number(value.toFixed(6));return Object.is(rounded,-0)?0:rounded;}
/** @template T @param {T} value @returns {T} */
function deepFreeze(value){if(value&&typeof value==="object")for(const child of Object.values(value))deepFreeze(child);return Object.freeze(value);}
