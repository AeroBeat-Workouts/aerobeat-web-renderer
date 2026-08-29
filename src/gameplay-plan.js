// @ts-check

/** @typedef {"flow" | "boxing_spatial_grid" | "boxing_semantic_track"} AeroGameplayPresentation */
/** @typedef {"left" | "right" | "guard" | "obstacle" | "neutral" | "safe"} AeroVisualRole */
/** @typedef {"rect" | "circle" | "ring" | "hatch" | "icon" | "line"} AeroDrawKind */
/** @typedef {{x:number,y:number,width:number,height:number}} AeroNormalizedRect */
/** @typedef {{kind:AeroDrawKind, role:AeroVisualRole, rect:AeroNormalizedRect, alpha:number, scale:number, saturation:number, iconId:string|null, hatch:boolean, contrast:boolean, layer:number, targetId:string|null}} AeroGameplayDrawCommand */
/** @typedef {{id:string, kind:"flow"|"punch"|"guard"|"obstacle"|"safe", hand:"left"|"right"|"both"|"neutral", family:"straight"|"hook"|"uppercut"|"flow"|"guard"|"crossed_guard"|"squat"|"weave"|"obstacle"|"safe", cell:number|null, cells:readonly number[], lane:"left"|"right"|null, beatCenterMs:number, approachLeadMs?:number, judgement?:"pending"|"hit"|"miss", feedbackProgress?:number, direction?:import("@aerobeat/web-contracts/body-grid-contracts").AeroBodyGridDirection|null}} AeroRenderableTarget */
/** @typedef {{presentation:AeroGameplayPresentation, nowMs:number, targets:readonly AeroRenderableTarget[], blockedCells?:readonly number[], safeCells?:readonly number[], countdown?:number|null, overlay?:"none"|"paused"|"calibrating"|"tracking_lost", calibrationDim?:number, viewportAspect?:number, theme?:Readonly<Record<string, unknown>>, tuning?:Readonly<Record<string, unknown>>}} AeroGameplayFrame */
/** @typedef {{id:string, version:string, hash:string, gridInset:number, gridGap:number, receptorAlpha:number, approachRingScale:number, approachRingWidth:number, laneWidth:number, roleScale:number, dprCap:number}} AeroRendererTuning */
/** @typedef {{leftHandColor:string,rightHandColor:string,guardColor:string,obstacleColor:string,receptorColor:string,approachLeadMs:number,targetStartScale:number,targetHitScale:number,approachEasing:string,hitEasing:string,missEasing:string}} AeroRendererThemeTokens */
/** @typedef {{commands:readonly AeroGameplayDrawCommand[], overlay:Readonly<{kind:string,dim:number,countdown:number|null}>, presentation:AeroGameplayPresentation, grid:Readonly<{x:number,y:number,width:number,height:number,columns:4,rows:3}>}} AeroGameplayRenderPlan */

