// @ts-check

export const gameplayAssetReleaseVersion="0.0.5";
export const gameplayAssetSourceCommit="2bd4712f00dd65a758aa064d0e709131f8af8c64";
export const gameplayAssetInventorySha256="4984cca24b8121bc6657153304726f1f7ef05d878ca5220f3c3e2b6f2457a102";
export const gameplayAssetProofSha256="4aac2274a9803a05e9ff533c02958cf1c5def66e0af1bf2fae3cc4479319f350";

const definitions=[
  ["any-note/circle-v1","any-note","circle-v1",5616,"0cd90824251657825a9c84499a43a59ce7e39112e32f9903b1e1836c2466945e"],
  ["athlete-marker/sphere-v1","athlete-marker","sphere-v1",3036,"be91826b05a9643a3923ad7d3af9d2e0e0c22bb29bac4bfa97a9758b43700bd3"],
  ["bomb/urchin-v1","bomb","urchin-v1",8364,"63d61feff050c284f2e3a228d345ea794c25bab48ab56cd4801d554c923def85"],
  ["directional-arrow/outline-v1","directional-arrow","outline-v1",3832,"1a1ffd53d02e07da8ba098e940d3a53d0041d1e865fe9a9682b19c721bccf513"],
  ["guard/shield-v1","guard","shield-v1",2848,"50eb6b6835ec6f2acfceb866d53a8f3f8b424d48259ac59c74a39f5bab731eee"],
  ["track/blue-glass-v1","track","blue-glass-v1",2480,"46cb72ed47a235e9bf40305bac2355b02ca47aa6b39278503cd6fc1b32cef987"],
  ["wall/red-glass-v1","wall","red-glass-v1",3692,"1227bfbb7d5379b33f1468c1a0d7fffad07c9390654b54033f079ba602a84a37"]
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
