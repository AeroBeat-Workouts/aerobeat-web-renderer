// @ts-check

/** @typedef {"flow" | "boxing_spatial_grid" | "boxing_semantic_track"} AeroGameplayPresentation */
/** @typedef {"left" | "right" | "guard" | "obstacle" | "neutral" | "safe"} AeroVisualRole */
/** @typedef {"rect" | "circle" | "ring" | "hatch" | "icon" | "line"} AeroDrawKind */
/** @typedef {"role" | "white"} AeroColorMode */
/** @typedef {{x:number,y:number,width:number,height:number}} AeroNormalizedRect */
/** @typedef {{kind:AeroDrawKind, role:AeroVisualRole, rect:AeroNormalizedRect, alpha:number, scale:number, saturation:number, iconId:string|null, hatch:boolean, contrast:boolean, layer:number, targetId:string|null, rotationRad:number, colorMode:AeroColorMode, whiten:number}} AeroGameplayDrawCommand */
/** @typedef {{id:string, kind:"flow"|"punch"|"guard"|"obstacle"|"safe", hand:"left"|"right"|"both"|"neutral", family:"straight"|"hook"|"uppercut"|"flow"|"guard"|"crossed_guard"|"squat"|"weave"|"obstacle"|"safe", cell:number|null, cells:readonly number[], lane:"left"|"right"|null, beatCenterMs:number, approachLeadMs?:number, judgement?:"pending"|"hit"|"miss", feedbackProgress?:number, direction?:import("@aerobeat/web-contracts/body-grid-contracts").AeroBodyGridDirection|null}} AeroRenderableTarget */
/** @typedef {{presentation:AeroGameplayPresentation, nowMs:number, targets:readonly AeroRenderableTarget[], blockedCells?:readonly number[], safeCells?:readonly number[], countdown?:number|null, overlay?:"none"|"paused"|"calibrating"|"tracking_lost", calibrationDim?:number, viewportAspect?:number, theme?:Readonly<Record<string, unknown>>, tuning?:Readonly<Record<string, unknown>>}} AeroGameplayFrame */
/** @typedef {{id:string, version:string, hash:string, gridInset:number, gridGap:number, receptorAlpha:number, approachRingScale:number, approachRingWidth:number, laneWidth:number, roleScale:number, dprCap:number, flowFadeInMs:number, flowOutlineScale:number, feedbackDurationMs:number, hitPulseMs:number, hitPulseScale:number, greatEndScale:number}} AeroRendererTuning */
/** @typedef {{leftHandColor:string,rightHandColor:string,guardColor:string,obstacleColor:string,receptorColor:string,approachLeadMs:number,targetStartScale:number,targetHitScale:number,approachEasing:string,hitEasing:string,missEasing:string}} AeroRendererThemeTokens */
/** @typedef {{commands:readonly AeroGameplayDrawCommand[], overlay:Readonly<{kind:string,dim:number,countdown:number|null}>, presentation:AeroGameplayPresentation, grid:Readonly<{x:number,y:number,width:number,height:number,columns:4,rows:3}>}} AeroGameplayRenderPlan */

/** @type {AeroRendererTuning} */
export const defaultRendererTuning = Object.freeze({
  id: "aero.renderer.prototype.default",
  version: "1",
  hash: "visual-5e8958e4",
  gridInset: 0.055,
  gridGap: 0.018,
  receptorAlpha: 0.22,
  approachRingScale: 1.55,
  approachRingWidth: 0.08,
  laneWidth: 0.22,
  roleScale: 1,
  dprCap: 2,
  flowFadeInMs: 80,
  flowOutlineScale: 1.12,
  feedbackDurationMs: 350,
  hitPulseMs: 100,
  hitPulseScale: 1.08,
  greatEndScale: 1.25
});

/** @type {AeroRendererThemeTokens} */
export const defaultRendererThemeTokens = Object.freeze({
  leftHandColor: "#2693ff",
  rightHandColor: "#39c96b",
  guardColor: "#9a67ea",
  obstacleColor: "#e5484d",
  receptorColor: "#d9f5ff",
  approachLeadMs: 900,
  targetStartScale: 0.48,
  targetHitScale: 1,
  approachEasing: "linear",
  hitEasing: "ease-out",
  missEasing: "ease-out"
});

