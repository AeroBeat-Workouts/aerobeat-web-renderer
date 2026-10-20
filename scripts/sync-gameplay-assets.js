// @ts-check

import {createHash} from "node:crypto";
import {readFile,readdir,stat} from "node:fs/promises";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const expectedReleaseCommit="54e83d89264b2cedbdcc616ddd7c8b386ac9e204";
const expectedReleaseSourceTree="3122baa63d481173992a637ad275d2aec6f3ec37";
const expectedAuditCommit="cf38fa7c61030f4a9f38e228563d5dd820b5ed04";
const expectedAuditTree="3da9af7827efb93d0a7f6a25d61769ed6fce9910";
const expectedSourceInventoryHash="e9fb5d662b5e07b6c5f75ccf49185ddae2c2dddede9940e3e5661c5eddc21042";
const expectedSourceProofHash="11f14d2bc2f172b2e79544532c260b9b3fcc049ee464b2ab24ab2b43c7cb4c0f";
const expectedInventoryHash="77e90badd35b8e21460045f05ab669d624bd6249b1b248609f32778b48660123";
const expectedProofHash="0bbf78d723babd15150b8dfbf544f5b289673bdf98f9ddc738c46fa682d1ebdb";
const expectedSetHash="50a9c8cf1a59e23338a08bb6b08f4c879467294ef86e4f4d869a9ca3673b1363";
const expectedReleaseTree="e01a56f3b1f1dd53444a8cbcb1b7fa7f21f45faf";
const release="0.0.13",predecessorRelease="0.0.12";
const rendererRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const defaultSource=path.resolve(rendererRoot,"../aerobeat-asset-gameplay");
const args=process.argv.slice(2),mode=args.includes("--verify")?"verify":null,sourceArg=args.indexOf("--source");
const source=path.resolve(sourceArg>=0?args[sourceArg+1]:defaultSource),sourceRelease=path.join(source,"release/raw",release),packageRoot=path.join(rendererRoot,"assets/gameplay"),target=path.join(packageRoot,release);
if(!mode)throw new Error("Usage: node scripts/sync-gameplay-assets.js --verify [--source PATH]");
if(sourceArg>=0&&!args[sourceArg+1])throw new Error("--source requires a path");
const commit=execFileSync("git",["rev-parse","HEAD"],{cwd:source,encoding:"utf8"}).trim();
const auditTree=execFileSync("git",["rev-parse",`${expectedAuditCommit}^{tree}`],{cwd:source,encoding:"utf8"}).trim();
if(commit!==expectedAuditCommit||auditTree!==expectedAuditTree)throw new Error(`asset source HEAD/audit tree mismatch: ${commit}/${auditTree}`);
const releaseSourceTree=execFileSync("git",["rev-parse",`${expectedReleaseCommit}^{tree}`],{cwd:source,encoding:"utf8"}).trim();
if(releaseSourceTree!==expectedReleaseSourceTree)throw new Error("asset release source tree mismatch");
try{execFileSync("git",["merge-base","--is-ancestor",expectedReleaseCommit,expectedAuditCommit],{cwd:source,stdio:"ignore"});}catch{throw new Error("pinned asset audit must descend from pinned release commit");}
const pinnedReleaseTree=execFileSync("git",["rev-parse",`${expectedReleaseCommit}:release/raw/${release}`],{cwd:source,encoding:"utf8"}).trim(),currentReleaseTree=execFileSync("git",["rev-parse",`${commit}:release/raw/${release}`],{cwd:source,encoding:"utf8"}).trim();
if(pinnedReleaseTree!==expectedReleaseTree||currentReleaseTree!==expectedReleaseTree)throw new Error("immutable asset release tree drifted");
const sourceStatus=execFileSync("git",["status","--porcelain","--untracked-files=all"],{cwd:source,encoding:"utf8"}).trim();
if(sourceStatus)throw new Error("asset source worktree is not fully clean");

