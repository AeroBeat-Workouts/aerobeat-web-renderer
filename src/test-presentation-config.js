// @ts-check

export const testPresentationConfigSchema="aerobeat/test_presentation_config";
export const testPresentationConfigVersion=1;
export const testPresentationConfigArtifactFilename="aerobeat-test-presentation-config.v1.json";
export const testPresentationConfigArtifactMimeType="application/json";
export const maximumTestPresentationConfigBytes=16*1024;
export const testPresentationEasings=Object.freeze(["linear","in_quad","out_quad","in_out_sine"]);
export const testPresentationSkyModes=Object.freeze(["off","prelude"]);
export const testPresentationConfigBounds=deepFreeze({
  bounceLeadBeats:[0.25,8],bounceHeightWorldUnits:[0,1.5],bounceApexFraction:[0.15,0.85],
  normalSpawnDistanceWorldUnits:[3,72],skyPreludeHeightWorldUnits:[0,24],skyPreludeDurationMs:[100,10_000],boxingLaneSeparationWorldUnits:[1.7,4]
});
const keys=Object.freeze(["schema","version","bounceLeadBeats","bounceHeightWorldUnits","bounceApexFraction","bounceRiseEasing","bounceFallEasing","normalSpawnDistanceWorldUnits","skyMode","skyPreludeHeightWorldUnits","skyPreludeDurationMs","skyPreludeEasing","boxingLaneSeparationWorldUnits"]);
/** @typedef {{schema:string,version:number,bounceLeadBeats:number,bounceHeightWorldUnits:number,bounceApexFraction:number,bounceRiseEasing:"linear"|"in_quad"|"out_quad"|"in_out_sine",bounceFallEasing:"linear"|"in_quad"|"out_quad"|"in_out_sine",normalSpawnDistanceWorldUnits:number,skyMode:"off"|"prelude",skyPreludeHeightWorldUnits:number,skyPreludeDurationMs:number,skyPreludeEasing:"linear"|"in_quad"|"out_quad"|"in_out_sine",boxingLaneSeparationWorldUnits:number}} TestPresentationConfig */
/** @type {WeakSet<TestPresentationConfig>} */ const trustedConfigs=new WeakSet();