/** Stable branding semantic IDs consumed by the alpha-mask atlas. */
export const gameplayIconIds = Object.freeze([
  "boxing.glove",
  "boxing.guard.crossed",
  "boxing.guard.standard",
  "boxing.hook.left",
  "boxing.hook.right",
  "boxing.squat",
  "boxing.straight.left",
  "boxing.straight.right",
  "boxing.uppercut.left",
  "boxing.uppercut.right",
  "boxing.weave.left",
  "boxing.weave.right",
  "calibration.tpose",
  "feedback.great",
  "flow.directional",
  "flow.directionless"
]);

/**
 * Build a deterministic, screenshot-free renderer command plan. The visible playfield
 * is normalized screen space and never consumes camera/athlete-grid coordinates.
 *
 * @param {AeroGameplayFrame} frame
 * @param {AeroRendererThemeTokens} [theme]
 * @param {AeroRendererTuning} [tuning]
 * @returns {AeroGameplayRenderPlan}
 */
export function buildGameplayRenderPlan(frame, theme = defaultRendererThemeTokens, tuning = defaultRendererTuning) {
  if (!isPresentation(frame.presentation) || !Number.isFinite(frame.nowMs) || !Array.isArray(frame.targets)) {
    throw new TypeError("Gameplay frame is invalid");
  }
  const grid = fitPlayfieldGrid(tuning.gridInset, frame.viewportAspect);
  /** @type {AeroGameplayDrawCommand[]} */
  const commands = [];
  if (frame.presentation === "boxing_semantic_track") {
    addTrack(commands, tuning, frame.viewportAspect);
  } else {
    addGridReceptors(commands, grid, tuning);
  }
  for (const cell of frame.safeCells ?? []) {
    const rect = cellRect(cell, grid, tuning.gridGap);
    if (rect) commands.push(command("hatch", "safe", rect, 0.22, 1, null, true, 1, null));
  }
  for (const cell of frame.blockedCells ?? []) {
    const rect = cellRect(cell, grid, tuning.gridGap);
    if (rect) commands.push(command("hatch", "obstacle", rect, 0.72, 1, null, true, 3, null));
  }
  for (const target of frame.targets) {
    addTarget(commands, frame, target, grid, theme, tuning);
  }
  const overlayKind = frame.overlay ?? "none";
  const defaultDim = overlayKind === "none" ? 0 : 0.62;
  return Object.freeze({
    commands: Object.freeze(commands.sort((a, b) => a.layer - b.layer)),
    overlay: Object.freeze({ kind: overlayKind, dim: clamp(frame.calibrationDim ?? defaultDim, 0, 1), countdown: normalizeCountdown(frame.countdown) }),
    presentation: frame.presentation,
    grid
  });
}

/**
 * Fit a physical 4:3 playfield into any normalized viewport. Normalized widths are
 * compensated by viewport aspect so 4x3 cells and icons remain physically square.
 *
 * @param {number} inset
 * @param {number|undefined} viewportAspect
 * @returns {Readonly<{x:number,y:number,width:number,height:number,columns:4,rows:3}>}
 */
export function fitPlayfieldGrid(inset, viewportAspect) {
  const aspect = Number.isFinite(viewportAspect) && Number(viewportAspect) > 0 ? Number(viewportAspect) : 4 / 3;
  const available = Math.max(0.02, 1 - clamp(inset, 0, 0.25) * 2);
  const playfieldAspect = 4 / 3;
  const width = aspect >= playfieldAspect ? available * playfieldAspect / aspect : available;
  const height = aspect >= playfieldAspect ? available : available * aspect / playfieldAspect;
  return Object.freeze({ x: (1 - width) / 2, y: (1 - height) / 2, width, height, columns: /** @type {4} */ (4), rows: /** @type {3} */ (3) });
}

