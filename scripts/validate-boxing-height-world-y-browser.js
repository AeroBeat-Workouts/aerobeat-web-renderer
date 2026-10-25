// @ts-check
// Native PlayCanvas regression: rerender the same already-visible target IDs at new world Y.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {extname,resolve} from "node:path";
import {chromium} from "playwright";

const root=process.cwd();
const server=createServer(async(request,response)=>{try{const relative=new URL(request.url??"/","http://127.0.0.1").pathname.slice(1),file=resolve(root,relative);if(!file.startsWith(`${root}/`))throw Error("outside root");const bytes=await readFile(file);response.writeHead(200,{"content-type":({".js":"text/javascript",".glb":"model/gltf-binary",".html":"text/html"})[extname(file)]??"application/octet-stream","cache-control":"no-store"}).end(bytes);}catch{response.writeHead(404).end();}});
await new Promise(done=>server.listen(0,"127.0.0.1",done));const address=server.address();if(!address||typeof address==="string")throw Error("testbed listen failed");const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1}),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/.testbed/demo/index.html`,{waitUntil:"networkidle"});
  await page.waitForFunction(()=>globalThis.__AERO_RENDERER_TEST__?.renderers[0].describe().gameplayAssets.state==="ready");
  const result=await page.evaluate(()=>{
    const renderer=globalThis.__AERO_RENDERER_TEST__.renderers[0];
    renderer.resize({widthCssPx:844,heightCssPx:390,devicePixelRatio:1});
    const targets=[
      {id:"straight",kind:"punch",family:"straight",hand:"left",cell:0,cells:[],lane:"left",beatCenterMs:1000},
      {id:"hook",kind:"punch",family:"hook",hand:"right",cell:7,cells:[],lane:"right",beatCenterMs:1000},
      {id:"uppercut",kind:"punch",family:"uppercut",hand:"left",cell:8,cells:[],lane:"left",beatCenterMs:1000},
      {id:"guard",kind:"guard",family:"guard",hand:"both",cell:null,cells:[4,7],lane:null,beatCenterMs:1000},
      {id:"knee",kind:"knee",family:"knee_left",hand:"left",cell:9,cells:[],lane:"left",beatCenterMs:1000}
    ];
    const frame={presentation:"boxing_collider",nowMs:950,targets,kneeEnabled:true,rowReach:{topRowReachWU:.4,bottomRowReachWU:.6}};
    const inspect=()=>[...renderer.assetPools.entries()].flatMap(([assetId,entries])=>entries.filter(e=>e.enabled&&["directional-arrow/rounded-outline-v1","any-note/outlined-circle-v1","guard/outlined-shield-v1","knee-target/hover-shell-strike-v1"].includes(assetId)).map(e=>({assetId,name:e.name,x:e.getPosition().x,y:e.getPosition().y,z:e.getPosition().z})));
    renderer.renderGameplayFrame(frame);const before=inspect();
    renderer.renderGameplayFrame({...frame,targets:targets.map(t=>({...t,heightWorldY:1.37}))});const after=inspect();
    renderer.renderGameplayFrame({...frame,targets:targets.map(t=>({...t,heightWorldY:-.2}))});const again=inspect();
    const flow={presentation:"flow",nowMs:950,targets:[{...targets[0],kind:"flow",family:"flow",heightWorldY:1.37}]};
    renderer.renderGameplayFrame(flow);const flowHeight=inspect();renderer.renderGameplayFrame({...flow,targets:[{...targets[0],kind:"flow",family:"flow"}]});const flowLegacy=inspect();
    return {before,after,again,flowHeight,flowLegacy};
  });
  assert.deepEqual(errors,[],"native render raises no page errors");
  for(const [label,entries,height] of [["raised",result.after,1.37],["lowered",result.again,-.2]]){
    assert.equal(entries.length,6,`${label}: five targets and both guard shields use real GLBs`);
    assert.ok(entries.every(e=>Math.abs(e.y-height)<1e-6),`${label}: all pooled native GLB roots use new same-ID Y`);
    assert.deepEqual(entries.map(e=>[e.assetId,e.x,e.z]),result.before.map(e=>[e.assetId,e.x,e.z]),`${label}: asset and X/Z parity`);
  }
  assert.deepEqual(result.flowHeight,result.flowLegacy,"Flow ignores private Boxer height");
  console.log("Native Chromium Boxer same-ID five-family/guard pair/knee target GLB re-render and Flow unchanged passed.");
}finally{await browser.close();await new Promise(done=>server.close(done));}
