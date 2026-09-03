// @ts-check

import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFile} from "node:fs/promises";

const metadata=JSON.parse(execFileSync("npm",["pack","--dry-run","--json","--ignore-scripts"],{encoding:"utf8"}))[0];
const inventory=JSON.parse(await readFile("assets/gameplay/0.0.2/inventory.v1.json","utf8"));
const assetFiles=[...inventory.payload.map(({path})=>`assets/gameplay/0.0.2/${path}`),"assets/gameplay/0.0.2/inventory.v1.json","assets/gameplay/0.0.2/proof.v1.json"];
const packageFiles=[
 "LICENSE.md","README.md","docs/decisions/.gitkeep","docs/decisions/0002-playcanvas-world-gameplay-renderer.md","docs/decisions/0003-pinned-gameplay-asset-loader.md","docs/decisions/0004-assembly-environment-lifecycle.md","docs/decisions/flow-direction-cue-visibility-debug.md","docs/decisions/flow-perspective-exact-endpoint-debug.md","docs/decisions/flow-perspective-projection.md","docs/decisions/per-game-gameplay-renderer.md","docs/decisions/world-view-handedness-migration.md","package.json","src/environment-asset-owner.js","src/gameplay-asset-loader.js","src/gameplay-assets.js","src/gameplay-camera-pose.js","src/gameplay-scene-model.js","src/icon-atlas.js","src/index.js","src/landmark-mapping.js","src/renderer-facade.js","src/visual-profiles.js",
 ...assetFiles
].sort();
const actual=metadata.files.map(({path})=>path).sort();
assert.deepEqual(actual,packageFiles,"npm package inventory must remain exact");
assert.equal(metadata.entryCount,39);assert.equal(actual.filter((entry)=>entry.startsWith("assets/gameplay/0.0.2/")).length,17);assert.ok(actual.every((entry)=>!entry.endsWith(".blend")&&!entry.includes("/review/")&&!entry.includes("/0.0.1/")&&!entry.includes("/tools/")));assert.ok(actual.filter((entry)=>entry.endsWith(".glb")).every((entry)=>entry.startsWith("assets/gameplay/0.0.2/")),"package must contain no environment GLB");assert.equal(actual.filter((entry)=>/\.(?:jpe?g|png)$/u.test(entry)).length,0,"package must contain no environment image payload");
console.log(`Exact npm pack inventory passed: ${metadata.entryCount} files including 17 pinned gameplay release files.`);