/** @param {AeroGameplayDrawCommand[]} commands @param {AeroRendererTuning} tuning @param {number|undefined} viewportAspect */
function addTrack(commands, tuning, viewportAspect) {
  const track = trackGeometry(tuning, viewportAspect);
  commands.push(command("rect", "left", { x: track.leftX, y: track.y, width: track.width, height: track.height }, 0.12, 1, null, false, 0, null));
  commands.push(command("rect", "right", { x: track.rightX, y: track.y, width: track.width, height: track.height }, 0.12, 1, null, false, 0, null));
  const lineHeight = Math.min(0.008, track.targetHeight * 0.05);
  commands.push(command("line", "neutral", { x: track.leftX, y: track.receptorY + track.targetHeight / 2, width: track.width, height: lineHeight }, 0.68, 1, null, false, 1, null));
  commands.push(command("line", "neutral", { x: track.rightX, y: track.receptorY + track.targetHeight / 2, width: track.width, height: lineHeight }, 0.68, 1, null, false, 1, null));
}

/** @param {AeroRendererTuning} tuning @param {number|undefined} viewportAspect */
function trackGeometry(tuning, viewportAspect) {
  const aspect = Number.isFinite(viewportAspect) && Number(viewportAspect) > 0 ? Number(viewportAspect) : 4 / 3;
  const gap = 0.1;
  const y = 0.08;
  const height = 0.84;
  const width = Math.min(tuning.laneWidth, height * 0.32 / aspect);
  const leftX = 0.5 - gap / 2 - width;
  const rightX = 0.5 + gap / 2;
  const targetHeight = width * aspect;
  return { width, leftX, rightX, y, height, targetHeight, receptorY: y + height - targetHeight };
}

/** @param {AeroGameplayDrawCommand[]} commands @param {{x:number,y:number,width:number,height:number}} grid @param {AeroRendererTuning} tuning */
function addGridReceptors(commands, grid, tuning) {
  for (let cell = 0; cell < 12; cell += 1) {
    const rect = cellRect(cell, grid, tuning.gridGap);
    if (rect) commands.push(command("rect", "neutral", rect, tuning.receptorAlpha, 1, null, false, 0, null));
  }
}

