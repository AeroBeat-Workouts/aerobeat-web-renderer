// @ts-check

export const gameplayAssetReleaseVersion="0.0.11";
export const gameplayAssetSourceCommit="a157d930a07e971ae905a51fdf613b6e7af9e7d2";
export const gameplayAssetSourceTree="d027617131fe2e291e451c5414169c52a6a5b867";
export const gameplayAssetAuditCommit="a157d930a07e971ae905a51fdf613b6e7af9e7d2";
export const gameplayAssetAuditTree="d027617131fe2e291e451c5414169c52a6a5b867";
export const gameplayAssetRawTree="af911e693622e5f21aa1f2c6f3321fb6541ed312";
export const gameplayAssetInventorySha256="e65571211e7a5a44224c378dbb654afd56263dc37f427a9b3f0af6453a6f1d23";
export const gameplayAssetProofSha256="0c194b1a8f290cfe387ee34154199cc0758ace8baf9b60fa4a3beb5bdddf4227";

const definitions=[
  ["any-note/outlined-circle-v1","any-note","outlined-circle-v1",142020,"eb1368f09fe3034b9690e18f17e066ea4af7d20522f7c3ee009888c01f5235a6"],
  ["athlete-marker/sphere-v1","athlete-marker","sphere-v1",90520,"f376934f218a25c11f2f31928c67684611aaf9c73aa1724548682ae280b5cbcc"],
  ["bomb/urchin-v1","bomb","urchin-v1",8364,"63d61feff050c284f2e3a228d345ea794c25bab48ab56cd4801d554c923def85"],
  ["directional-arrow/rounded-outline-v1","directional-arrow","rounded-outline-v1",152916,"75435bc79c0278da5488ab05d1a97ac409cdab390e10483748c30a5aa67ad7e4"],
  ["guard/outlined-shield-v1","guard","outlined-shield-v1",93944,"5c456ed0d6db8fbc500b7d9815ac72a2f5e40ae86ee582f01b80b40e4c03e09e"],
  ["track/blue-glass-v1","track","blue-glass-v1",2480,"46cb72ed47a235e9bf40305bac2355b02ca47aa6b39278503cd6fc1b32cef987"],
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
  ["athlete-marker/sphere-v1",new Map([["mat/charcoal","marker_structure_charcoal"],["mat/white","marker_structure_white"],["mat/tint_base","marker_fill"]])]
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
