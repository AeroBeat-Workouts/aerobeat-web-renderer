// @ts-check

/** @typedef {"flow" | "boxing_spatial_grid" | "boxing_lanes"} AeroGameplayPresentation */
/** @typedef {"left" | "right" | "guard" | "obstacle" | "neutral" | "safe"} AeroVisualRole */
/** @typedef {"rect" | "circle" | "ring" | "hatch" | "icon" | "line" | "plane"} AeroDrawKind */
/** @typedef {"role" | "white"} AeroColorMode */
/** @typedef {{x:number,y:number,width:number,height:number}} AeroNormalizedRect */
/** @typedef {{kind:AeroDrawKind, role:AeroVisualRole, rect:AeroNormalizedRect, alpha:number, scale:number, saturation:number, iconId:string|null, hatch:boolean, contrast:boolean, layer:number, targetId:string|null, rotationRad:number, colorMode:AeroColorMode, whiten:number, depth?:number, sequence?:number, intervalStartMs?:number, intervalEndMs?:number}} AeroGameplayDrawCommand */
/** @typedef {{id:string, kind:"flow"|"punch"|"guard"|"obstacle"|"safe", hand:"left"|"right"|"both"|"neutral", family:"straight"|"hook"|"uppercut"|"flow"|"guard"|"crossed_guard"|"squat"|"weave"|"obstacle"|"safe", cell:number|null, cells:readonly number[], lane:"left"|"right"|null, beatCenterMs:number, approachLeadMs?:number, endMs?:number, intervalStartMs?:number, intervalEndMs?:number, judgement?:"pending"|"hit"|"miss", feedbackProgress?:number, direction?:import("@aerobeat/web-contracts/body-grid-contracts").AeroBodyGridDirection|null}} AeroRenderableTarget */
/** @typedef {{presentation:AeroGameplayPresentation, nowMs:number, targets:readonly AeroRenderableTarget[], timingWindowBeforeMs?:number, timingWindowAfterMs?:number, blockedCells?:readonly number[], safeCells?:readonly number[], countdown?:number|null, overlay?:"none"|"paused"|"calibrating"|"tracking_lost", calibrationDim?:number, viewportAspect?:number, theme?:Readonly<Record<string, unknown>>, tuning?:Readonly<Record<string, unknown>>}} AeroGameplayFrame */
/** @typedef {{id:string, version:string, hash:string, gridInset:number, gridGap:number, receptorAlpha:number, approachRingScale:number, approachRingWidth:number, laneWidth:number, laneHitCenterY:number, laneTimingBandAlpha:number, roleScale:number, dprCap:number, flowFadeInMs:number, flowOutlineScale:number, feedbackDurationMs:number, hitPulseMs:number, hitPulseScale:number, greatEndScale:number}} AeroRendererTuning */
/** @typedef {{leftHandColor:string,rightHandColor:string,guardColor:string,obstacleColor:string,receptorColor:string,approachLeadMs:number,targetStartScale:number,targetHitScale:number,approachEasing:string,hitEasing:string,missEasing:string}} AeroRendererThemeTokens */
/** @typedef {{commands:readonly AeroGameplayDrawCommand[], overlay:Readonly<{kind:string,dim:number,countdown:number|null}>, presentation:AeroGameplayPresentation, grid:Readonly<{x:number,y:number,width:number,height:number,columns:4,rows:3}>}} AeroGameplayRenderPlan */

/** Fundamentally-2D perspective seam: bounded screen-space vanishing point and spawn scale. */
export const flowVanishingPoint = Object.freeze({ x: 0.5, y: 0.42 });
export const flowStartScale = 0.16;
export const flowDefaultApproachLeadMs = 2500;