/** @param {AeroGameplayDrawCommand[]} commands @param {AeroGameplayFrame} frame @param {AeroRenderableTarget} target @param {{x:number,y:number,width:number,height:number}} grid @param {AeroRendererThemeTokens} theme @param {AeroRendererTuning} tuning */
function addTarget(commands, frame, target, grid, theme, tuning) {
  const role = /** @type {AeroVisualRole} */ (target.hand === "left" ? "left" : target.hand === "right" ? "right" : target.kind === "obstacle" ? "obstacle" : target.kind === "safe" ? "safe" : target.kind === "guard" ? "guard" : "neutral");
  const lead = Math.max(1, target.approachLeadMs ?? theme.approachLeadMs);
  const linearProgress = clamp(1 - (target.beatCenterMs - frame.nowMs) / lead, 0, 1);
  const progress = applyNamedEasing(linearProgress, theme.approachEasing);
  const rawFeedback = finiteProgress(target.feedbackProgress);
  const isFlow = target.kind === "flow";
  const feedback = applyNamedEasing(rawFeedback, isFlow || target.judgement !== "miss" ? theme.hitEasing : theme.missEasing);
  const arrivalElapsedMs = frame.nowMs - (target.beatCenterMs - lead);
  const arrivalAlpha = isFlow ? clamp(arrivalElapsedMs / tuning.flowFadeInMs, 0, 1) : lerp(0.35, 1, progress);
  const feedbackAlpha = target.judgement === "hit" || target.judgement === "miss" ? 1 - feedback : 1;
  const pulseFraction = clamp(tuning.hitPulseMs / tuning.feedbackDurationMs, Number.EPSILON, 1);
  const pulseProgress = target.judgement === "hit" ? clamp(rawFeedback / pulseFraction, 0, 1) : 1;
  const pulseAmount = target.judgement === "hit" ? Math.sin(Math.PI * pulseProgress) : 0;
  const whiten = target.judgement === "hit" ? 1 - pulseProgress : 0;
  let scale = isFlow ? 1 : lerp(theme.targetStartScale, theme.targetHitScale, progress);
  if (!isFlow && target.judgement === "hit") scale *= 1 - feedback * 0.65;
  else if (!isFlow && target.judgement === "miss") scale *= 1 + feedback * 0.12;
  if (target.judgement === "hit") scale *= lerp(1, tuning.hitPulseScale, pulseAmount);
  const alpha = arrivalAlpha * feedbackAlpha;
  const rotationRad = target.kind === "flow" ? flowDirectionRotation(target.direction ?? null) : 0;
  const rects = targetRects(frame.presentation, target, grid, tuning, frame.viewportAspect);
  for (const targetRect of rects) {
    const baseRect = scaledRect(targetRect, tuning.roleScale);
    const rect = scaledRect(baseRect, scale);
    const iconId = iconIdFor(target);
    const kind = target.kind === "obstacle" ? "hatch" : iconId ? "icon" : "circle";
    if (isFlow && iconId) commands.push(command("icon", role, scaledRect(rect, tuning.flowOutlineScale), alpha, scale * tuning.flowOutlineScale, iconId, false, 4, target.id, 1, false, rotationRad, "white"));
    commands.push(command(kind, role, rect, alpha, scale, iconId, target.kind === "obstacle", 5, target.id, isFlow ? 1 : progress, false, rotationRad, "role", whiten));
    if (target.judgement === undefined || target.judgement === "pending") {
      const ringScale = lerp(tuning.approachRingScale, 1, progress);
      commands.push(command("ring", role, scaledRect(baseRect, ringScale), 0.85 * arrivalAlpha, ringScale, null, false, 6, target.id, 1));
    }
    if (target.judgement === "hit") {
      const greatScale = lerp(1, tuning.greatEndScale, feedback);
      commands.push(command("icon", role, feedbackWordmarkRect(baseRect, greatScale), alpha, greatScale, "feedback.great", false, 7, target.id, 1, false, 0, "white"));
    }
  }
}

/** @param {AeroGameplayPresentation} presentation @param {AeroRenderableTarget} target @param {{x:number,y:number,width:number,height:number}} grid @param {AeroRendererTuning} tuning @param {number|undefined} viewportAspect @returns {AeroNormalizedRect[]} */
function targetRects(presentation, target, grid, tuning, viewportAspect) {
  if (presentation === "boxing_semantic_track" && target.kind !== "obstacle") {
    const track = trackGeometry(tuning, viewportAspect);
    if (target.kind === "guard") return [{ x: track.leftX, y: track.receptorY, width: track.rightX + track.width - track.leftX, height: track.targetHeight }];
    const x = (target.lane ?? target.hand) === "left" ? track.leftX : track.rightX;
    return [{ x, y: track.receptorY, width: track.width, height: track.targetHeight }];
  }
  const cells = target.cells.length > 0 ? target.cells : target.cell === null ? [] : [target.cell];
  if (target.kind === "guard" && cells.length >= 2) {
    const first = cellRect(cells[0], grid, tuning.gridGap);
    const second = cellRect(cells[1], grid, tuning.gridGap);
    if (!first || !second) return [];
    const left = Math.min(first.x, second.x);
    const top = Math.min(first.y, second.y);
    return [{ x: left, y: top, width: Math.max(first.x + first.width, second.x + second.width) - left, height: Math.max(first.y + first.height, second.y + second.height) - top }];
  }
  return cells.map((cell) => cellRect(cell, grid, tuning.gridGap)).filter((rect) => rect !== null);
}

/** @param {number} cell @param {{x:number,y:number,width:number,height:number}} grid @param {number} gap @returns {AeroNormalizedRect|null} */
export function cellRect(cell, grid, gap = 0) {
  if (!Number.isInteger(cell) || cell < 0 || cell >= 12) return null;
  const column = cell % 4;
  const row = Math.floor(cell / 4);
  const width = grid.width / 4;
  const height = grid.height / 3;
  return Object.freeze({ x: grid.x + column * width + gap / 2, y: grid.y + row * height + gap / 2, width: width - gap, height: height - gap });
}

