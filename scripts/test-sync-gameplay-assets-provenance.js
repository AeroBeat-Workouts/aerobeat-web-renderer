// @ts-check

import {chmod,mkdtemp,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {execFileSync,spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const creatorCommit="8b190eecffdbdfc5dc914ea8e1d2f724bbcdc4d0";
const creatorTree="9469446a4ad018b5554ff453ebf357a205b042bd";
const rendererRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const canonicalSource=path.resolve(rendererRoot,"../aerobeat-asset-gameplay");
const validator=path.join(rendererRoot,"scripts/sync-gameplay-assets.js");
const temporaryRoot=await mkdtemp(path.join(os.tmpdir(),"aerobeat-renderer-provenance-"));
const fixture=path.join(temporaryRoot,"asset");

const git=(args,options={})=>execFileSync("git",args,{cwd:fixture,encoding:"utf8",...options}).trim();
const validate=()=>spawnSync(process.execPath,[validator,"--verify","--source",fixture],{cwd:rendererRoot,encoding:"utf8"});
const expectPass=(label)=>{
  const result=validate();
  if(result.status!==0)throw new Error(`${label} unexpectedly failed\n${result.stdout}${result.stderr}`);
};
const expectFailure=(label,fragment)=>{
  const result=validate(),output=`${result.stdout}${result.stderr}`;
  if(result.status===0||!output.includes(fragment))throw new Error(`${label} did not fail closed with ${JSON.stringify(fragment)}\n${output}`);
};

try{
  execFileSync("git",["clone","--shared","--quiet",canonicalSource,fixture],{encoding:"utf8"});
  git(["config","user.name","AeroBeat fixture"]);
  git(["config","user.email","fixture@invalid.example"]);

  expectPass("clean tooling descendant");

  const env={...process.env,GIT_AUTHOR_NAME:"AeroBeat fixture",GIT_AUTHOR_EMAIL:"fixture@invalid.example",GIT_COMMITTER_NAME:"AeroBeat fixture",GIT_COMMITTER_EMAIL:"fixture@invalid.example"};
  const unrelated=git(["commit-tree",creatorTree,"-m","disposable unrelated root"],{env});
  git(["checkout","--quiet","--detach",unrelated]);
  expectFailure("non-descendant checkout","asset source HEAD must descend from pinned creator commit");

  git(["checkout","--quiet","main"]);
  await writeFile(path.join(fixture,"untracked-provenance-probe"),"dirty\n");
  expectFailure("dirty worktree","asset source worktree is not fully clean");
  await rm(path.join(fixture,"untracked-provenance-probe"));

  const proofPath=path.join(fixture,"release/raw/0.0.8/proof.v1.json");
  await chmod(path.dirname(proofPath),0o755);
  await chmod(proofPath,0o644);
  await writeFile(proofPath,"{}\n");
  git(["add","release/raw/0.0.8/proof.v1.json"]);
  git(["commit","--quiet","-m","disposable raw release drift"]);
  expectFailure("raw release drift","current asset release tree drifted");

  console.log("Gameplay asset provenance fixture checks passed: clean descendant accepted; non-descendant, dirty worktree, and raw release drift rejected.");
}finally{
  await rm(temporaryRoot,{recursive:true,force:true});
}
