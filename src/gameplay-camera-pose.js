// @ts-check

export const gameplayCameraPoseArtifactFilename = "aerobeat-gameplay-camera-pose.v1.json";
export const gameplayCameraPoseArtifactMimeType = "application/json";
export const gameplayCameraPoseSchema = "aerobeat/gameplay_camera_pose";
export const gameplayCameraPoseVersion = 1;

/** Camera-authoring bounds match the free-fly volume and conservative perspective limits. */
export const gameplayCameraPoseBounds = deepFreeze({
  position: { x: [-40, 40], y: [-8, 32], z: [-72, 32] },
  rotationEulerDegrees: { xPitch: [-77.349303, 77.349303], yYawInput: [-360000, 360000], yYawCanonical: [-180, 180], zRoll: [0, 0] },
  projection: { verticalFovDegrees: [1, 179], nearClip: [0.001, 10], farClip: [1, 10000] }
});

const coordinateSystem = deepFreeze({
  space: "playcanvas_world",
  handedness: "right_handed",
  worldUp: "+Y",
  cameraForward: "local_-Z",
  timelineFuture: "world_-Z"
});

export const defaultGameplayCameraPose = normalizeGameplayCameraPose({
  schema: gameplayCameraPoseSchema,
  version: gameplayCameraPoseVersion,
  coordinateSystem,
  position: { x: 0.05, y: 1, z: 5 },
  rotationEulerDegrees: { xPitch: 0, yYaw: 0, zRoll: 0 },
  projection: { verticalFovDegrees: 48, nearClip: 0.1, farClip: 80 }
});

/** Strictly validate and canonicalize one v1 camera-pose plain-data record. @param {unknown} value */
export function normalizeGameplayCameraPose(value) {
  const root = strictRecord(value, ["schema", "version", "coordinateSystem", "position", "rotationEulerDegrees", "projection"], "camera pose");
  if (data(root, "schema") !== gameplayCameraPoseSchema || data(root, "version") !== gameplayCameraPoseVersion) throw new TypeError("Camera pose schema/version is invalid");
  const coordinates = strictRecord(data(root, "coordinateSystem"), ["space", "handedness", "worldUp", "cameraForward", "timelineFuture"], "coordinate system");
  for (const key of ["space", "handedness", "worldUp", "cameraForward", "timelineFuture"]) if (data(coordinates, key) !== coordinateSystem[key]) throw new TypeError(`Camera pose coordinate convention ${key} is invalid`);
  const position = strictRecord(data(root, "position"), ["x", "y", "z"], "position");
  const rotation = strictRecord(data(root, "rotationEulerDegrees"), ["xPitch", "yYaw", "zRoll"], "rotation");
  const projection = strictRecord(data(root, "projection"), ["verticalFovDegrees", "nearClip", "farClip"], "projection");
  const x = bounded(data(position, "x"), gameplayCameraPoseBounds.position.x, "position.x");
  const y = bounded(data(position, "y"), gameplayCameraPoseBounds.position.y, "position.y");
  const z = bounded(data(position, "z"), gameplayCameraPoseBounds.position.z, "position.z");
  const xPitch = bounded(data(rotation, "xPitch"), gameplayCameraPoseBounds.rotationEulerDegrees.xPitch, "rotation.xPitch");
  const yawInput = bounded(data(rotation, "yYaw"), gameplayCameraPoseBounds.rotationEulerDegrees.yYawInput, "rotation.yYaw");
  const rawRoll = finiteNumber(data(rotation, "zRoll"), "rotation.zRoll");
  if (rawRoll !== 0) throw new TypeError("Camera pose rotation.zRoll must be zero");
  const verticalFovDegrees = bounded(data(projection, "verticalFovDegrees"), gameplayCameraPoseBounds.projection.verticalFovDegrees, "projection.verticalFovDegrees");
  const nearClip = bounded(data(projection, "nearClip"), gameplayCameraPoseBounds.projection.nearClip, "projection.nearClip");
  const farClip = bounded(data(projection, "farClip"), gameplayCameraPoseBounds.projection.farClip, "projection.farClip");
  if (nearClip >= farClip) throw new TypeError("Camera pose projection requires nearClip below farClip");
  return deepFreeze({
    schema: gameplayCameraPoseSchema,
    version: gameplayCameraPoseVersion,
    coordinateSystem: { ...coordinateSystem },
    position: { x, y, z },
    rotationEulerDegrees: { xPitch, yYaw: canonicalYaw(yawInput), zRoll: 0 },
    projection: { verticalFovDegrees, nearClip, farClip }
  });
}