const sha256=(bytes)=>createHash("sha256").update(bytes).digest("hex");
const sourceInventoryBytes=await readFile(path.join(sourceRelease,"inventory.v1.json"));
const sourceProofBytes=await readFile(path.join(sourceRelease,"proof.v1.json"));
if(sha256(sourceInventoryBytes)!==expectedSourceInventoryHash)throw new Error("source inventory hash mismatch");
if(sha256(sourceProofBytes)!==expectedSourceProofHash)throw new Error("source proof hash mismatch");
const sourceInventory=JSON.parse(sourceInventoryBytes.toString("utf8"));
const sourceProof=JSON.parse(sourceProofBytes.toString("utf8"));
if(sourceInventory.expected_asset_count!==9||sourceInventory.immutable!==true||sourceInventory.payload.length!==19)throw new Error("source inventory contract mismatch");
if(sourceProof.release!==release||sourceProof.inventory_sha256!==expectedSourceInventoryHash||sourceProof.predecessor!==predecessorRelease||JSON.stringify(sourceProof.changed_identities)!==JSON.stringify(["knee-pad/segmented-lightwrap-v1","knee-target/hover-shell-strike-v1"]))throw new Error("source proof contract mismatch");
const targetInventoryBytes=await readFile(path.join(target,"inventory.v1.json")),targetProofBytes=await readFile(path.join(target,"proof.v1.json"));
if(sha256(targetInventoryBytes)!==expectedInventoryHash||sha256(targetProofBytes)!==expectedProofHash)throw new Error("target inventory/proof hash mismatch");
const inventory=JSON.parse(targetInventoryBytes.toString("utf8")),proof=JSON.parse(targetProofBytes.toString("utf8"));
if(inventory.expected_asset_count!==11||inventory.immutable!==true||inventory.payload.length!==21||proof.release!==release||proof.inventory_sha256!==expectedInventoryHash||proof.source_inventory_sha256!==expectedSourceInventoryHash||proof.source_proof_sha256!==expectedSourceProofHash)throw new Error("target release contract mismatch");
if(inventory.payload.find(({path:relative})=>relative==="sets/default-v1.json")?.sha256!==expectedSetHash)throw new Error("source set identity mismatch");
for(const item of sourceInventory.payload){const packaged=inventory.payload.find((entry)=>entry.path===item.path);if(!packaged||packaged.sha256!==item.sha256||packaged.bytes!==item.bytes)throw new Error(`packaged owner asset drifted: ${item.path}`);}
const predecessorRoot=path.join(packageRoot,predecessorRelease),predecessorInventoryBytes=await readFile(path.join(predecessorRoot,"inventory.v1.json")),predecessorProofBytes=await readFile(path.join(predecessorRoot,"proof.v1.json"));
if(sha256(predecessorInventoryBytes)!=="a7a4902e7aa0bf92da8179dd4149e4e241e04ac64d0b9887d66151dacbf30231"||sha256(predecessorProofBytes)!=="f37bb12bc3cafc53e0e3314c95e8bd0551a76a1366ee16e9af4adcb522dc9910")throw new Error("predecessor metadata drifted");
const predecessorInventory=JSON.parse(predecessorInventoryBytes.toString("utf8"));
for(const item of predecessorInventory.payload){const bytes=await readFile(path.join(predecessorRoot,item.path));if(bytes.length!==item.bytes||sha256(bytes)!==item.sha256)throw new Error(`predecessor payload drifted: ${item.path}`);if(item.path.endsWith(".glb")){const packaged=inventory.payload.find((entry)=>entry.path===item.path);if(!packaged||packaged.sha256!==item.sha256||packaged.bytes!==item.bytes)throw new Error(`packaged predecessor GLB drifted: ${item.path}`);}}
for(const item of inventory.payload.filter(({path:relative})=>relative.startsWith("flow-saber/")||relative.startsWith("boxing-glove/"))){const original=predecessorInventory.payload.find((entry)=>entry.path===item.path);if(!original||original.sha256!==item.sha256||original.bytes!==item.bytes)throw new Error(`renderer retained asset drifted: ${item.path}`);}
for(const [identity,hash] of [["knee-target/hover-shell-strike-v1","ab9237a84cb01a4965a0aa7b929c4300652548b043655ec2998b9772e0c6fbb6"],["knee-pad/segmented-lightwrap-v1","2dc4a861acb672d177654123bcb06a9b7155ac5a9cedc4fe860fa24e644a1326"]]){
  if(inventory.payload.find(({path:relative})=>relative===`${identity}.glb`)?.sha256!==hash)throw new Error(`knee GLB pin drifted: ${identity}`);
  const manifest=JSON.parse(await readFile(path.join(sourceRelease,`manifests/${identity}.v1.json`),"utf8"));
  if(manifest.identity?.canonical_name!==identity||manifest.files?.release_sha256!==hash||manifest.release!==release)throw new Error(`knee manifest drifted: ${identity}`);
}
const expectedSourceFiles=[...sourceInventory.payload.map(({path:relative})=>relative),"inventory.v1.json","proof.v1.json"].sort(),expectedTargetFiles=[...inventory.payload.map(({path:relative})=>relative),"inventory.v1.json","proof.v1.json"].sort();
if(expectedSourceFiles.length!==21||new Set(expectedSourceFiles).size!==21||expectedTargetFiles.length!==23||new Set(expectedTargetFiles).size!==23)throw new Error("release exact inventory mismatch");

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
  const isSource=label==="source";
  const expected=isSource?expectedSourceFiles:expectedTargetFiles;
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(`${label} exact inventory mismatch\nexpected ${expected.join("\n")}\nactual ${actual.join("\n")}`);
  const invPayload=isSource?sourceInventory.payload:inventory.payload;
  for(const item of invPayload){
    const bytes=await readFile(path.join(root,item.path));
    if(bytes.byteLength!==item.bytes||sha256(bytes)!==item.sha256)throw new Error(`${label} payload mismatch: ${item.path}`);
  }
  const inv=await readFile(path.join(root,"inventory.v1.json")),proofFile=await readFile(path.join(root,"proof.v1.json"));
  const expectedInv=isSource?expectedSourceInventoryHash:expectedInventoryHash;
  const expectedPrf=isSource?expectedSourceProofHash:expectedProofHash;
  if(sha256(inv)!==expectedInv||sha256(proofFile)!==expectedPrf)throw new Error(`${label} release metadata mismatch`);
}
await verifyTree(sourceRelease,"source");
// This installed release is immutable. Future successor sync must stage only a fresh
// version beside both retained releases; never remove or replace either existing tree.
await stat(target);
await verifyTree(target,"target");
const packagedReleases=(await readdir(path.join(rendererRoot,"assets/gameplay"),{withFileTypes:true})).filter((entry)=>entry.isDirectory()).map((entry)=>entry.name).sort();
if(JSON.stringify(packagedReleases)!==JSON.stringify(["0.0.11",predecessorRelease,release]))throw new Error(`renderer gameplay releases drifted: ${packagedReleases.join(",")}`);
// Historical 0.0.11 and 0.0.12 remain untouched; do not select either for new frames.
const historicalRoot=path.join(packageRoot,"0.0.11"),historicalInventoryBytes=await readFile(path.join(historicalRoot,"inventory.v1.json")),historicalProofBytes=await readFile(path.join(historicalRoot,"proof.v1.json"));
if(sha256(historicalInventoryBytes)!=="b043fe4f039f34527aae229224e0fb1f4069848b67ea5a89a51d732f063cac29"||sha256(historicalProofBytes)!=="a3c9ffbd4d07fa2d8b0810d8b22210145c35a479d87399c5ac87060f7b7614d3")throw new Error("historical 0.0.11 metadata drifted");
const historicalInventory=JSON.parse(historicalInventoryBytes.toString("utf8"));
if(JSON.stringify(await filesUnder(historicalRoot))!==JSON.stringify([...historicalInventory.payload.map((entry)=>entry.path),"inventory.v1.json","proof.v1.json"].sort()))throw new Error("historical inventory drifted");
for(const item of historicalInventory.payload){const bytes=await readFile(path.join(historicalRoot,item.path));if(bytes.length!==item.bytes||sha256(bytes)!==item.sha256)throw new Error(`historical payload drifted: ${item.path}`);}
console.log(`${mode} gameplay ${release}: source ${expectedSourceFiles.length} files, target ${expectedTargetFiles.length} files, source inv ${expectedSourceInventoryHash}, target inv ${expectedInventoryHash}, source proof ${expectedSourceProofHash}, target proof ${expectedProofHash}, source ${commit}`);
