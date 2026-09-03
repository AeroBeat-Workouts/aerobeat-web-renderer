// @ts-check

import {createHash} from "node:crypto";
import {cp,readFile,readdir,rm,stat} from "node:fs/promises";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const expectedCommit="8b8b40593b9deb54d32654e39fd7c1c1c4a9dc1a";
const expectedInventoryHash="69b88d38113a56061dfc0ea5e92ec51a0b181fcade6a99e1dcc5df1baecdde03";
const expectedProofHash="287adc43a0456782044f0fd7601efd7b5087342972d9da4525923598754b1efc";
const release="0.0.3";
const rendererRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const defaultSource=path.resolve(rendererRoot,"../aerobeat-asset-gameplay");
const args=process.argv.slice(2);
const mode=args.includes("--sync")?"sync":args.includes("--verify")?"verify":null;
const sourceArg=args.indexOf("--source");
const source=path.resolve(sourceArg>=0?args[sourceArg+1]:defaultSource);
const sourceRelease=path.join(source,"release/raw",release);
const target=path.join(rendererRoot,"assets/gameplay",release);
if(!mode)throw new Error("Usage: node scripts/sync-gameplay-assets.js (--sync|--verify) [--source PATH]");
if(sourceArg>=0&&!args[sourceArg+1])throw new Error("--source requires a path");

const commit=execFileSync("git",["rev-parse","HEAD"],{cwd:source,encoding:"utf8"}).trim();
if(commit!==expectedCommit)throw new Error(`asset source commit mismatch: ${commit}`);
const sourceStatus=execFileSync("git",["status","--porcelain","--untracked-files=no"],{cwd:source,encoding:"utf8"}).trim();
if(sourceStatus)throw new Error("asset source tracked files are dirty");

const sha256=(bytes)=>createHash("sha256").update(bytes).digest("hex");
const inventoryBytes=await readFile(path.join(sourceRelease,"inventory.v1.json"));
const proofBytes=await readFile(path.join(sourceRelease,"proof.v1.json"));
if(sha256(inventoryBytes)!==expectedInventoryHash)throw new Error("source inventory hash mismatch");
if(sha256(proofBytes)!==expectedProofHash)throw new Error("source proof hash mismatch");
const inventory=JSON.parse(inventoryBytes.toString("utf8"));
const proof=JSON.parse(proofBytes.toString("utf8"));
if(inventory.expected_asset_count!==7||inventory.immutable!==true||inventory.payload.length!==15)throw new Error("source inventory contract mismatch");
if(proof.release!==release||proof.inventory_sha256!==expectedInventoryHash)throw new Error("source proof contract mismatch");
const expectedFiles=[...inventory.payload.map(({path:relative})=>relative),"inventory.v1.json","proof.v1.json"].sort();
if(expectedFiles.length!==17||new Set(expectedFiles).size!==17)throw new Error("source exact inventory mismatch");

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
  await rm(target,{recursive:true,force:true});
  await cp(sourceRelease,target,{recursive:true,preserveTimestamps:false});
}
await stat(target);
await verifyTree(target,"renderer");
const packagedReleases=(await readdir(path.join(rendererRoot,"assets/gameplay"),{withFileTypes:true})).filter((entry)=>entry.isDirectory()).map((entry)=>entry.name).sort();
if(JSON.stringify(packagedReleases)!==JSON.stringify([release]))throw new Error(`renderer gameplay releases drifted: ${packagedReleases.join(",")}`);
console.log(`${mode} gameplay ${release}: ${expectedFiles.length} exact files, inventory ${expectedInventoryHash}, proof ${expectedProofHash}, source ${commit}`);
