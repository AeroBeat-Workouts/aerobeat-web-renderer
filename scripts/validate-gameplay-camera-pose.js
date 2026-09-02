// @ts-check

import assert from "node:assert/strict";
import {
  defaultGameplayCameraPose,
  gameplayCameraPoseArtifactFilename,
  gameplayCameraPoseArtifactMimeType,
  gameplayCameraPoseBounds,
  normalizeGameplayCameraPose,
  serializeGameplayCameraPose
} from "../src/gameplay-camera-pose.js";

const clone = () => structuredClone(defaultGameplayCameraPose);
const mutate = (apply) => { const value = clone(); apply(value); return value; };

assert.equal(gameplayCameraPoseArtifactFilename, "aerobeat-gameplay-camera-pose.v1.json");
assert.equal(gameplayCameraPoseArtifactMimeType, "application/json");
assert.ok(Object.isFrozen(defaultGameplayCameraPose) && Object.isFrozen(defaultGameplayCameraPose.position) && Object.isFrozen(gameplayCameraPoseBounds));
assert.deepEqual(Reflect.ownKeys(defaultGameplayCameraPose), ["schema", "version", "coordinateSystem", "position", "rotationEulerDegrees", "projection"]);
assert.deepEqual(Reflect.ownKeys(defaultGameplayCameraPose.coordinateSystem), ["space", "handedness", "worldUp", "cameraForward", "timelineFuture"]);
assert.deepEqual(Reflect.ownKeys(defaultGameplayCameraPose.position), ["x", "y", "z"]);
assert.deepEqual(Reflect.ownKeys(defaultGameplayCameraPose.rotationEulerDegrees), ["xPitch", "yYaw", "zRoll"]);
assert.deepEqual(Reflect.ownKeys(defaultGameplayCameraPose.projection), ["verticalFovDegrees", "nearClip", "farClip"]);

const unordered = { projection:{farClip:80,nearClip:.1,verticalFovDegrees:48}, position:{z:7.8000004,y:3.1500004,x:-0}, version:1, coordinateSystem:{timelineFuture:"world_-Z",cameraForward:"local_-Z",worldUp:"+Y",handedness:"right_handed",space:"playcanvas_world"}, schema:"aerobeat/gameplay_camera_pose", rotationEulerDegrees:{zRoll:-0,yYaw:540,xPitch:-7.44845149} };
const canonical = normalizeGameplayCameraPose(unordered);
assert.deepEqual(canonical, {...defaultGameplayCameraPose, position:{x:0,y:3.15,z:7.8}, rotationEulerDegrees:{xPitch:-7.448451,yYaw:-180,zRoll:0}});
assert.ok(!serializeGameplayCameraPose(canonical).includes("-0"));
const expected = `{
  "schema": "aerobeat/gameplay_camera_pose",
  "version": 1,
  "coordinateSystem": {
    "space": "playcanvas_world",
    "handedness": "right_handed",
    "worldUp": "+Y",
    "cameraForward": "local_-Z",
    "timelineFuture": "world_-Z"
  },
  "position": {
    "x": 0,
    "y": 3.15,
    "z": 7.8
  },
  "rotationEulerDegrees": {
    "xPitch": -7.448451,
    "yYaw": -180,
    "zRoll": 0
  },
  "projection": {
    "verticalFovDegrees": 48,
    "nearClip": 0.1,
    "farClip": 80
  }
}
`;
assert.equal(serializeGameplayCameraPose(canonical), expected);
assert.equal(serializeGameplayCameraPose(JSON.parse(expected)), expected, "canonical artifact must round-trip byte-identically");
assert.equal(serializeGameplayCameraPose(canonical), serializeGameplayCameraPose(canonical), "unchanged serialization must be byte-identical");
assert.ok(expected.endsWith("\n") && !expected.includes("\r"));

for (const hostile of [null, [], Object.create(null), Object.create({}), new Proxy({}, {})]) assert.throws(() => normalizeGameplayCameraPose(hostile), /plain record|keys/u);
assert.throws(() => normalizeGameplayCameraPose({...clone(), extra:true}), /keys/u);
const symbol = clone(); symbol[Symbol("hostile")] = true; assert.throws(() => normalizeGameplayCameraPose(symbol), /keys/u);
const accessor = clone(); Object.defineProperty(accessor, "schema", {enumerable:true,get(){throw new Error("must not execute");}}); assert.throws(() => normalizeGameplayCameraPose(accessor), /data properties/u);
const nestedPrototype = clone(); nestedPrototype.position = Object.assign(Object.create({polluted:true}), nestedPrototype.position); assert.throws(() => normalizeGameplayCameraPose(nestedPrototype), /plain record/u);
const nestedAccessor = clone(); Object.defineProperty(nestedAccessor.projection, "nearClip", {enumerable:true,get(){throw new Error("must not execute");}}); assert.throws(() => normalizeGameplayCameraPose(nestedAccessor), /data properties/u);
const nestedSymbol = clone(); nestedSymbol.rotationEulerDegrees[Symbol("hostile")] = 1; assert.throws(() => normalizeGameplayCameraPose(nestedSymbol), /keys/u);
const nestedExtra = clone(); nestedExtra.coordinateSystem.extra = "no"; assert.throws(() => normalizeGameplayCameraPose(nestedExtra), /keys/u);

for (const nonfinite of [NaN, Infinity, -Infinity]) for (const path of [
  (value)=>{value.position.x=nonfinite;}, (value)=>{value.position.y=nonfinite;}, (value)=>{value.position.z=nonfinite;},
  (value)=>{value.rotationEulerDegrees.xPitch=nonfinite;}, (value)=>{value.rotationEulerDegrees.yYaw=nonfinite;}, (value)=>{value.rotationEulerDegrees.zRoll=nonfinite;},
  (value)=>{value.projection.verticalFovDegrees=nonfinite;}, (value)=>{value.projection.nearClip=nonfinite;}, (value)=>{value.projection.farClip=nonfinite;}
]) assert.throws(() => normalizeGameplayCameraPose(mutate(path)), /finite/u);

for (const [apply, pattern] of [
  [(value)=>{value.position.x=40.000001;}, /bounds/u], [(value)=>{value.position.y=-8.000001;}, /bounds/u], [(value)=>{value.position.z=-72.000001;}, /bounds/u],
  [(value)=>{value.rotationEulerDegrees.xPitch=77.349304;}, /bounds/u], [(value)=>{value.rotationEulerDegrees.yYaw=360000.000001;}, /bounds/u], [(value)=>{value.rotationEulerDegrees.zRoll=.000001;}, /zero/u],
  [(value)=>{value.projection.verticalFovDegrees=.999999;}, /bounds/u], [(value)=>{value.projection.nearClip=.000999;}, /bounds/u], [(value)=>{value.projection.farClip=10000.000001;}, /bounds/u],
  [(value)=>{value.projection.nearClip=2;value.projection.farClip=1;}, /nearClip/u]
]) assert.throws(() => normalizeGameplayCameraPose(mutate(apply)), pattern);

for (const key of ["space", "handedness", "worldUp", "cameraForward", "timelineFuture"]) assert.throws(() => normalizeGameplayCameraPose(mutate((value)=>{value.coordinateSystem[key]="hostile";})), /convention/u);
assert.throws(() => normalizeGameplayCameraPose(mutate((value)=>{value.schema="other";})), /schema\/version/u);
assert.throws(() => normalizeGameplayCameraPose(mutate((value)=>{value.version=2;})), /schema\/version/u);

console.log("Strict gameplay camera-pose schema, bounds, canonical bytes, and hostile-data validation passed.");