/** @param {AeroRenderableTarget} target @returns {string|null} */
function iconIdFor(target) {
  if (target.kind === "flow") return target.direction ? "flow.directional" : "flow.directionless";
  if (target.kind === "guard") return target.family === "crossed_guard" ? "boxing.guard.crossed" : "boxing.guard.standard";
  if (target.kind === "punch") return `boxing.${target.family}.${target.hand}`;
  if (target.family === "squat") return "boxing.squat";
  if (target.family === "weave" && (target.hand === "left" || target.hand === "right")) return `boxing.weave.${target.hand}`;
  return null;
}

/** @param {AeroDrawKind} kind @param {AeroVisualRole} role @param {AeroNormalizedRect} rect @param {number} alpha @param {number} scale @param {string|null} iconId @param {boolean} hatch @param {number} layer @param {string|null} targetId @param {number} [saturation] @param {boolean} [contrast] @param {number} [rotationRad] @param {AeroColorMode} [colorMode] @param {number} [whiten] @returns {AeroGameplayDrawCommand} */
function command(kind, role, rect, alpha, scale, iconId, hatch, layer, targetId, saturation = 1, contrast = false, rotationRad = 0, colorMode = "role", whiten = 0) {
  return Object.freeze({ kind, role, rect: Object.freeze({ ...rect }), alpha: clamp(alpha, 0, 1), scale, saturation: clamp(saturation, 0, 1), iconId, hatch, contrast, layer, targetId, rotationRad: Number.isFinite(rotationRad) ? rotationRad : 0, colorMode, whiten: clamp(whiten, 0, 1) });
}

/** @param {import("@aerobeat/web-contracts/body-grid-contracts").AeroBodyGridDirection|null} direction */
function flowDirectionRotation(direction) {
  if (direction === null) return 0;
  const rotations = new Map([["right",0],["down-right",Math.PI/4],["down",Math.PI/2],["down-left",Math.PI*3/4],["left",Math.PI],["up-left",-Math.PI*3/4],["up",-Math.PI/2],["up-right",-Math.PI/4]]);
  const rotation = rotations.get(direction);
  if (rotation === undefined) throw new TypeError("Flow direction icon is unsupported");
  return rotation;
}

/** @param {AeroNormalizedRect} rect @param {number} scale @returns {AeroNormalizedRect} */
function feedbackWordmarkRect(rect, scale) {
  const width = rect.width * 1.2 * scale;
  const height = rect.height * 0.3 * scale;
  return { x:rect.x+(rect.width-width)/2,y:rect.y+(rect.height-height)/2,width,height };
}

/** @param {number|undefined} value */
function finiteProgress(value) { return typeof value === "number" && Number.isFinite(value) ? clamp(value, 0, 1) : 0; }

/** @param {AeroNormalizedRect} rect @param {number} scale @returns {AeroNormalizedRect} */
function scaledRect(rect, scale) {
  const width = rect.width * scale;
  const height = rect.height * scale;
  return { x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height };
}

/** @param {unknown} value @returns {value is AeroGameplayPresentation} */
function isPresentation(value) { return value === "flow" || value === "boxing_spatial_grid" || value === "boxing_semantic_track"; }
/** @param {number|undefined|null} value @returns {number|null} */
function normalizeCountdown(value) { return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 3 ? Number(value) : null; }
/** @param {number} value @param {number} minimum @param {number} maximum */
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
/** @param {number} progress @param {string} easing @returns {number} */
export function applyNamedEasing(progress, easing) {
  const value = clamp(progress, 0, 1);
  if (easing === "ease-in") return value * value;
  if (easing === "ease-out") return 1 - (1 - value) * (1 - value);
  if (easing === "ease-in-out") return value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2;
  return value;
}
/** @param {number} start @param {number} end @param {number} progress */
function lerp(start, end, progress) { return start + (end - start) * progress; }
