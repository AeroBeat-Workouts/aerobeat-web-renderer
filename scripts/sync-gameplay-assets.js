// @ts-check

import {createHash} from "node:crypto";
import {readFile,readdir,stat} from "node:fs/promises";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const expectedReleaseCommit="398d0370af86fbb7c411845139990f9e0be11cb6";
const expectedReleaseSourceTree="90773e1b3254f640bf7d082ef1d7eac8b6259ecc";
const expectedAuditCommit=expectedReleaseCommit;
const expectedAuditTree=expectedReleaseSourceTree;
// The asset owner ships seven 0.0.12 GLBs; this renderer retains its two independently
// pinned Flow-saber/Boxing-glove GLBs in one nine-asset packaged inventory/proof.
const expectedSourceInventoryHash="1a6846e7d5ef92e2a271dfb2acecfbb1295ed3ab2bad3d4abc306b5930044eb9";
const expectedSourceProofHash="6fc8937bbba25296de9110ffa20a7526d877df70be1d078cf064b176ff4d81fd";
const expectedInventoryHash="a7a4902e7aa0bf92da8179dd4149e4e241e04ac64d0b9887d66151dacbf30231";
const expectedProofHash="f37bb12bc3cafc53e0e3314c95e8bd0551a76a1366ee16e9af4adcb522dc9910";
const expectedSetHash="bfdc33a670cde20ef19878b9fb445f5ecb5563802aa6ae2d351cf665a2f0e3f0";
const expectedMarkerGlbHash="f376934f218a25c11f2f31928c67684611aaf9c73aa1724548682ae280b5cbcc";
const expectedReleaseTree="08e8f8524d6e6642c65d5842ab05ec2095a30b97";
const release="0.0.12";
const predecessorRelease="0.0.11";
const rendererRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const defaultSource=path.resolve(rendererRoot,"../aerobeat-asset-gameplay");
const args=process.argv.slice(2);
const mode=args.includes("--verify")?"verify":args.includes("--sync")?"sync":null;
const sourceArg=args.indexOf("--source");
const source=path.resolve(sourceArg>=0?args[sourceArg+1]:defaultSource);
const sourceRelease=path.join(source,"release/raw",release);
const packageRoot=path.join(rendererRoot,"assets/gameplay");
const target=path.join(packageRoot,release);
if(!mode)throw new Error("Usage: node scripts/sync-gameplay-assets.js --verify [--source PATH]");
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
const sourceStatus=execFileSync("git",["status","--porcelain","--untracked-files=all"],{cwd:source,encoding:"utf8"}).trim().split("\n").filter((line)=>line.trim()!=="");
const protectedLedger=" M .beads/interactions.jsonl";
if(!(sourceStatus.length===0||(sourceStatus.length===1&&sourceStatus[0]===protectedLedger)))throw new Error(`asset source worktree is not fully clean or carries only the exact protected unstaged ledger export: ${JSON.stringify(sourceStatus)}`);

