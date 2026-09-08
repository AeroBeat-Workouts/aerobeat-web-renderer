// @ts-check

import {createHash} from "node:crypto";
import {chmod,cp,mkdir,readFile,readdir,rm,stat} from "node:fs/promises";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const expectedReleaseCommit="6c8f9e09037e880de55af265212533b64e5800ca";
const expectedReleaseSourceTree="15b66a5916cc9b3bd441eff1d0063913aa6eb124";
const expectedAuditCommit="2f93b563e1363cf61e27d5e0b893b428b76dc569";
const expectedAuditTree="f3d72488311e05f1070d1a78749cc8cd721e369e";
const expectedInventoryHash="95ec22c1657d4931e42327e0544b86f782075288a3330a4d23b0fed07dce65fa";
const expectedProofHash="e1726ca2bc3a0980cc86ba6184bf7da57079f7ee1e42e24094c47196a3dbace9";
const expectedSetHash="ef9984842bbca55de52f0898ca86f90877e4fcff1503550310b2f35f3d7c1892";
const expectedReleaseTree="541b693eabc11c716adca84931015213055ebfe8";
const release="0.0.9";
const rendererRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const defaultSource=path.resolve(rendererRoot,"../aerobeat-asset-gameplay");
const args=process.argv.slice(2);
const mode=args.includes("--sync")?"sync":args.includes("--verify")?"verify":null;
const sourceArg=args.indexOf("--source");
const source=path.resolve(sourceArg>=0?args[sourceArg+1]:defaultSource);
const sourceRelease=path.join(source,"release/raw",release);
const packageRoot=path.join(rendererRoot,"assets/gameplay");
const target=path.join(packageRoot,release);
if(!mode)throw new Error("Usage: node scripts/sync-gameplay-assets.js (--sync|--verify) [--source PATH]");
if(sourceArg>=0&&!args[sourceArg+1])throw new Error("--source requires a path");

const commit=execFileSync("git",["rev-parse","HEAD"],{cwd:source,encoding:"utf8"}).trim();
const auditTree=execFileSync("git",["rev-parse",`${expectedAuditCommit}^{tree}`],{cwd:source,encoding:"utf8"}).trim();
if(commit!==expectedAuditCommit||auditTree!==expectedAuditTree)throw new Error(`asset source HEAD/audit tree mismatch: ${commit}/${auditTree}`);
const releaseSourceTree=execFileSync("git",["rev-parse",`${expectedReleaseCommit}^{tree}`],{cwd:source,encoding:"utf8"}).trim();
if(releaseSourceTree!==expectedReleaseSourceTree)throw new Error(`asset release source tree mismatch: ${releaseSourceTree}`);
try{execFileSync("git",["merge-base","--is-ancestor",expectedReleaseCommit,expectedAuditCommit],{cwd:source,stdio:"ignore"});}
catch{throw new Error("pinned asset audit must descend from pinned release commit");}
const pinnedReleaseTree=execFileSync("git",["rev-parse",`${expectedReleaseCommit}:release/raw/${release}`],{cwd:source,encoding:"utf8"}).trim(),currentReleaseTree=execFileSync("git",["rev-parse",`${commit}:release/raw/${release}`],{cwd:source,encoding:"utf8"}).trim();
if(pinnedReleaseTree!==expectedReleaseTree)throw new Error(`pinned asset release tree mismatch: ${pinnedReleaseTree}`);
if(currentReleaseTree!==expectedReleaseTree)throw new Error(`current asset release tree drifted: ${currentReleaseTree}`);
const sourceStatus=execFileSync("git",["status","--porcelain","--untracked-files=all"],{cwd:source,encoding:"utf8"}).trim();
if(sourceStatus)throw new Error("asset source worktree is not fully clean");

