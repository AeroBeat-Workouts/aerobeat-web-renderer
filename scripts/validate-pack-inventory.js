// @ts-check

import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFile} from "node:fs/promises";

const metadata=JSON.parse(execFileSync("npm",["pack","--dry-run","--json","--ignore-scripts"],{encoding:"utf8"}))[0];
const inventory=JSON.parse(await readFile("assets/gameplay/0.0.11/inventory.v1.json","utf8"));
// 0.0.62 L-C (r2lb): the flow-saber GLB is a renderer-authored asset (built
// by scripts/blender/build-flow-saber-v1.py), NOT part of the asset-source
// inventory. It ships under assets/gameplay/0.0.11/flow-saber/ and is
// included in the npm package but NOT in the asset-source inventory payload.
const assetFiles=[...inventory.payload.map(({path})=>`assets/gameplay/0.0.11/${path}`),"assets/gameplay/0.0.11/flow-saber/flow-saber-v1.glb","assets/gameplay/0.0.11/inventory.v1.json","assets/gameplay/0.0.11/proof.v1.json"];
const packageFiles=[
 "LICENSE.md","README.md","docs/decisions/.gitkeep","docs/decisions/0002-playcanvas-world-gameplay-renderer.md","docs/decisions/0003-pinned-gameplay-asset-loader.md","docs/decisions/0004-assembly-environment-lifecycle.md","docs/decisions/flow-direction-cue-visibility-debug.md","docs/decisions/flow-perspective-exact-endpoint-debug.md","docs/decisions/flow-perspective-projection.md","docs/decisions/per-game-gameplay-renderer.md","docs/decisions/world-view-handedness-migration.md","docs/decisions/uniform-wall-browser-oracle-debug.md","package.json","src/test-presentation-config.js","src/gameplay-visual-experiment-config.js","src/environment-asset-owner.js","src/gameplay-asset-loader.js","src/gameplay-assets.js","src/gameplay-camera-pose.js","src/gameplay-scene-model.js","src/icon-atlas.js","src/index.js","src/landmark-mapping.js","src/renderer-facade.js","src/visual-profiles.js",
 ...assetFiles
].sort();
const actual=metadata.files.map(({path})=>path).sort();
assert.deepEqual(actual,packageFiles,"npm package inventory must remain exact");
assert.equal(metadata.entryCount,43);assert.equal(actual.filter((entry)=>entry.startsWith("assets/gameplay/0.0.11/")).length,18);assert.ok(actual.every((entry)=>!entry.endsWith(".blend")&&!entry.includes("/review/")&&!entry.includes("/0.0.1/")&&!entry.includes("/tools/")));assert.ok(actual.filter((entry)=>entry.endsWith(".glb")).every((entry)=>entry.startsWith("assets/gameplay/0.0.11/")),"package must contain no environment GLB");assert.equal(actual.filter((entry)=>/\.(?:jpe?g|png)$/u.test(entry)).length,0,"package must contain no environment image payload");
console.log(`Exact npm pack inventory passed: ${metadata.entryCount} files including 18 pinned gameplay release files (17 asset-source + 1 renderer-authored flow-saber).`);