/**
 * 0.0.92 lyof: responsive vertical FOV (degrees) for a given viewport aspect ratio, so the whole
 * play grid fits the visible volume. The camera looks down −Z from distance `dist`; PlayCanvas
 * sizes the frustum by VERTICAL fov, so visible height = 2·dist·tan(fov/2) and visible width =
 * height × aspect. We pick the fov such that BOTH the grid width (2·gridHalfWidth) AND the grid
 * row height (2·gridHalfHeight) fit:
 *   fov = max( 2·atan(gridHalfWidth / (aspect·dist)),  2·atan(gridHalfHeight / dist) )  (radians)
 * A landscape guard keeps the default framing byte-identical: when the aspect already fits the
 * grid width at `defaultFovDegrees` (computed fov <= default), the default is returned unchanged.
 * The result is clamped to the pose's `verticalFovDegrees` bounds.
 * @param {number} aspectCssPx viewport width / height CSS-pixel ratio (> 0)
 * @param {{dist:number,gridHalfWidth:number,gridHalfHeight:number}} grid grid framing constants (WU)
 * @param {number} defaultFovDegrees the canonical default vertical fov (landscape guard reference)
 * @param {readonly number[]} fovBounds the pose verticalFovDegrees bounds
 * @returns {number}
 */
export function responsiveGameplayCameraFovDegrees(aspectCssPx, grid, defaultFovDegrees, fovBounds) {
  if (typeof aspectCssPx !== "number" || !Number.isFinite(aspectCssPx) || aspectCssPx <= 0) throw new TypeError("responsive camera aspect must be a positive finite number");
  const { dist, gridHalfWidth, gridHalfHeight } = grid;
  for (const value of [dist, gridHalfWidth, gridHalfHeight, defaultFovDegrees]) if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new TypeError("responsive camera grid constants must be positive finite numbers");
  const halfWidthFov = 2 * Math.atan(gridHalfWidth / (aspectCssPx * dist));
  const halfHeightFov = 2 * Math.atan(gridHalfHeight / dist);
  const computedRad = Math.max(halfWidthFov, halfHeightFov);
  const computedDeg = computedRad * 180 / Math.PI;
  const landscapeGuard = computedDeg <= defaultFovDegrees ? defaultFovDegrees : computedDeg;
  return canonicalNumber(clampTo(landscapeGuard, fovBounds[0], fovBounds[1]), "responsive verticalFovDegrees");
}
/** @param {number} value @param {number} min @param {number} max */
function clampTo(value, min, max) { return Math.max(min, Math.min(max, value)); }

/** Serialize canonical v1 data with fixed property order, two spaces, LF, and a trailing newline. @param {unknown} value */
export function serializeGameplayCameraPose(value) { return `${JSON.stringify(normalizeGameplayCameraPose(value), null, 2)}\n`; }

/** @param {unknown} value @param {readonly string[]} expected @param {string} label */
function strictRecord(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`Camera pose ${label} must be a plain record`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length || keys.some((key) => typeof key !== "string" || !expected.includes(key))) throw new TypeError(`Camera pose ${label} keys are invalid`);
  for (const key of keys) { const descriptor = Object.getOwnPropertyDescriptor(value, key); if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new TypeError(`Camera pose ${label} must contain enumerable data properties only`); }
  return value;
}
/** @param {object} record @param {string} key */
function data(record, key) { return Object.getOwnPropertyDescriptor(record, key)?.value; }
/** @param {unknown} value @param {readonly number[]} limits @param {string} label */
function bounded(value, limits, label) { const raw = finiteNumber(value, label); if (raw < limits[0] || raw > limits[1]) throw new TypeError(`Camera pose ${label} is out of bounds`); return canonicalNumber(raw, label); }
/** @param {unknown} value @param {string} label */
function finiteNumber(value, label) { if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`Camera pose ${label} must be finite`); return value; }
/** @param {unknown} value @param {string} label */
function canonicalNumber(value, label) { const raw = finiteNumber(value, label); const rounded = Number(raw.toFixed(6)); return Object.is(rounded, -0) ? 0 : rounded; }
/** @param {number} value */
function canonicalYaw(value) { const normalized = ((value + 180) % 360 + 360) % 360 - 180; const rounded = canonicalNumber(normalized, "rotation.yYaw"); return rounded >= 180 ? -180 : rounded; }
/** @template T @param {T} value @returns {T} */
function deepFreeze(value) { if (value && typeof value === "object") for (const child of Object.values(value)) deepFreeze(child); return Object.freeze(value); }
