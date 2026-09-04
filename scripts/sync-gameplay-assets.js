// @ts-check

import {createHash} from "node:crypto";
import {chmod,cp,mkdir,readFile,readdir,rm,stat} from "node:fs/promises";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const expectedCommit="7dec076e243571144b7ead638d3e3f4780bcb9f4";
const expectedSourceTree="62863270ed4455eee7132d9bb374522a46f72e30";
const expectedInventoryHash="ba3f40ad3b178da9845a74c89d3a89115d13fa5bd86b291bf41031df70eabbf4";
const expectedProofHash="ebeb42ffaa351bcdbd7ae8120b62762d16d8957acd8a4b1286b324ffa5e6cfdb";
const expectedSetHash="3d72e1b488c2e9691d713b6dbcc84860bdf1790f82a1a210ae5b3d7bb71a1e2d";
const expectedReleaseTree="846c41297230b5077ab1119880b729cc120e1098";
const release="0.0.7";
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
if(commit!==expectedCommit)throw new Error(`asset source HEAD must equal pinned creator commit: ${commit}`);
const sourceTree=execFileSync("git",["rev-parse","HEAD^{tree}"],{cwd:source,encoding:"utf8"}).trim();
if(sourceTree!==expectedSourceTree)throw new Error(`asset source tree mismatch: ${sourceTree}`);
const pinnedReleaseTree=execFileSync("git",["rev-parse",`${expectedCommit}:release/raw/${release}`],{cwd:source,encoding:"utf8"}).trim(),currentReleaseTree=execFileSync("git",["rev-parse",`${commit}:release/raw/${release}`],{cwd:source,encoding:"utf8"}).trim();
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
const markerClaim=proof.claims?.athlete_marker;
if(markerClaim?.runtime_tint_material!=="mat/tint_base"||JSON.stringify(markerClaim.structural_materials)!==JSON.stringify(["mat/white","mat/charcoal"])||markerClaim.alpha_mode!=="OPAQUE"||markerClaim.depth_test!==true||markerClaim.depth_write!==true||markerClaim.winding!=="outward-ccw")throw new Error("source marker material/depth/culling contract mismatch");
for(const {path:relative} of inventory.payload.filter(({path:relative})=>relative.endsWith(".glb")&&relative!=="athlete-marker/sphere-v1.glb")){
  const currentBytes=await readFile(path.join(sourceRelease,relative)),predecessorBytes=await readFile(path.join(source,"release/raw/0.0.6",relative));
  if(!currentBytes.equals(predecessorBytes))throw new Error(`non-marker GLB drifted from 0.0.6: ${relative}`);
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