const sha256=(bytes)=>createHash("sha256").update(bytes).digest("hex");
const sourceInventoryBytes=await readFile(path.join(sourceRelease,"inventory.v1.json"));
const sourceProofBytes=await readFile(path.join(sourceRelease,"proof.v1.json"));
if(sha256(sourceInventoryBytes)!==expectedSourceInventoryHash)throw new Error("source inventory hash mismatch");
if(sha256(sourceProofBytes)!==expectedSourceProofHash)throw new Error("source proof hash mismatch");
const sourceInventory=JSON.parse(sourceInventoryBytes.toString("utf8"));
const sourceProof=JSON.parse(sourceProofBytes.toString("utf8"));
if(sourceInventory.expected_asset_count!==7||sourceInventory.immutable!==true||sourceInventory.payload.length!==15)throw new Error("source inventory contract mismatch");
if(sourceProof.release!==release||sourceProof.inventory_sha256!==expectedSourceInventoryHash)throw new Error("source proof contract mismatch");
// The renderer target inventory (9 entries, flow-saber + boxing-glove added) is what the
// validators + assembly consume. Parse it from the target tree.
const targetInventoryBytes=await readFile(path.join(target,"inventory.v1.json"));
const targetProofBytes=await readFile(path.join(target,"proof.v1.json"));
if(sha256(targetInventoryBytes)!==expectedInventoryHash)throw new Error("target inventory hash mismatch");
if(sha256(targetProofBytes)!==expectedProofHash)throw new Error("target proof hash mismatch");
const inventory=JSON.parse(targetInventoryBytes.toString("utf8"));
const proof=JSON.parse(targetProofBytes.toString("utf8"));
if(inventory.expected_asset_count!==9||inventory.immutable!==true||inventory.payload.length!==17)throw new Error("target inventory contract mismatch");
if(proof.release!==release||proof.inventory_sha256!==expectedInventoryHash)throw new Error("target proof contract mismatch");
const setEntry=inventory.payload.find(({path:relative})=>relative==="sets/default-v1.json");
if(setEntry?.sha256!==expectedSetHash)throw new Error("source set identity mismatch");
for(const sourceEntry of sourceInventory.payload){const packaged=inventory.payload.find((entry)=>entry.path===sourceEntry.path);if(!packaged||packaged.sha256!==sourceEntry.sha256||packaged.bytes!==sourceEntry.bytes)throw new Error(`packaged owner asset drifted: ${sourceEntry.path}`);}
const markerEntry=inventory.payload.find(({path:relative})=>relative==="athlete-marker/sphere-v1.glb");
if(markerEntry?.sha256!==expectedMarkerGlbHash||markerEntry?.bytes!==90520)throw new Error("source tint-dominant marker identity mismatch");
const expectedWall={adjacent_gap:[.06,.06],adjacent_instances_overlap:false,body_triangles:12,cell_pitch:[1,1],centered_pivot:true,closed_body:true,edge_cage:false,material_primitives:1,source_dimensions:[.94,.94,1],uniform_surface:true,unit_cell_footprint:[.94,.94],xy_scale_authoritative:[1,1],z_scale_authoritative:true};
if(JSON.stringify(proof.claims?.wall)!==JSON.stringify(expectedWall))throw new Error("source wall contract mismatch");
const expectedMarkerClaims={all_camera_directions:["+X","-X","+Y","-Y","+Z","-Z"],alpha_mode:"OPAQUE",canonical_identity:"athlete-marker/sphere-v1",canonical_instances:["nose","left-wrist","right-wrist"],coplanar_overlapping_faces:false,depth_test:true,depth_write:true,dimensions:[.18,.18,.18],explicit_normals:true,geometric_normal_agreement:true,keyline:"thin polar band (charcoal cap + white seam at each pole)",opacity:1.0,runtime_tint_material:"mat/tint_base",source_backface_culling:true,structural_materials:["mat/white","mat/charcoal"],tint_dominant:true,winding:"outward-ccw"};
if(JSON.stringify(proof.claims?.athlete_marker)!==JSON.stringify(expectedMarkerClaims))throw new Error("source tint-dominant marker proof contract mismatch");
const markerManifest=JSON.parse(await readFile(path.join(sourceRelease,"manifests/athlete-marker/sphere-v1.v1.json"),"utf8")),markerContract=markerManifest.materials?.contract;
if(markerContract?.runtime_tint_material!=="mat/tint_base"||JSON.stringify(markerContract.structural_materials)!==JSON.stringify(["mat/white","mat/charcoal"])||markerContract.alpha_mode!=="OPAQUE"||markerContract.depth_test!==true||markerContract.depth_write!==true||markerContract.winding!=="outward-ccw"||markerContract.tint_dominant!==true)throw new Error("source marker material/depth/culling contract mismatch");
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
for(const relative of ["directional-arrow/rounded-outline-v1.glb","any-note/outlined-circle-v1.glb","guard/outlined-shield-v1.glb","bomb/urchin-v1.glb","track/blue-glass-v1.glb","wall/red-glass-v1.glb"]){
  const currentBytes=await readFile(path.join(sourceRelease,relative)),predecessorBytes=await readFile(path.join(source,`release/raw/${predecessorRelease}`,relative));
  if(relative==="track/blue-glass-v1.glb"){
    if(currentBytes.equals(predecessorBytes))throw new Error("canonical 72-WU track did not change from 0.0.11");
  }else if(!currentBytes.equals(predecessorBytes))throw new Error(`unchanged GLB drifted from ${predecessorRelease}: ${relative}`);
}
// 0.0.62 L-C (r2lb r1a): the source tree has 7 GLBs (the asset-source commit
// predates the flow-saber). The target tree has 9 GLBs (flow-saber + boxing-glove added).
const trackManifest=JSON.parse(await readFile(path.join(sourceRelease,"manifests/track/blue-glass-v1.v1.json"),"utf8"));
const trackContract=trackManifest.materials?.contract;
if(JSON.stringify(trackManifest.geometry?.dimensions)!==JSON.stringify([4.2,.06,72])||JSON.stringify(trackContract?.rail_centers_x)!==JSON.stringify([-2,-1,0,1,2])||trackContract.beat_columns!==4||trackContract.segment_joins!==false||trackContract.continuous_depth!==72||trackManifest.files?.release_sha256!=="93e8dc45f7f6be58aa90ddc7a2def16b54b830ad6882b881fe72dc558f42dfba")throw new Error("source canonical four-column continuous track contract mismatch");
const expectedSourceFiles=[...sourceInventory.payload.map(({path:relative})=>relative),"inventory.v1.json","proof.v1.json"].sort();
if(expectedSourceFiles.length!==17||new Set(expectedSourceFiles).size!==17)throw new Error("source exact inventory mismatch");
const expectedTargetFiles=[...inventory.payload.map(({path:relative})=>relative),"inventory.v1.json","proof.v1.json"].sort();
if(expectedTargetFiles.length!==19||new Set(expectedTargetFiles).size!==19)throw new Error("target exact inventory mismatch");

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
// The immutable nine-asset package is authored once from the verified owner release
// plus the renderer's two existing equipment GLBs. Routine verification never rewrites it.
if(mode==="sync")throw new Error("Pinned 0.0.12 is immutable; verify the packaged release instead of replacing it");
await stat(target);
await verifyTree(target,"target");
const packagedReleases=(await readdir(path.join(rendererRoot,"assets/gameplay"),{withFileTypes:true})).filter((entry)=>entry.isDirectory()).map((entry)=>entry.name).sort();
if(JSON.stringify(packagedReleases)!==JSON.stringify([predecessorRelease,release]))throw new Error(`renderer gameplay releases drifted: ${packagedReleases.join(",")}`);
// Historical 0.0.11 is retained byte-identically; only 0.0.12 is selected by gameplay-assets.js.
const priorInventoryBytes=await readFile(path.join(packageRoot,predecessorRelease,"inventory.v1.json"));
const priorProofBytes=await readFile(path.join(packageRoot,predecessorRelease,"proof.v1.json"));
if(sha256(priorInventoryBytes)!=="b043fe4f039f34527aae229224e0fb1f4069848b67ea5a89a51d732f063cac29"||sha256(priorProofBytes)!=="a3c9ffbd4d07fa2d8b0810d8b22210145c35a479d87399c5ac87060f7b7614d3")throw new Error("historical 0.0.11 release metadata drifted");
const priorInventory=JSON.parse(priorInventoryBytes.toString("utf8"));
const priorFiles=[...priorInventory.payload.map((entry)=>entry.path),"inventory.v1.json","proof.v1.json"].sort();
if(JSON.stringify(await filesUnder(path.join(packageRoot,predecessorRelease)))!==JSON.stringify(priorFiles))throw new Error("historical 0.0.11 release inventory drifted");
for(const entry of priorInventory.payload){const bytes=await readFile(path.join(packageRoot,predecessorRelease,entry.path));if(bytes.length!==entry.bytes||sha256(bytes)!==entry.sha256)throw new Error(`historical 0.0.11 payload drifted: ${entry.path}`);}
console.log(`${mode} gameplay ${release}: source ${expectedSourceFiles.length} files, target ${expectedTargetFiles.length} files, source inv ${expectedSourceInventoryHash}, target inv ${expectedInventoryHash}, source proof ${expectedSourceProofHash}, target proof ${expectedProofHash}, source ${commit}`);
