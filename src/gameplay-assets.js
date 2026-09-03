// @ts-check

export const gameplayAssetReleaseVersion="0.0.3";
export const gameplayAssetSourceCommit="8b8b40593b9deb54d32654e39fd7c1c1c4a9dc1a";
export const gameplayAssetInventorySha256="69b88d38113a56061dfc0ea5e92ec51a0b181fcade6a99e1dcc5df1baecdde03";
export const gameplayAssetProofSha256="287adc43a0456782044f0fd7601efd7b5087342972d9da4525923598754b1efc";

const definitions=[
  ["any-note/circle-v1","any-note","circle-v1",5616,"0cd90824251657825a9c84499a43a59ce7e39112e32f9903b1e1836c2466945e"],
  ["athlete-marker/sphere-v1","athlete-marker","sphere-v1",3036,"be91826b05a9643a3923ad7d3af9d2e0e0c22bb29bac4bfa97a9758b43700bd3"],
  ["bomb/urchin-v1","bomb","urchin-v1",8364,"63d61feff050c284f2e3a228d345ea794c25bab48ab56cd4801d554c923def85"],
  ["directional-arrow/outline-v1","directional-arrow","outline-v1",3272,"c5ae744fbb151b101c2b1e732fdcaf54ac8549c746c10c1df5a13dba7e4ef869"],
  ["guard/shield-v1","guard","shield-v1",2848,"50eb6b6835ec6f2acfceb866d53a8f3f8b424d48259ac59c74a39f5bab731eee"],
  ["track/blue-glass-v1","track","blue-glass-v1",2480,"46cb72ed47a235e9bf40305bac2355b02ca47aa6b39278503cd6fc1b32cef987"],
  ["wall/red-glass-v1","wall","red-glass-v1",3292,"ed6511c1ce1c196c9b735e40c0b4bf96375cd2f9b9dd0723c5fe5c5209b5d27a"]
];

export const gameplayAssets=Object.freeze(definitions.map(([id,role,variant,bytes,sha256])=>Object.freeze({
  id,role,variant,bytes,sha256,
  path:`${id}.glb`,
  manifestPath:`manifests/${id}.v1.json`
})));

export const gameplayAssetIds=Object.freeze(gameplayAssets.map(({id})=>id));
const byId=new Map(gameplayAssets.map((asset)=>[asset.id,asset]));
const byRole=new Map(gameplayAssets.map((asset)=>[asset.role,asset]));

export const gameplayAssetSet=Object.freeze({
  schema:"aerobeat.gameplay-set/v1",
  name:"default-v1",
  release:gameplayAssetReleaseVersion,
  constraints:Object.freeze({guardCanonicalAsset:"guard/shield-v1",guardInstancesPerBeat:2}),
  roles:Object.freeze(Object.fromEntries(gameplayAssets.map(({role,variant})=>[role,variant])))
});

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