/** @type {AeroRendererTuning} */
export const defaultRendererTuning = Object.freeze({
  id: "aero.renderer.prototype.default",
  version: "1",
  hash: "visual-538685f6",
  gridInset: 0.055,
  gridGap: 0.018,
  receptorAlpha: 0.22,
  approachRingScale: 1.55,
  approachRingWidth: 0.08,
  laneWidth: 0.22,
  roleScale: 1,
  dprCap: 2
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
  "calibration.tpose"
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
  const role = target.hand === "left" ? "left" : target.hand === "right" ? "right" : target.kind === "obstacle" ? "obstacle" : target.kind === "safe" ? "safe" : target.kind === "guard" ? "guard" : "neutral";
  const lead = Math.max(1, target.approachLeadMs ?? theme.approachLeadMs);
  const linearProgress = clamp(1 - (target.beatCenterMs - frame.nowMs) / lead, 0, 1);
  const progress = applyNamedEasing(linearProgress, theme.approachEasing);
  const rawFeedback = clamp(target.feedbackProgress ?? 0, 0, 1);
  const feedback = applyNamedEasing(rawFeedback, target.judgement === "miss" ? theme.missEasing : theme.hitEasing);
  let scale = lerp(theme.targetStartScale, theme.targetHitScale, progress);
  let alpha = lerp(0.35, 1, progress);
  if (target.judgement === "hit") {
    scale *= 1 - feedback * 0.65;
    alpha *= 1 - feedback;
  } else if (target.judgement === "miss") {
    scale *= 1 + feedback * 0.12;
    alpha *= 1 - feedback * 0.9;
  }
  const rects = targetRects(frame.presentation, target, grid, tuning, frame.viewportAspect);
  for (const targetRect of rects) {
    const baseRect = scaledRect(targetRect, tuning.roleScale);
    const rect = scaledRect(baseRect, scale);
    const iconId = iconIdFor(target);
    const kind = target.kind === "obstacle" ? "hatch" : iconId ? "icon" : "circle";
    commands.push(command(kind, /** @type {AeroVisualRole} */ (role), rect, alpha, scale, iconId, target.kind === "obstacle", 4, target.id, progress));
    if (target.direction) {
      for (const cue of directionCueRects(rect, target.direction)) commands.push(command(cue.kind, /** @type {AeroVisualRole} */ (role), cue.rect, alpha, scale, null, false, 5, target.id, progress, true));
    }
    if (target.judgement === undefined || target.judgement === "pending") {
      commands.push(command("ring", /** @type {AeroVisualRole} */ (role), scaledRect(baseRect, lerp(tuning.approachRingScale, 1, progress)), 0.85, lerp(tuning.approachRingScale, 1, progress), null, false, 5, target.id, progress));
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
  if (target.kind === "guard") return target.family === "crossed_guard" ? "boxing.guard.crossed" : "boxing.guard.standard";
  if (target.kind === "punch") return `boxing.${target.family}.${target.hand}`;
  if (target.family === "squat") return "boxing.squat";
  if (target.family === "weave" && (target.hand === "left" || target.hand === "right")) return `boxing.weave.${target.hand}`;
  return null;
}

/** @param {AeroDrawKind} kind @param {AeroVisualRole} role @param {AeroNormalizedRect} rect @param {number} alpha @param {number} scale @param {string|null} iconId @param {boolean} hatch @param {number} layer @param {string|null} targetId @param {number} [saturation] @param {boolean} [contrast] @returns {AeroGameplayDrawCommand} */
function command(kind, role, rect, alpha, scale, iconId, hatch, layer, targetId, saturation = 1, contrast = false) {
  return Object.freeze({ kind, role, rect: Object.freeze({ ...rect }), alpha, scale, saturation: clamp(saturation, 0, 1), iconId, hatch, contrast, layer, targetId });
}

/** @param {AeroNormalizedRect} rect @param {import("@aerobeat/web-contracts/body-grid-contracts").AeroBodyGridDirection} direction @returns {readonly {kind:"line"|"circle",rect:AeroNormalizedRect}[]} */
function directionCueRects(rect, direction) {
  const supported = ["up", "up-right", "right", "down-right", "down", "down-left", "left", "up-left"];
  if (!supported.includes(direction)) throw new TypeError("Flow direction cue is unsupported");
  const thickness = Math.min(rect.width, rect.height) * 0.09;
  const diagonal = direction.includes("-");
  if (!diagonal) {
    // Preserve the original cardinal command geometry byte-for-byte.
    const horizontal = direction === "left" || direction === "right";
    const shaft = horizontal
      ? { x: rect.x + rect.width * 0.25, y: rect.y + rect.height * 0.5 - thickness / 2, width: rect.width * 0.5, height: thickness }
      : { x: rect.x + rect.width * 0.5 - thickness / 2, y: rect.y + rect.height * 0.25, width: thickness, height: rect.height * 0.5 };
    const size = thickness * 2.5;
    const headX = direction === "left" ? rect.x + rect.width * 0.2 : direction === "right" ? rect.x + rect.width * 0.8 : rect.x + rect.width * 0.5;
    const headY = direction === "up" ? rect.y + rect.height * 0.2 : direction === "down" ? rect.y + rect.height * 0.8 : rect.y + rect.height * 0.5;
    return Object.freeze([{ kind: "line", rect: Object.freeze(shaft) }, { kind: "circle", rect: Object.freeze({ x: headX - size / 2, y: headY - size / 2, width: size, height: size }) }]);
  }
  const xSign = direction.endsWith("right") ? 1 : -1;
  const ySign = direction.startsWith("down") ? 1 : -1;
  const segments = 7;
  /** @type {{kind:"line"|"circle",rect:AeroNormalizedRect}[]} */
  const cues = [];
  for (let index = 0; index < segments; index += 1) {
    const offset = -0.2 + index * (0.4 / (segments - 1));
    const centerX = rect.x + rect.width * (0.5 + xSign * offset);
    const centerY = rect.y + rect.height * (0.5 + ySign * offset);
    cues.push({ kind: "line", rect: Object.freeze({ x: centerX - thickness / 2, y: centerY - thickness / 2, width: thickness, height: thickness }) });
  }
  const size = thickness * 2.5;
  const headX = rect.x + rect.width * (0.5 + xSign * 0.3);
  const headY = rect.y + rect.height * (0.5 + ySign * 0.3);
  cues.push({ kind: "circle", rect: Object.freeze({ x: headX - size / 2, y: headY - size / 2, width: size, height: size }) });
  return Object.freeze(cues);
}

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