/** @type {AeroRendererTuning} */
export const defaultRendererTuning = Object.freeze({
  id: "aero.renderer.prototype.default",
  version: "1",
  hash: "visual-acd094a5",
  gridInset: 0.055,
  gridGap: 0.018,
  receptorAlpha: 0.22,
  approachRingScale: 1.55,
  approachRingWidth: 0.08,
  laneWidth: 0.22,
  laneHitCenterY: 0.25,
  laneTimingBandAlpha: 0.22,
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
  if (frame.presentation === "boxing_lanes") {
    addBoxingLanes(commands, frame, theme, tuning);
  } else {
    addGridReceptors(commands, grid, tuning);
  }
  if (frame.presentation !== "boxing_lanes") {
    for (const cell of frame.safeCells ?? []) {
      const rect = cellRect(cell, grid, tuning.gridGap);
      if (rect) commands.push(command("hatch", "safe", rect, 0.22, 1, null, true, 1, null));
    }
    for (const cell of frame.blockedCells ?? []) {
      const rect = cellRect(cell, grid, tuning.gridGap);
      if (rect) commands.push(command("hatch", "obstacle", rect, 0.72, 1, null, true, 3, null));
    }
  }
  for (const target of frame.targets) {
    addTarget(commands, frame, target, grid, theme, tuning);
  }
  const overlayKind = frame.overlay ?? "none";
  const defaultDim = overlayKind === "none" ? 0 : 0.62;
  return Object.freeze({
    commands: Object.freeze(commands.sort(commandOrder)),
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

/** Linear normalized depth from authoritative timeline and target impact. @param {number} nowMs @param {number} impactMs @param {number} approachLeadMs */
export function flowApproachProgress(nowMs, impactMs, approachLeadMs) {
  if (![nowMs, impactMs, approachLeadMs].every(Number.isFinite) || approachLeadMs < 1) throw new TypeError("Flow approach timeline is invalid");
  return clamp(1 - (impactMs - nowMs) / approachLeadMs, 0, 1);
}

/** Project one endpoint rectangle from the bounded central vanishing point in normalized screen space. @param {AeroNormalizedRect} endpoint @param {number} progress */
export function projectFlowRect(endpoint, progress) {
  const p = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
  const scale = perspectiveScale(p);
  const endpointCenterX = endpoint.x + endpoint.width / 2;
  const endpointCenterY = endpoint.y + endpoint.height / 2;
  const centerX = lerp(flowVanishingPoint.x, endpointCenterX, p);
  const centerY = lerp(flowVanishingPoint.y, endpointCenterY, p);
  const width = endpoint.width * scale;
  const height = endpoint.height * scale;
  return Object.freeze({ x: centerX - width / 2, y: centerY - height / 2, width, height });
}

/** @param {AeroGameplayDrawCommand[]} commands @param {AeroGameplayFrame} frame @param {AeroRendererThemeTokens} theme @param {AeroRendererTuning} tuning */
function addBoxingLanes(commands, frame, theme, tuning) {
  const lanes = boxingLanesGeometry(tuning, frame.viewportAspect);
  const beforeMs = authoritativeWindow(frame.timingWindowBeforeMs, "timingWindowBeforeMs");
  const afterMs = authoritativeWindow(frame.timingWindowAfterMs, "timingWindowAfterMs");
  const lead = sharedLaneLead(frame.targets, theme.approachLeadMs);
  const velocity = laneVelocity(lanes.targetHeight * tuning.roleScale * theme.targetHitScale, tuning.laneHitCenterY, lead);
  commands.push(command("rect", "left", { x: lanes.leftX, y: 0, width: lanes.width, height: 1 }, 0.12, 1, null, false, 0, null));
  commands.push(command("rect", "right", { x: lanes.rightX, y: 0, width: lanes.width, height: 1 }, 0.12, 1, null, false, 0, null));
  commands.push(command("rect", "neutral", {
    x: lanes.leftX,
    y: tuning.laneHitCenterY - velocity * afterMs,
    width: lanes.rightX + lanes.width - lanes.leftX,
    height: velocity * (beforeMs + afterMs)
  }, tuning.laneTimingBandAlpha, 1, null, false, 1, null));
}

/** @param {AeroRendererTuning} tuning @param {number|undefined} viewportAspect */
function boxingLanesGeometry(tuning, viewportAspect) {
  const aspect = Number.isFinite(viewportAspect) && Number(viewportAspect) > 0 ? Number(viewportAspect) : 4 / 3;
  const gap = 0.1;
  const width = Math.min(tuning.laneWidth, 0.2688 / aspect);
  const leftX = 0.5 - gap / 2 - width;
  const rightX = 0.5 + gap / 2;
  return { width, leftX, rightX, targetHeight: width * aspect };
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
  const laneRole = frame.presentation === "boxing_lanes" && (target.lane === "left" || target.lane === "right") ? target.lane : null;
  const flowCue = frame.presentation === "flow" && target.kind === "flow";
  const flowObstacle = frame.presentation === "flow" && target.kind === "obstacle";
  const role = /** @type {AeroVisualRole} */ (flowObstacle ? "obstacle" : target.hand === "left" || laneRole === "left" ? "left" : target.hand === "right" || laneRole === "right" ? "right" : target.kind === "obstacle" ? "obstacle" : target.kind === "safe" ? "safe" : target.kind === "guard" ? "guard" : "neutral");
  const lead = flowCue || flowObstacle ? flowApproachLead(target.approachLeadMs, theme.approachLeadMs) : Math.max(1, target.approachLeadMs ?? theme.approachLeadMs);
  const interval = flowObstacle ? flowObstacleInterval(target) : null;
  if (interval && frame.nowMs > interval.endMs) return;
  const impactMs = interval?.startMs ?? target.beatCenterMs;
  const linearProgress = flowApproachProgress(frame.nowMs, impactMs, lead);
  const progress = flowCue || flowObstacle ? linearProgress : applyNamedEasing(linearProgress, theme.approachEasing);
  const rawFeedback = finiteProgress(target.feedbackProgress);
  const feedback = applyNamedEasing(rawFeedback, flowCue || target.judgement !== "miss" ? theme.hitEasing : theme.missEasing);
  const arrivalElapsedMs = frame.nowMs - (impactMs - lead);
  const arrivalAlpha = flowCue || flowObstacle ? clamp(arrivalElapsedMs / tuning.flowFadeInMs, 0, 1) : lerp(0.35, 1, progress);
  const feedbackActive = target.judgement === "hit" || target.judgement === "miss";
  const feedbackAlpha = feedbackActive ? 1 - feedback : 1;
  const pulseFraction = clamp(tuning.hitPulseMs / tuning.feedbackDurationMs, Number.EPSILON, 1);
  const pulseProgress = target.judgement === "hit" ? clamp(rawFeedback / pulseFraction, 0, 1) : 1;
  const pulseAmount = target.judgement === "hit" ? Math.sin(Math.PI * pulseProgress) : 0;
  const whiten = target.judgement === "hit" ? 1 - pulseProgress : 0;
  let scale = flowCue || flowObstacle ? 1 : lerp(theme.targetStartScale, theme.targetHitScale, progress);
  if (!flowCue && !flowObstacle && target.judgement === "hit") scale *= 1 - feedback * 0.65;
  else if (!flowCue && !flowObstacle && target.judgement === "miss") scale *= 1 + feedback * 0.12;
  if (target.judgement === "hit") scale *= lerp(1, tuning.hitPulseScale, pulseAmount);
  const alpha = arrivalAlpha * feedbackAlpha;
  const rotationRad = flowCue ? flowDirectionRotation(target.direction ?? null) : 0;
  const rects = targetRects(frame, target, grid, theme, tuning);
  for (let rectIndex = 0; rectIndex < rects.length; rectIndex += 1) {
    const targetRect = rects[rectIndex];
    const baseRect = scaledRect(targetRect, tuning.roleScale);
    if (flowObstacle && interval) {
      const rect = projectFlowRect(baseRect, progress);
      commands.push(flowCommand("plane", role, rect, 0.58 * arrivalAlpha, perspectiveScale(progress), null, false, 5, target.id, progress, rectIndex, 1, false, 0, "role", 0, interval));
      continue;
    }
    if (flowCue) {
      const visualProgress = feedbackActive ? 1 : progress;
      const rect = projectFlowRect(baseRect, visualProgress);
      const iconId = iconIdFor(target, frame.presentation);
      const cueScale = perspectiveScale(visualProgress);
      if (iconId) commands.push(flowCommand("icon", role, scaledRect(rect, tuning.flowOutlineScale), alpha, cueScale * tuning.flowOutlineScale, iconId, false, 5, target.id, progress, 0, 1, false, rotationRad, "white"));
      commands.push(flowCommand(iconId ? "icon" : "circle", role, rect, alpha, cueScale, iconId, false, 5, target.id, progress, 1, 1, false, rotationRad, "role", whiten));
      if (!feedbackActive) {
        const ringScale = lerp(tuning.approachRingScale, 1, progress);
        commands.push(flowCommand("ring", role, scaledRect(baseRect, ringScale), 0.85 * arrivalAlpha, ringScale, null, false, 6, target.id, progress, 0));
      }
      if (target.judgement === "hit") {
        const greatScale = lerp(1, tuning.greatEndScale, feedback);
        commands.push(flowCommand("icon", role, feedbackWordmarkRect(baseRect, greatScale), alpha, greatScale, "feedback.great", false, 7, target.id, 1, 0, 1, false, 0, "white"));
      }
      continue;
    }
    const rect = scaledRect(baseRect, scale);
    const iconId = iconIdFor(target, frame.presentation);
    const isGridObstacle = target.kind === "obstacle" && frame.presentation !== "boxing_lanes";
    const kind = isGridObstacle ? "hatch" : iconId ? "icon" : "circle";
    commands.push(command(kind, role, rect, alpha, scale, iconId, isGridObstacle, 5, target.id, progress, false, rotationRad, "role", whiten));
    if (frame.presentation !== "boxing_lanes" && (target.judgement === undefined || target.judgement === "pending")) {
      const ringScale = lerp(tuning.approachRingScale, 1, progress);
      commands.push(command("ring", role, scaledRect(baseRect, ringScale), 0.85 * arrivalAlpha, ringScale, null, false, 6, target.id, 1));
    }
    if (target.judgement === "hit") {
      const greatScale = lerp(1, tuning.greatEndScale, feedback);
      commands.push(command("icon", role, feedbackWordmarkRect(baseRect, greatScale), alpha, greatScale, "feedback.great", false, 7, target.id, 1, false, 0, "white"));
    }
  }
}

/** @param {AeroGameplayFrame} frame @param {AeroRenderableTarget} target @param {{x:number,y:number,width:number,height:number}} grid @param {AeroRendererThemeTokens} theme @param {AeroRendererTuning} tuning @returns {AeroNormalizedRect[]} */
function targetRects(frame, target, grid, theme, tuning) {
  if (frame.presentation === "boxing_lanes") {
    const lanes = boxingLanesGeometry(tuning, frame.viewportAspect);
    const lead = Math.max(1, target.approachLeadMs ?? theme.approachLeadMs);
    const velocity = laneVelocity(lanes.targetHeight * tuning.roleScale * theme.targetHitScale, tuning.laneHitCenterY, lead);
    const y = tuning.laneHitCenterY - lanes.targetHeight / 2 - velocity * (frame.nowMs - target.beatCenterMs);
    if (target.kind === "guard" || target.family === "squat") return [
      { x: lanes.leftX, y, width: lanes.width, height: lanes.targetHeight },
      { x: lanes.rightX, y, width: lanes.width, height: lanes.targetHeight }
    ];
    const x = (target.lane ?? target.hand) === "left" ? lanes.leftX : lanes.rightX;
    return [{ x, y, width: lanes.width, height: lanes.targetHeight }];
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

/** @param {AeroRenderableTarget} target @param {AeroGameplayPresentation} presentation @returns {string|null} */
function iconIdFor(target, presentation) {
  if (target.kind === "flow") return target.direction ? "flow.directional" : "flow.directionless";
  if (target.family === "squat") return "boxing.squat";
  if (target.family === "weave") {
    const direction = presentation === "boxing_lanes" ? target.lane : target.hand === "left" || target.hand === "right" ? target.hand : null;
    return direction ? `boxing.weave.${direction}` : null;
  }
  if (target.kind === "guard") return target.family === "crossed_guard" ? "boxing.guard.crossed" : "boxing.guard.standard";
  if (target.kind === "punch") return `boxing.${target.family}.${target.hand}`;
  return null;
}

/** @param {AeroDrawKind} kind @param {AeroVisualRole} role @param {AeroNormalizedRect} rect @param {number} alpha @param {number} scale @param {string|null} iconId @param {boolean} hatch @param {number} layer @param {string|null} targetId @param {number} [saturation] @param {boolean} [contrast] @param {number} [rotationRad] @param {AeroColorMode} [colorMode] @param {number} [whiten] @returns {AeroGameplayDrawCommand} */
function command(kind, role, rect, alpha, scale, iconId, hatch, layer, targetId, saturation = 1, contrast = false, rotationRad = 0, colorMode = "role", whiten = 0) {
  return Object.freeze({ kind, role, rect: Object.freeze({ ...rect }), alpha: clamp(alpha, 0, 1), scale, saturation: clamp(saturation, 0, 1), iconId, hatch, contrast, layer, targetId, rotationRad: Number.isFinite(rotationRad) ? rotationRad : 0, colorMode, whiten: clamp(whiten, 0, 1) });
}

/** Flow-only command metadata leaves Boxing command records byte-compatible. @param {AeroDrawKind} kind @param {AeroVisualRole} role @param {AeroNormalizedRect} rect @param {number} alpha @param {number} scale @param {string|null} iconId @param {boolean} hatch @param {number} layer @param {string|null} targetId @param {number} depth @param {number} sequence @param {number} [saturation] @param {boolean} [contrast] @param {number} [rotationRad] @param {AeroColorMode} [colorMode] @param {number} [whiten] @param {{startMs:number,endMs:number}|null} [interval] */
function flowCommand(kind, role, rect, alpha, scale, iconId, hatch, layer, targetId, depth, sequence, saturation = 1, contrast = false, rotationRad = 0, colorMode = "role", whiten = 0, interval = null) {
  const base = command(kind, role, rect, alpha, scale, iconId, hatch, layer, targetId, saturation, contrast, rotationRad, colorMode, whiten);
  return Object.freeze({ ...base, depth: clamp(depth, 0, 1), sequence, ...(interval ? { intervalStartMs: interval.startMs, intervalEndMs: interval.endMs } : {}) });
}

/** @param {AeroRenderableTarget} target */
function flowObstacleInterval(target) {
  const startMs = target.intervalStartMs === undefined ? Number(target.beatCenterMs) : Number(target.intervalStartMs);
  if (target.intervalEndMs !== undefined && target.endMs !== undefined && Number(target.intervalEndMs) !== Number(target.endMs)) throw new TypeError("Flow obstacle end bounds conflict");
  const endValue = target.intervalEndMs ?? target.endMs ?? startMs;
  const endMs = Number(endValue);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs > 86_400_000 || startMs > endMs) throw new TypeError("Flow obstacle interval is invalid");
  return Object.freeze({ startMs, endMs });
}

/** @param {number|undefined} targetLead @param {number} themeLead */
function flowApproachLead(targetLead, themeLead) {
  const lead = targetLead ?? Math.max(themeLead, flowDefaultApproachLeadMs);
  if (!Number.isFinite(lead) || lead < 1 || lead > 10_000) throw new TypeError("Flow approach lead is invalid");
  return lead;
}

/** @param {number} progress */
function perspectiveScale(progress) { return lerp(flowStartScale, 1, clamp(progress, 0, 1)); }

/** @param {AeroGameplayDrawCommand} left @param {AeroGameplayDrawCommand} right */
function commandOrder(left, right) {
  const layer = left.layer - right.layer;
  if (layer !== 0) return layer;
  if (left.depth === undefined && right.depth === undefined) return 0;
  const depth = (left.depth ?? 0) - (right.depth ?? 0);
  if (depth !== 0) return depth;
  const leftId = left.targetId ?? "";
  const rightId = right.targetId ?? "";
  if (leftId !== rightId) return leftId < rightId ? -1 : 1;
  return (left.sequence ?? 0) - (right.sequence ?? 0);
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

/** @param {number|undefined} value @param {string} name */
function authoritativeWindow(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10_000) throw new TypeError(`Boxing Lanes ${name} is invalid`);
  return value;
}

/** @param {readonly AeroRenderableTarget[]} targets @param {number} themeLead */
function sharedLaneLead(targets, themeLead) {
  const leads = new Set(targets.map((target) => Math.max(1, target.approachLeadMs ?? themeLead)));
  if (leads.size > 1) throw new TypeError("Boxing Lanes targets must share one approach lead");
  return leads.values().next().value ?? Math.max(1, themeLead);
}

/** @param {number} targetHeight @param {number} hitCenterY @param {number} leadMs */
function laneVelocity(targetHeight, hitCenterY, leadMs) { return (1 + targetHeight / 2 - hitCenterY) / leadMs; }

/** @param {AeroNormalizedRect} rect @param {number} scale @returns {AeroNormalizedRect} */
function scaledRect(rect, scale) {
  const width = rect.width * scale;
  const height = rect.height * scale;
  return { x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height };
}

/** @param {unknown} value @returns {value is AeroGameplayPresentation} */
function isPresentation(value) { return value === "flow" || value === "boxing_spatial_grid" || value === "boxing_lanes"; }
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