/** Construct one trusted configuration from primitives only. */
export function createTestPresentationConfig(bounceLeadBeats,bounceHeightWorldUnits,bounceApexFraction,bounceRiseEasing,bounceFallEasing,normalSpawnDistanceWorldUnits,skyMode,skyPreludeHeightWorldUnits,skyPreludeDurationMs,skyPreludeEasing,boxingLaneSeparationWorldUnits){
  return brand({schema:testPresentationConfigSchema,version:testPresentationConfigVersion,
    bounceLeadBeats:bounded(bounceLeadBeats,testPresentationConfigBounds.bounceLeadBeats,"bounceLeadBeats"),
    bounceHeightWorldUnits:bounded(bounceHeightWorldUnits,testPresentationConfigBounds.bounceHeightWorldUnits,"bounceHeightWorldUnits"),
    bounceApexFraction:bounded(bounceApexFraction,testPresentationConfigBounds.bounceApexFraction,"bounceApexFraction"),
    bounceRiseEasing:easing(bounceRiseEasing,"bounceRiseEasing"),bounceFallEasing:easing(bounceFallEasing,"bounceFallEasing"),
    normalSpawnDistanceWorldUnits:bounded(normalSpawnDistanceWorldUnits,testPresentationConfigBounds.normalSpawnDistanceWorldUnits,"normalSpawnDistanceWorldUnits"),
    skyMode:skyModeValue(skyMode),skyPreludeHeightWorldUnits:bounded(skyPreludeHeightWorldUnits,testPresentationConfigBounds.skyPreludeHeightWorldUnits,"skyPreludeHeightWorldUnits"),
    skyPreludeDurationMs:bounded(skyPreludeDurationMs,testPresentationConfigBounds.skyPreludeDurationMs,"skyPreludeDurationMs"),skyPreludeEasing:easing(skyPreludeEasing,"skyPreludeEasing"),
    boxingLaneSeparationWorldUnits:bounded(boxingLaneSeparationWorldUnits,testPresentationConfigBounds.boxingLaneSeparationWorldUnits,"boxingLaneSeparationWorldUnits")});
}
export const defaultTestPresentationConfig=createTestPresentationConfig(4,.9,.4,"out_quad","in_quad",15,"off",4,1200,"in_out_sine",2.7);
export function parseTestPresentationConfig(text){if(typeof text!=="string")throw new TypeError("Test presentation config JSON must be text");let value;try{value=JSON.parse(text);}catch{throw new TypeError("Test presentation config JSON is invalid");}return normalizeParsedRecord(value);}
export function normalizeTestPresentationConfig(value){if((typeof value!=="object"&&typeof value!=="function")||value===null||!trustedConfigs.has(/** @type {TestPresentationConfig} */(value)))throw new TypeError("Test presentation config must be created by the trusted constructor or JSON parser");return /** @type {TestPresentationConfig} */(value);}
export function serializeTestPresentationConfig(value){return `${JSON.stringify(normalizeTestPresentationConfig(value),null,2)}\n`;}
/** Absolute-time bounce with exact endpoint branches. */
export function testPresentationBounceOffsetY(nowMs,startMs,hitMs,config=defaultTestPresentationConfig){const c=normalizeTestPresentationConfig(config);if(![nowMs,startMs,hitMs].every(Number.isFinite))throw new TypeError("Test presentation timestamps must be finite");const duration=hitMs-startMs;if(duration<=0||nowMs<startMs||nowMs>=hitMs||c.bounceHeightWorldUnits===0)return 0;const q=Math.max(0,Math.min(1,(nowMs-startMs)/duration)),apex=c.bounceApexFraction;if(q===0)return 0;if(q===apex)return c.bounceHeightWorldUnits;if(q<apex)return c.bounceHeightWorldUnits*ease(c.bounceRiseEasing,q/apex);return c.bounceHeightWorldUnits*(1-ease(c.bounceFallEasing,(q-apex)/(1-apex)));}
/** Sky offset is elevated at prelude start and exactly zero at the normal lane join. */
export function testPresentationSkyOffsetY(nowMs,startMs,joinMs,config=defaultTestPresentationConfig){const c=normalizeTestPresentationConfig(config);if(c.skyMode!=="prelude"||c.skyPreludeHeightWorldUnits===0||nowMs<startMs||nowMs>=joinMs||joinMs<=startMs)return 0;const q=Math.max(0,Math.min(1,(nowMs-startMs)/(joinMs-startMs)));return c.skyPreludeHeightWorldUnits*(1-ease(c.skyPreludeEasing,q));}
function normalizeParsedRecord(value){if(value===null||typeof value!=="object"||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new TypeError("Test presentation config JSON must contain a plain record");const ownKeys=Reflect.ownKeys(value);if(ownKeys.length!==keys.length||ownKeys.some(key=>typeof key!=="string"||!keys.includes(key)))throw new TypeError("Test presentation config keys are invalid");for(const key of ownKeys){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor||!("value" in descriptor)||!descriptor.enumerable)throw new TypeError("Test presentation config must contain ordinary enumerable data properties");}const data=key=>Object.getOwnPropertyDescriptor(value,key)?.value;if(data("schema")!==testPresentationConfigSchema||data("version")!==testPresentationConfigVersion)throw new TypeError("Test presentation config schema/version is invalid");return createTestPresentationConfig(data("bounceLeadBeats"),data("bounceHeightWorldUnits"),data("bounceApexFraction"),data("bounceRiseEasing"),data("bounceFallEasing"),data("normalSpawnDistanceWorldUnits"),data("skyMode"),data("skyPreludeHeightWorldUnits"),data("skyPreludeDurationMs"),data("skyPreludeEasing"),data("boxingLaneSeparationWorldUnits"));}
function brand(value){const frozen=deepFreeze(value);trustedConfigs.add(frozen);return frozen;}
function ease(name,value){if(value<=0)return 0;if(value>=1)return 1;if(name==="linear")return value;if(name==="in_quad")return value*value;if(name==="out_quad")return 1-(1-value)*(1-value);return(1-Math.cos(Math.PI*value))/2;}
function easing(value,label){if(typeof value!=="string"||!testPresentationEasings.includes(value))throw new TypeError(`Test presentation ${label} is invalid`);return /** @type {"linear"|"in_quad"|"out_quad"|"in_out_sine"} */(value);}
function skyModeValue(value){if(typeof value!=="string"||!testPresentationSkyModes.includes(value))throw new TypeError("Test presentation skyMode is invalid");return /** @type {"off"|"prelude"} */(value);}
function bounded(value,limits,label){if(typeof value!=="number"||!Number.isFinite(value)||value<limits[0]||value>limits[1])throw new TypeError(`Test presentation ${label} is out of bounds`);const rounded=Number(value.toFixed(6));return Object.is(rounded,-0)?0:rounded;}
function deepFreeze(value){if(value&&typeof value==="object")for(const child of Object.values(value))deepFreeze(child);return Object.freeze(value);}
