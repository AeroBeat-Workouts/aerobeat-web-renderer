// @ts-check

import {mkdtemp,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {execFileSync,spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const releaseSourceTree="15b66a5916cc9b3bd441eff1d0063913aa6eb124";
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
  const unrelated=git(["commit-tree",releaseSourceTree,"-m","disposable unrelated root"],{env});
  git(["checkout","--quiet","--detach",unrelated]);
  expectFailure("non-authority checkout","asset source HEAD/audit tree mismatch");

  git(["checkout","--quiet","main"]);
  await writeFile(path.join(fixture,"untracked-provenance-probe"),"dirty\n");
  expectFailure("dirty worktree","asset source worktree is not fully clean");
  await rm(path.join(fixture,"untracked-provenance-probe"));

  console.log("Gameplay asset provenance fixture checks passed: exact clean audit authority accepted; non-authority checkout and dirty worktree rejected.");
}finally{
  await rm(temporaryRoot,{recursive:true,force:true});
}
