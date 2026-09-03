// @ts-check

export const gameplayAssetReleaseVersion="0.0.2";
export const gameplayAssetSourceCommit="0ed97676a0a816b797b12b9f8d19a9d281b9da03";
export const gameplayAssetInventorySha256="1a5b66f543bae940b8bb789e9ab9979d073663b5f6ff12382e08f4ad10c0ff1b";
export const gameplayAssetProofSha256="90dcbe52b35d2ec11a01784a96f195b5cd01ac141000886cb950c74864eec288";

const definitions=[
  ["any-note/circle-v1","any-note","circle-v1",5616,"0cd90824251657825a9c84499a43a59ce7e39112e32f9903b1e1836c2466945e"],
  ["athlete-marker/sphere-v1","athlete-marker","sphere-v1",3036,"be91826b05a9643a3923ad7d3af9d2e0e0c22bb29bac4bfa97a9758b43700bd3"],
  ["bomb/urchin-v1","bomb","urchin-v1",8364,"63d61feff050c284f2e3a228d345ea794c25bab48ab56cd4801d554c923def85"],
  ["directional-arrow/outline-v1","directional-arrow","outline-v1",2876,"2355b83eaa954354685ac92f91d72558002d7439aea906494a2f20056d8056ce"],
  ["guard/shield-v1","guard","shield-v1",2848,"50eb6b6835ec6f2acfceb866d53a8f3f8b424d48259ac59c74a39f5bab731eee"],
  ["track/blue-glass-v1","track","blue-glass-v1",2208,"802088bad3cc9174e7a94ae769ec5cdbf28b3942c08dc2b369216b5aeb1cfee6"],
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
