// @ts-check

export const gameplayAssetReleaseVersion="0.0.13";
export const gameplayAssetSourceCommit="54e83d89264b2cedbdcc616ddd7c8b386ac9e204";
export const gameplayAssetSourceTree="3122baa63d481173992a637ad275d2aec6f3ec37";
export const gameplayAssetAuditCommit="cf38fa7c61030f4a9f38e228563d5dd820b5ed04";
export const gameplayAssetAuditTree="3da9af7827efb93d0a7f6a25d61769ed6fce9910";
export const gameplayAssetRawTree="e01a56f3b1f1dd53444a8cbcb1b7fa7f21f45faf";
export const gameplayAssetInventorySha256="77e90badd35b8e21460045f05ab669d624bd6249b1b248609f32778b48660123";
export const gameplayAssetProofSha256="0bbf78d723babd15150b8dfbf544f5b289673bdf98f9ddc738c46fa682d1ebdb";

const definitions=[
  ["any-note/outlined-circle-v1","any-note","outlined-circle-v1",142020,"eb1368f09fe3034b9690e18f17e066ea4af7d20522f7c3ee009888c01f5235a6"],
  ["athlete-marker/sphere-v1","athlete-marker","sphere-v1",90520,"f376934f218a25c11f2f31928c67684611aaf9c73aa1724548682ae280b5cbcc"],
  ["bomb/urchin-v1","bomb","urchin-v1",8364,"63d61feff050c284f2e3a228d345ea794c25bab48ab56cd4801d554c923def85"],
  ["boxing-glove/boxing-glove-v1","boxing-glove","boxing-glove-v1",17568,"1012d4677617ec41180e22771b3f8427e995e16d7a6f80b9e52b30cd0b8bcd20"],
  ["directional-arrow/rounded-outline-v1","directional-arrow","rounded-outline-v1",152916,"75435bc79c0278da5488ab05d1a97ac409cdab390e10483748c30a5aa67ad7e4"],
  ["flow-saber/flow-saber-v1","flow-saber","flow-saber-v1",6492,"ed4fce456f4b665f5d3589861a2233b6c67becd86a0fcf5765bb5f48289f40d3"],
  ["guard/outlined-shield-v1","guard","outlined-shield-v1",93944,"5c456ed0d6db8fbc500b7d9815ac72a2f5e40ae86ee582f01b80b40e4c03e09e"],
  ["knee-pad/segmented-lightwrap-v1","knee-pad","segmented-lightwrap-v1",113352,"2dc4a861acb672d177654123bcb06a9b7155ac5a9cedc4fe860fa24e644a1326"],
  ["knee-target/hover-shell-strike-v1","knee-target","hover-shell-strike-v1",75152,"ab9237a84cb01a4965a0aa7b929c4300652548b043655ec2998b9772e0c6fbb6"],
  ["track/blue-glass-v1","track","blue-glass-v1",2652,"93e8dc45f7f6be58aa90ddc7a2def16b54b830ad6882b881fe72dc558f42dfba"],
  ["wall/red-glass-v1","wall","red-glass-v1",2316,"6a336116709c2f3c1d92453fe1b3a2821e03d31128dae72d0fc700627fa94cd7"]
];

export const gameplayAssets=Object.freeze(definitions.map(([id,role,variant,bytes,sha256])=>Object.freeze({
  id,role,variant,bytes,sha256,
  path:`${id}.glb`,
  manifestPath:`manifests/${id}.v1.json`
})));

export const gameplayAssetIds=Object.freeze(gameplayAssets.map(({id})=>id));
const byId=new Map(gameplayAssets.map((asset)=>[asset.id,asset]));
const byRole=new Map(gameplayAssets.map((asset)=>[asset.role,asset]));
const cueMaterialRoles=new Map([
  ["directional-arrow/rounded-outline-v1",new Map([["mat/charcoal","outline_charcoal"],["mat/white","outline_white"],["mat/tint_base","note_fill"]])],
  ["any-note/outlined-circle-v1",new Map([["mat/charcoal","outline_charcoal"],["mat/white","outline_white"],["mat/tint_base","note_fill"]])],
  ["guard/outlined-shield-v1",new Map([["mat/charcoal","outline_charcoal"],["mat/white","outline_white"],["mat/green","guard_fill"]])],
  ["athlete-marker/sphere-v1",new Map([["mat/charcoal","marker_structure_charcoal"],["mat/white","marker_structure_white"],["mat/tint_base","marker_fill"]])],
  // 0.0.62 L-C (r2lb r2): flow-saber-v2 two-cylinder saber.
  // mat/saber_blade is the runtime-TINTABLE emissive blade + rounded tip
  // (carries the song-palette color via the equipment per-hand tint).
  // mat/saber_hilt is the dark gunmetal structural hilt (NOT tintable, no glow).
  ["flow-saber/flow-saber-v1",new Map([["mat/saber_blade","saber_blade_tint"],["mat/saber_hilt","saber_hilt_dark"]])],
  // 0.0.62 L-D (5y0q r1): boxing-glove v1. mat/glove_body is the runtime-TINTABLE
  // fist (per-hand song color); shading depth is baked as vertex-color AO (COLOR_0),
  // so the unlit in-engine material still reads as a shaded glove.
  ["boxing-glove/boxing-glove-v1",new Map([["mat/glove_body","glove_body_tint"]])],
  ["knee-pad/segmented-lightwrap-v1",new Map([["mat/glove_match_tint","knee_pad_tint"]])]
]);

export const gameplayAssetSet=Object.freeze({
  schema:"aerobeat.gameplay-set/v1",
  name:"default-v1",
  release:gameplayAssetReleaseVersion,
  constraints:Object.freeze({guardCanonicalAsset:"guard/outlined-shield-v1",guardInstancesPerBeat:2}),
  roles:Object.freeze(Object.fromEntries(gameplayAssets.map(({role,variant})=>[role,variant])))
});

/** Renderer-internal role lookup backed by sync-validated immutable manifest metadata. */
export function gameplayAssetMaterialRole(assetId,materialName){return cueMaterialRoles.get(assetId)?.get(materialName)??null;}

/** Resolve only a pinned renderer-owned GLB to a package-relative URL. */
export function resolveGameplayAssetUrl(id,baseUrl=import.meta.url){
  const asset=byId.get(id);
  if(!asset)throw new TypeError(`Unknown gameplay asset identity: ${String(id)}`);
  return new URL(`../assets/gameplay/${gameplayAssetReleaseVersion}/${asset.path}`,baseUrl).href;
}

export function gameplayAssetForRole(role){
  const asset=byRole.get(role);
  if(!asset)throw new TypeError(`Unknown gameplay asset role: ${String(role)}`);
  return asset;
}