const sha256=(bytes)=>createHash("sha256").update(bytes).digest("hex");
const inventoryBytes=await readFile(path.join(sourceRelease,"inventory.v1.json"));
const proofBytes=await readFile(path.join(sourceRelease,"proof.v1.json"));
if(sha256(inventoryBytes)!==expectedInventoryHash)throw new Error("source inventory hash mismatch");
if(sha256(proofBytes)!==expectedProofHash)throw new Error("source proof hash mismatch");
const inventory=JSON.parse(inventoryBytes.toString("utf8"));
const proof=JSON.parse(proofBytes.toString("utf8"));
if(inventory.expected_asset_count!==7||inventory.immutable!==true||inventory.payload.length!==15)throw new Error("source inventory contract mismatch");
if(proof.release!==release||proof.inventory_sha256!==expectedInventoryHash)throw new Error("source proof contract mismatch");
const setEntry=inventory.payload.find(({path:relative})=>relative==="sets/default-v1.json");
if(setEntry?.sha256!==expectedSetHash)throw new Error("source set identity mismatch");
const expectedWall={adjacent_gap:[.06,.06],adjacent_instances_overlap:false,cell_pitch:[1,1],centered_pivot:true,closed_body:true,source_dimensions:[.94,.94,1],unit_cell_footprint:[.94,.94],xy_scale_authoritative:[1,1],z_scale_authoritative:true};
if(JSON.stringify(proof.claims?.wall)!==JSON.stringify(expectedWall))throw new Error("source wall contract mismatch");
const markerManifest=JSON.parse(await readFile(path.join(sourceRelease,"manifests/athlete-marker/sphere-v1.v1.json"),"utf8")),markerContract=markerManifest.materials?.contract;
if(markerContract?.runtime_tint_material!=="mat/tint_base"||JSON.stringify(markerContract.structural_materials)!==JSON.stringify(["mat/white","mat/charcoal"])||markerContract.alpha_mode!=="OPAQUE"||markerContract.depth_test!==true||markerContract.depth_write!==true||markerContract.winding!=="outward-ccw")throw new Error("source marker material/depth/culling contract mismatch");
const cueContracts=[
  ["directional-arrow/rounded-outline-v1","note_fill",true,"mat/tint_base"],
  ["any-note/outlined-circle-v1","note_fill",true,"mat/tint_base"],
  ["guard/outlined-shield-v1","guard_fill",false,"mat/green"]
];
for(const [identity,fillRole,runtimeTintable,fillMaterial] of cueContracts){
  const manifest=JSON.parse(await readFile(path.join(sourceRelease,`manifests/${identity}.v1.json`),"utf8")),contract=manifest.materials?.contract;
  const expectedOrder=["outline_charcoal","outline_white","outline_charcoal",fillRole];
  if(manifest.identity?.canonical_name!==identity||contract?.fill_material!==fillMaterial||contract?.runtime_tintable!==runtimeTintable||contract?.runtime_tint_material!==(runtimeTintable?fillMaterial:null)||JSON.stringify(contract?.face_band_order)!==JSON.stringify(expectedOrder)||contract?.styled_faces?.join(",")!=="+Z,-Z"||contract?.blend!=="opaque"||contract?.cull!=="back"||contract?.depth_test!==true||contract?.depth_write!==true)throw new Error(`source cue material-role contract mismatch: ${identity}`);
}
for(const relative of ["athlete-marker/sphere-v1.glb","bomb/urchin-v1.glb","track/blue-glass-v1.glb","wall/red-glass-v1.glb"]){
  const currentBytes=await readFile(path.join(sourceRelease,relative)),predecessorBytes=await readFile(path.join(source,"release/raw/0.0.7",relative));
  if(!currentBytes.equals(predecessorBytes))throw new Error(`unchanged GLB drifted from 0.0.7: ${relative}`);
}
const expectedFiles=[...inventory.payload.map(({path:relative})=>relative),"inventory.v1.json","proof.v1.json"].sort();
if(expectedFiles.length!==17||new Set(expectedFiles).size!==17)throw new Error("source exact inventory mismatch");

async function makeDirectoriesWritable(root){
  let entries;
  try{entries=await readdir(root,{withFileTypes:true});}catch(error){if(error?.code==="ENOENT")return;throw error;}
  await chmod(root,0o755);
  for(const entry of entries)if(entry.isDirectory())await makeDirectoriesWritable(path.join(root,entry.name));
}
async function filesUnder(root,current=""){
  const result=[];
  for(const entry of await readdir(path.join(root,current),{withFileTypes:true})){
    const relative=path.posix.join(current,entry.name);
    if(entry.isDirectory())result.push(...await filesUnder(root,relative));else if(entry.isFile())result.push(relative);else throw new Error(`unsupported release entry: ${relative}`);
  }
  return result.sort();
}
async function verifyTree(root,label){
  const actual=await filesUnder(root);
  if(JSON.stringify(actual)!==JSON.stringify(expectedFiles))throw new Error(`${label} exact inventory mismatch\nexpected ${expectedFiles.join("\n")}\nactual ${actual.join("\n")}`);
  for(const item of inventory.payload){
    const bytes=await readFile(path.join(root,item.path));
    if(bytes.byteLength!==item.bytes||sha256(bytes)!==item.sha256)throw new Error(`${label} payload mismatch: ${item.path}`);
  }
  const inv=await readFile(path.join(root,"inventory.v1.json")),proofFile=await readFile(path.join(root,"proof.v1.json"));
  if(sha256(inv)!==expectedInventoryHash||sha256(proofFile)!==expectedProofHash)throw new Error(`${label} release metadata mismatch`);
}
await verifyTree(sourceRelease,"source");
if(mode==="sync"){
  await makeDirectoriesWritable(packageRoot);
  await rm(packageRoot,{recursive:true,force:true});
  await mkdir(packageRoot,{recursive:true});
  await cp(sourceRelease,target,{recursive:true,preserveTimestamps:false});
}
await stat(target);
await verifyTree(target,"renderer");
const packagedReleases=(await readdir(path.join(rendererRoot,"assets/gameplay"),{withFileTypes:true})).filter((entry)=>entry.isDirectory()).map((entry)=>entry.name).sort();
if(JSON.stringify(packagedReleases)!==JSON.stringify([release]))throw new Error(`renderer gameplay releases drifted: ${packagedReleases.join(",")}`);
console.log(`${mode} gameplay ${release}: ${expectedFiles.length} exact files, inventory ${expectedInventoryHash}, proof ${expectedProofHash}, source ${commit}`);
