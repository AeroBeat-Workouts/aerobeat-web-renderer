// Review-only native PlayCanvas capture. No production knee asset/kind or gameplay rule.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,normalize,extname} from 'node:path';
import {chromium} from 'playwright';

const root=process.cwd(),assets=resolve(root,'../aerobeat-asset-gameplay/candidates/knee-art-2026-10-20');
assert.ok(process.argv.length===2||process.argv.length===3&&process.argv[2]==='--face-player','Only optional --face-player is supported');
const facePlayer=process.argv[2]==='--face-player';
const out=resolve(root,facePlayer?'review/knee-art-2026-10-20-front-facing':'review/knee-art-2026-10-20');
const names=['open-prong-v1','chevron-v1','turtle-shell-strap-v1'];
const descriptors=await Promise.all([...names.map(name=>({type:'target',name,path:join(assets,'knee-target',name)})),{type:'pad',name:'dome-strap-v1',path:join(assets,'knee-pad/dome-strap-v1')}].map(async spec=>{
  const manifest=JSON.parse(await readFile(join(spec.path,'candidate-manifest.json'),'utf8'));
  const file=`${spec.name}.glb`,bytes=await readFile(join(spec.path,file));
  assert.equal(bytes.length,manifest.files[file].bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.files[file].sha256);
  assert.equal(manifest.status,'UNAPPROVED_CANDIDATE');
  return {...spec,sha256:manifest.files[file].sha256,bounds:manifest.bounds,materials:manifest.materials,url:`/candidate/${spec.type}/${spec.name}.glb`};
}));
const server=createServer(async(req,res)=>{try{
  const pathname=new URL(req.url??'/','http://127.0.0.1').pathname;
  let file,base;if(pathname.startsWith('/candidate/')){
    const match=/^\/candidate\/(target|pad)\/([a-z0-9-]+)\.glb$/.exec(pathname),spec=descriptors.find(d=>d.type===match?.[1]&&d.name===match?.[2]);
    if(!spec){res.writeHead(404).end();return;}file=join(spec.path,`${spec.name}.glb`);base=spec.path;
  }else if(pathname.startsWith('/branding/')){base=resolve(root,'../aerobeat-branding/icons/web-gameplay');file=join(base,pathname.slice(10));}
  else {base=root;file=join(root,pathname==='/'?'.testbed/demo/index.html':pathname.slice(1));}
  file=normalize(file);if(file!==base&&!file.startsWith(base+'/')){res.writeHead(403).end();return;}
  const bytes=await readFile(file);res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.glb':'model/gltf-binary'})[extname(file)]??'application/octet-stream','cache-control':'no-store'});res.end(bytes);
}catch{res.writeHead(404).end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const address=server.address();assert.ok(address&&typeof address!=='string');
const url=`http://127.0.0.1:${address.port}/.testbed/demo/index.html`;
let browser;
try{
  browser=await chromium.launch({headless:true});await mkdir(out,{recursive:true});
  const rows=[];
  for(const viewport of [{name:'landscape',width:844,height:390,dpr:1},{name:'phone',width:390,height:844,dpr:3}]){
    const page=await browser.newPage({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:viewport.dpr});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>globalThis.__AERO_RENDERER_TEST__?.renderers[0].describe().gameplayAssets.state==='ready');
    await page.evaluate(({width,height,dpr})=>{
      const primary=document.querySelector('#primary'),canvas=primary.querySelector('canvas');
      document.querySelector('#secondary').style.display='none';document.querySelector('#status').style.display='none';
      document.querySelector('main').style.cssText=`position:relative;display:block;padding:0;margin:0;width:${width}px;height:${height}px`;
      primary.style.cssText=`position:absolute;left:0;top:0;width:${width}px;height:${height}px;min-width:${width}px;min-height:${height}px;max-width:${width}px;max-height:${height}px;border:0;border-radius:0;overflow:hidden`;
      canvas.style.cssText=`position:absolute;left:0;top:0;width:${width}px;height:${height}px;display:block`;
      const renderer=globalThis.__AERO_RENDERER_TEST__.renderers[0];renderer.resize({widthCssPx:width,heightCssPx:height,devicePixelRatio:dpr});
      renderer.setEnvironmentVisible(false);renderer.setBackgroundProjection({kind:'solid',colors:['#080D16'],angleDeg:180});
    },viewport);
    await page.evaluate(async descriptors=>{
      const {renderers}=globalThis.__AERO_RENDERER_TEST__,renderer=renderers[0];
      const pc=await import('playcanvas'),resources=new Map(),candidateAssets=[];
      for(const spec of descriptors){
        const response=await fetch(spec.url),contents=await response.arrayBuffer();if(!response.ok)throw Error(`Candidate fetch ${spec.name}: ${response.status}`);
        const asset=new pc.Asset(`review-only:${spec.name}`,'container',{url:spec.url,filename:`${spec.name}.glb`,contents});renderer.app.assets.add(asset);
        await new Promise((ok,fail)=>{asset.once('load',ok);asset.once('error',fail);renderer.app.assets.load(asset)});
        if(!asset.resource?.instantiateRenderEntity)throw Error(`No PlayCanvas native container ${spec.name}`);
        resources.set(spec.name,asset.resource);candidateAssets.push(asset);
      }
      globalThis.__KNEE_REVIEW__={resources,candidateAssets,renderer,pc,instances:[],descriptors};
    },descriptors.map(({name,url,bounds,materials,type})=>({name,url,bounds,materials,type})));
    for(const spec of descriptors.filter(d=>d.type==='target'))for(const side of ['left','right'])for(const distance of [{name:'far',leadMs:1400},{name:'near',leadMs:420},{name:'hit',leadMs:0}]){
      const id=`${spec.name}-${side}-${distance.name}-${viewport.name}`;
      const row=await page.evaluate(({name,side,leadMs,viewport,facePlayer})=>{
        const review=globalThis.__KNEE_REVIEW__,{renderer,pc,resources,instances}=review;
        for(const entity of instances.splice(0))entity.destroy();
        const nowMs=1000,beatCenterMs=nowMs+leadMs;
        const frame={presentation:'boxing_spatial_grid',nowMs,colliderSettings:{},timingWindowBeforeMs:120,timingWindowAfterMs:240,targets:[
          {id:'comparison-punch',kind:'punch',hand:side,family:'straight',cell:side==='left'?4:7,cells:[],lane:side,beatCenterMs,direction:'up'},
          {id:'comparison-guard',kind:'guard',hand:'both',family:'guard',cell:null,cells:[1,2],lane:null,beatCenterMs}]};
        const result=renderer.renderGameplayFrameWithCursorsAndEquipment(frame,[],null,[],null);
        if(result.status.gameplayAssets.state!=='ready')throw Error('Pinned production GLBs unavailable');
        const model=result.model,punch=model.objects.find(o=>o.targetId==='comparison-punch'&&o.kind==='icon'),guards=model.objects.filter(o=>o.targetId==='comparison-guard'&&o.kind==='icon');
        const track=model.objects.find(o=>o.kind==='track'),trackEntity=renderer.assetPools.get('track/blue-glass-v1')?.find(e=>e.enabled);
        if(!punch||guards.length!==2||!track||!trackEntity)throw Error('Missing real punch, guard or canonical GLB track');
        // Lowest row cell 8 (left outer) or 11 (right outer), from the same 4×3 world grid;
        // Z is the existing model's exact timestamp-derived punch/guard approach distance.
        const cell=side==='left'?8:11,x=model.grid.columnX[cell%4],y=model.grid.rowY[Math.floor(cell/4)],z=punch.position.z;
        const entity=resources.get(name).instantiateRenderEntity({castShadows:true,receiveShadows:false});
        entity.name=`review-only-${name}-${side}`;renderer.app.root.addChild(entity);renderer.useGameplayLayer(entity,'target');
        entity.setPosition(x,y,z);entity.setLocalScale(punch.scale.x,punch.scale.y,punch.scale.z);
        if(facePlayer)entity.setEulerAngles(0,180,0); // authored local −Z faces camera at world +Z
        const tint=side==='left'?'#19CBF0':'#FD626A';const rgb=tint.match(/[0-9A-F]{2}/g).map(h=>parseInt(h,16)/255);
        let tintMeshes=0;const meshInfo=[];
        for(const render of entity.findComponents('render'))for(const mesh of render.meshInstances){
          const old=mesh.material,material=old.clone();mesh.material=material;
          const sourceName=old.name??'';
          if(sourceName.includes('target_tint')){material.diffuse.set(...rgb);material.emissive.set(...rgb.map(v=>v*.32));material.update();tintMeshes++;}
          meshInfo.push({material:sourceName,vertices:mesh.mesh?.vertexBuffer?.numVertices??0});
        }
        if(!tintMeshes||!meshInfo.length)throw Error(`Candidate material/mesh missing: ${name}`);
        instances.push(entity);renderer.manualTick();
        const camera=renderer.cameraEntity.camera,center=camera.worldToScreen(new pc.Vec3(x,y,z));
        const bounds=review.descriptors.find(d=>d.name===name).bounds;
        const projected=[];
        for(const a of [bounds[0][0],bounds[1][0]])for(const b of [bounds[0][1],bounds[1][1]])for(const c of [bounds[0][2],bounds[1][2]]){
          const world=entity.getWorldTransform().transformPoint(new pc.Vec3(a,b,c));
          projected.push(camera.worldToScreen(world));
        }
        const authoredFront=entity.getWorldTransform().transformVector(new pc.Vec3(0,0,-1)).normalize();
        if(facePlayer&&authoredFront.z<.999)throw Error('Candidate authored front does not face player camera');
        const box={left:Math.min(...projected.map(p=>p.x)),right:Math.max(...projected.map(p=>p.x)),top:Math.min(...projected.map(p=>p.y)),bottom:Math.max(...projected.map(p=>p.y))};
        const canvas=document.querySelector('#primary canvas');
        const sample=()=>{const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;const ctx=copy.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0);return ctx.getImageData(0,0,copy.width,copy.height).data};
        const withCandidate=sample();entity.enabled=false;renderer.manualTick();const withoutCandidate=sample();entity.enabled=true;renderer.manualTick();
        let delta=0,trackPixels=0,cuePixels=0;
        for(let i=0;i<withCandidate.length;i+=4){if(Math.abs(withCandidate[i]-withoutCandidate[i])+Math.abs(withCandidate[i+1]-withoutCandidate[i+1])+Math.abs(withCandidate[i+2]-withoutCandidate[i+2])>35)delta++;
          if(withoutCandidate[i+2]>withoutCandidate[i]+20&&withoutCandidate[i+2]>withoutCandidate[i+1]+5)trackPixels++;
          if(withoutCandidate[i]>95&&withoutCandidate[i+1]>95&&withoutCandidate[i+2]>95)cuePixels++;
        }
        return {name,side,distance:leadMs,viewport,facePlayer,authoredFrontWorld:{x:authoredFront.x,y:authoredFront.y,z:authoredFront.z},cell,world:{x,y,z},cameraPosition:{x:renderer.cameraEntity.getPosition().x,y:renderer.cameraEntity.getPosition().y,z:renderer.cameraEntity.getPosition().z},cameraFov:camera.fov,center:{x:center.x,y:center.y},box,canvas:[canvas.width,canvas.height],meshInfo,tintMeshes,delta,trackPixels,cuePixels,production:{punch:{asset:punch.assetId,position:punch.position},guards:guards.map(o=>({asset:o.assetId,position:o.position})),track:track.assetId},assetState:result.status.gameplayAssets.state};
      },{name:spec.name,side,leadMs:distance.leadMs,viewport,facePlayer});
      assert.deepEqual(row.canvas,[viewport.width*Math.min(viewport.dpr,2),viewport.height*Math.min(viewport.dpr,2)]);
      assert.equal(row.production.track,'track/blue-glass-v1');assert.equal(row.production.guards.length,2);
      assert.equal(row.production.punch.asset,'directional-arrow/rounded-outline-v1');
      assert.ok(row.delta>3,`${id}: candidate invisible in actual framebuffer ${row.delta}`);
      assert.ok(row.trackPixels>100&&row.cuePixels>100,`${id}: track/comparison cues invisible`);
      assert.ok(row.box.right>row.box.left&&row.box.bottom>row.box.top&&row.box.right>0&&row.box.left<viewport.width&&row.box.bottom>0&&row.box.top<viewport.height,`${id}: projected bounds offscreen`);
      const path=join(out,`${id}.png`);await page.locator('#primary canvas').screenshot({path,scale:'css'});rows.push({...row,path,pngSize:[viewport.width,viewport.height],sha256:spec.sha256});console.log(`${id}: candidate delta=${row.delta} track=${row.trackPixels} box=${JSON.stringify(row.box)}`);
    }
    // Pad geometry is staged as illustrative non-tracked leg silhouettes on the same
    // native app/camera. The torso/leg proxies never enter gameplay or scored collision.
    for(const pose of ['lowered','raised'])for(const pair of [{name:'cyan-coral',colors:['#19CBF0','#FD626A']},{name:'amber-violet',colors:['#FFC247','#8A66ED']}]){
      const id=`pad-${pose}-${pair.name}-${viewport.name}`;
      const row=await page.evaluate(({pose,pair,viewport,facePlayer})=>{
        const review=globalThis.__KNEE_REVIEW__,{renderer,pc,resources,instances}=review;
        for(const entity of instances.splice(0))entity.destroy();
        const frame={presentation:'boxing_spatial_grid',nowMs:1000,colliderSettings:{},timingWindowBeforeMs:120,timingWindowAfterMs:240,targets:[]};
        const result=renderer.renderGameplayFrameWithCursorsAndEquipment(frame,[],null,[],null);
        const nativeTrack=renderer.assetPools.get('track/blue-glass-v1')?.find(e=>e.enabled);if(!nativeTrack)throw Error('Native track absent');
        // These plain review-only leg volumes show pad orientation relative to a
        // bent/straight leg; positions are illustrative, never measured landmarks.
        const positioned=[];
        for(let index=0;index<2;index++){
          const side=index===0?-1:1,x=side*1.1,raised=pose==='raised';
          const knee=new pc.Vec3(x,raised?.55:-.15,raised?1.55:1.2);
          const material=new pc.StandardMaterial();material.diffuse.set(.31,.35,.43);material.emissive.set(.055,.065,.08);material.update();
          const leg=new pc.Entity(`review-only-leg-${index}`,renderer.app);leg.addComponent('render',{type:'cylinder',material});renderer.app.root.addChild(leg);
          leg.setPosition(x,raised?-.13:-.45,raised?1.42:1.04);leg.setLocalScale(.28,1.05,.28);if(raised)leg.setEulerAngles(side*24,0,side*-23);instances.push(leg);
          const pad=resources.get('dome-strap-v1').instantiateRenderEntity({castShadows:false,receiveShadows:false});renderer.app.root.addChild(pad);renderer.useGameplayLayer(pad,'target');pad.setPosition(knee);pad.setEulerAngles(raised?-27:0,(facePlayer?180:0)+side*(raised?14:5),side*(raised?-9:0));
          const rgb=pair.colors[index].match(/[0-9A-F]{2}/g).map(h=>parseInt(h,16)/255);let tinted=0;
          for(const render of pad.findComponents('render'))for(const mesh of render.meshInstances){const m=mesh.material.clone(),name=m.name;mesh.material=m;if(name.includes('knee_tint')){m.diffuse.set(...rgb);m.emissive.set(...rgb.map(v=>v*.32));m.update();tinted++;}}
          if(!tinted)throw Error('Pad tint material absent');
          const front=pad.getWorldTransform().transformVector(new pc.Vec3(0,0,-1)).normalize();
          if(facePlayer&&front.z<.75)throw Error('Posed pad authored front does not face player');
          instances.push(pad);positioned.push({side:index?'right':'left',knee:{x:knee.x,y:knee.y,z:knee.z},color:pair.colors[index],tinted,authoredFrontWorld:{x:front.x,y:front.y,z:front.z}});
        }
        renderer.manualTick();const canvas=document.querySelector('#primary canvas');const pixels=document.createElement('canvas');pixels.width=canvas.width;pixels.height=canvas.height;const ctx=pixels.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0);const image=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        let colored=0;for(let i=0;i<image.length;i+=4)if(image[i]>100&&image[i+1]>65&&image[i+2]>75)colored++;
        const withPads=new Uint8ClampedArray(image);for(const entry of instances)entry.enabled=false;renderer.manualTick();ctx.drawImage(canvas,0,0);const withoutPads=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        let padAndLegDelta=0;for(let i=0;i<withPads.length;i+=4)if(Math.abs(withPads[i]-withoutPads[i])+Math.abs(withPads[i+1]-withoutPads[i+1])+Math.abs(withPads[i+2]-withoutPads[i+2])>35)padAndLegDelta++;
        for(const entry of instances)entry.enabled=true;renderer.manualTick();
        return {pose,pair,viewport,facePlayer,canvas:[canvas.width,canvas.height],colored,padAndLegDelta,positioned,assetState:result.status.gameplayAssets.state};
      },{pose,pair,viewport,facePlayer});
      assert.deepEqual(row.canvas,[viewport.width*Math.min(viewport.dpr,2),viewport.height*Math.min(viewport.dpr,2)]);assert.ok(row.colored>100&&row.padAndLegDelta>100,`${id}: blank pad/representative leg review`);
      const path=join(out,`${id}.png`);await page.locator('#primary canvas').screenshot({path,scale:'css'});rows.push({...row,path,pngSize:[viewport.width,viewport.height],sha256:descriptors.find(d=>d.type==='pad').sha256});
    }
    assert.deepEqual(errors,[],`Chromium page errors: ${errors.join('; ')}`);await page.close();
  }
  const evidence=join(out,'bounds.json');
  await writeFile(evidence,JSON.stringify({reviewOnly:true,facePlayer,canonicalRenderer:true,notScoredGameplay:true,notTrackedLegs:true,descriptors:descriptors.map(({type,name,sha256,bounds})=>({type,name,sha256,bounds})),rows},null,2)+'\n');
  console.log(`Native review captured ${rows.length} PNGs and ${evidence}`);
}finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
