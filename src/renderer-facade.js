// @ts-check

import { isThemeDescriptor } from "@aerobeat/web-contracts/theme-contracts";
import { normalizeIconAtlasData } from "./icon-atlas.js";
import { mapNormalizedLandmarkToClipSpace, normalizeOverlaySurfaceDescriptor } from "./landmark-mapping.js";
import { buildGameplayRenderPlan, defaultRendererThemeTokens } from "./gameplay-plan.js";
import { colorTokenToRgba, defaultRendererVisualProfile, normalizeBackgroundProjection, normalizeRendererTheme, normalizeRendererVisualProfile, rendererTuningFromVisualProfile } from "./visual-profiles.js";

/** @type {"aero.renderer.webgl2"} */
export const aeroWebGl2RendererServiceId = "aero.renderer.webgl2";
/** @typedef {import("./gameplay-plan.js").AeroGameplayFrame} AeroGameplayFrame */
/** @typedef {import("./gameplay-plan.js").AeroGameplayRenderPlan} AeroGameplayRenderPlan */
/** @typedef {import("./gameplay-plan.js").AeroRendererThemeTokens} AeroRendererThemeTokens */
/** @typedef {import("./gameplay-plan.js").AeroRendererTuning} AeroRendererTuning */
/** @typedef {import("./icon-atlas.js").AeroIconAtlasData} AeroIconAtlasData */
/** @typedef {import("./landmark-mapping.js").AeroNormalizedLandmark} AeroNormalizedLandmark */
/** @typedef {import("./landmark-mapping.js").AeroRendererOverlaySurfaceDescriptorInput} AeroRendererOverlaySurfaceDescriptorInput */
/** @typedef {"unsupported"|"ready"|"running"|"context_lost"|"error"|"destroyed"} AeroRendererState */
/** @typedef {{widthCssPx:number,heightCssPx:number,devicePixelRatio:number,maxDevicePixelRatio?:number}} AeroRendererResize */
/** @typedef {{surface?:AeroRendererOverlaySurfaceDescriptorInput,connections?:readonly (readonly [number,number])[],minVisibility?:number,color?:readonly [number,number,number,number],pointSize?:number}} AeroRendererOverlayOptions */
/** @typedef {"nose"|"left_wrist"|"right_wrist"} AeroGameplayCursorRole */
/** @typedef {{role:AeroGameplayCursorRole,x:number,y:number,confidence:number}} AeroGameplayCursor */
/** @typedef {{grid:Readonly<{x:number,y:number,width:number,height:number}>,minConfidence?:number,sizeCssPx?:number}} AeroGameplayCursorOptions */
/** @typedef {{status:AeroWebGl2RendererStatus,cursorCount:number,roles:readonly AeroGameplayCursorRole[]}} AeroGameplayCursorResult */
/** @typedef {{serviceId:"aero.renderer.webgl2",state:AeroRendererState,supported:boolean,attached:boolean,contextLost:boolean,destroyed:boolean,frameCount:number,drawCount:number,viewportWidth:number,viewportHeight:number,widthCssPx:number,heightCssPx:number,devicePixelRatio:number,themeId:string,themeVersion:string,themeHash:string,tuningId:string,tuningVersion:string,tuningHash:string,tuningRequiresRegeneration:false,visualProfile:import("./visual-profiles.js").AeroRendererVisualProfileSelection,visualProfileIdentity:import("./visual-profiles.js").AeroRendererVisualIdentity,visualProfileSettings:import("./visual-profiles.js").AeroRendererVisualSettings,experimental:true,iconAtlasReady:boolean,iconAtlasError:string|null,errorMessage:string|null}} AeroWebGl2RendererStatus */
/** @typedef {{serviceId:"aero.renderer.webgl2",webgl2:boolean,exactContainerResize:true,dprAware:true,contextLossRecovery:true,alphaMaskIcons:boolean,liveTuning:true,maxDevicePixelRatio:number,degradations:readonly string[]}} AeroWebGl2RendererCapabilities */
/** @typedef {{program:WebGLProgram,buffer:WebGLBuffer,positionLocation:number,localLocation:number,colorLocation:WebGLUniformLocation|null,shapeLocation:WebGLUniformLocation|null,ringWidthLocation:WebGLUniformLocation|null}} ShapeProgram */
/** @typedef {{program:WebGLProgram,buffer:WebGLBuffer,positionLocation:number,localLocation:number,colorLocation:WebGLUniformLocation|null,uvRectLocation:WebGLUniformLocation|null,samplerLocation:WebGLUniformLocation|null,rotationLocation:WebGLUniformLocation|null}} IconProgram */
/** @typedef {{program:WebGLProgram,buffer:WebGLBuffer,positionLocation:number,colorLocation:WebGLUniformLocation|null,pointSizeLocation:WebGLUniformLocation|null}} OverlayProgram */

/**
 * Per-game renderer. No process-global singleton exists: each connected aero-game owns
 * one instance and one canvas/context lifecycle.
 */
export class AeroWebGl2Renderer {
  /** @param {{contextAttributes?:WebGLContextAttributes}} [options] */
  constructor(options = {}) {
    this.serviceId = aeroWebGl2RendererServiceId;
    this.contextAttributes = options.contextAttributes ?? { alpha: true, antialias: true, premultipliedAlpha: true };
    /** @type {HTMLCanvasElement|null} */ this.canvas = null;
    /** @type {WebGL2RenderingContext|null} */ this.gl = null;
    /** @type {ShapeProgram|null} */ this.shapeProgram = null;
    /** @type {IconProgram|null} */ this.iconProgram = null;
    /** @type {OverlayProgram|null} */ this.overlayProgram = null;
    /** @type {WebGLTexture|null} */ this.iconTexture = null;
    /** @type {AeroIconAtlasData|null} */ this.iconAtlasData = null;
    /** @type {Map<string, import("./icon-atlas.js").AeroIconAtlasEntry>} */ this.iconEntries = new Map();
    /** @type {AeroRendererState} */ this.state = "unsupported";
    /** @type {AeroRendererThemeTokens} */ this.theme = defaultRendererThemeTokens;
    this.visualProfile = defaultRendererVisualProfile;
    /** @type {AeroRendererTuning} */ this.tuning = rendererTuningFromVisualProfile(this.visualProfile);
    this.themeId = "aero.theme.default";
    this.themeVersion = "1";
    this.themeHash = "theme-default";
    this.background = normalizeBackgroundProjection(null);
    this.iconAtlasError = /** @type {string|null} */ (null);
    this.errorMessage = /** @type {string|null} */ (null);
    this.frameCount = 0; this.drawCount = 0;
    this.widthCssPx = 0; this.heightCssPx = 0; this.devicePixelRatio = 1;
    this.contextLost = false; this.destroyed = false;
    this.onContextLost = (event) => { event.preventDefault(); this.contextLost = true; this.state = "context_lost"; this.releaseGpuReferences(false); };
    this.onContextRestored = () => { if (!this.canvas || this.destroyed) return; this.contextLost = false; this.acquireContext(); };
  }

  /** @param {HTMLCanvasElement} canvas @param {WebGLContextAttributes} [options] @returns {AeroWebGl2RendererStatus} */
  attach(canvas, options = this.contextAttributes) {
    if (this.destroyed) return this.describe();
    if (this.canvas !== canvas) this.detach();
    this.canvas = canvas;
    this.contextAttributes = options;
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    this.acquireContext();
    return this.describe();
  }

  /** @returns {AeroWebGl2RendererStatus} */
  detach() {
    if (this.canvas) {
      this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
      this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    }
    this.deleteGpuResources();
    this.canvas = null; this.gl = null; this.contextLost = false;
    if (!this.destroyed) this.state = "unsupported";
    return this.describe();
  }

  /** @param {AeroRendererResize} size @returns {AeroWebGl2RendererStatus} */
  resize(size) {
    if (!this.canvas || this.destroyed) return this.describe();
    this.widthCssPx = finiteNonNegative(size.widthCssPx);
    this.heightCssPx = finiteNonNegative(size.heightCssPx);
    const cap = Math.max(1, Math.min(size.maxDevicePixelRatio ?? this.tuning.dprCap, this.tuning.dprCap));
    this.devicePixelRatio = Math.max(0.1, Math.min(Number.isFinite(size.devicePixelRatio) ? size.devicePixelRatio : 1, cap));
    const width = Math.max(1, Math.round(this.widthCssPx * this.devicePixelRatio));
    const height = Math.max(1, Math.round(this.heightCssPx * this.devicePixelRatio));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.canvas.style.width = `${this.widthCssPx}px`;
    this.canvas.style.height = `${this.heightCssPx}px`;
    this.configureViewport();
    return this.describe();
  }

  /** @param {unknown} descriptor @returns {AeroWebGl2RendererStatus} */
  setTheme(descriptor) {
    if (this.destroyed) return this.describe();
    const normalized = normalizeRendererTheme(descriptor);
    const accepted = isThemeDescriptor(descriptor) && normalized !== defaultRendererThemeTokens;
    this.theme = normalized;
    this.themeId = accepted ? descriptor.id : "aero.theme.default";
    this.themeVersion = accepted ? descriptor.themeVersion : "1";
    this.themeHash = accepted ? descriptor.contentHash.value : "theme-default";
    return this.describe();
  }

  /** @param {unknown} selection @returns {AeroWebGl2RendererStatus} */
  setTuning(selection) { return this.importTuning(selection); }
  /** @param {unknown} selection @returns {AeroWebGl2RendererStatus} */
  importTuning(selection) {
    if (this.destroyed) return this.describe();
    const visualProfile = normalizeRendererVisualProfile(selection);
    const tuning = rendererTuningFromVisualProfile(visualProfile);
    this.visualProfile = visualProfile;
    this.tuning = tuning;
    return this.describe();
  }
  /** @returns {AeroWebGl2RendererStatus} */
  resetTuning() { if (!this.destroyed) { this.visualProfile = defaultRendererVisualProfile; this.tuning = rendererTuningFromVisualProfile(this.visualProfile); } return this.describe(); }
  /** @returns {import("./visual-profiles.js").AeroRendererVisualProfileSelection} */
  exportTuning() { return this.visualProfile; }
  /** @returns {AeroWebGl2RendererStatus} */
  getSnapshot() { return this.describe(); }
  /** @param {unknown} background @returns {AeroWebGl2RendererStatus} */
  setBackgroundProjection(background) { if (!this.destroyed) this.background = normalizeBackgroundProjection(background); return this.describe(); }

  /** @param {AeroIconAtlasData} atlas @returns {AeroWebGl2RendererStatus} */
  uploadIconAtlas(atlas) {
    if (this.destroyed) return this.describe();
    let normalized;
    try {
      normalized = normalizeIconAtlasData(atlas);
    } catch (error) {
      if (this.gl && this.iconTexture) this.gl.deleteTexture(this.iconTexture);
      this.iconTexture = null;
      this.iconAtlasData = null;
      this.iconEntries.clear();
      this.iconAtlasError = error instanceof Error ? error.message : "Icon atlas is invalid";
      return this.describe();
    }
    this.iconAtlasData = normalized;
    this.iconEntries = new Map(normalized.entries.map((entry) => [entry.id, entry]));
    this.iconAtlasError = null;
    const gl = this.gl;
    if (!gl) return this.describe();
    if (this.iconTexture) gl.deleteTexture(this.iconTexture);
    const texture = gl.createTexture();
    if (!texture) { this.iconAtlasError = "Unable to create icon atlas texture"; return this.describe(); }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, normalized.width, normalized.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, normalized.pixels);
    this.iconTexture = texture;
    return this.describe();
  }

  /** @param {AeroGameplayFrame} frame @returns {{status:AeroWebGl2RendererStatus,plan:AeroGameplayRenderPlan}} */
  renderGameplayFrame(frame) {
    const width = this.widthCssPx > 0 ? this.widthCssPx : this.gl?.drawingBufferWidth ?? 0;
    const height = this.heightCssPx > 0 ? this.heightCssPx : this.gl?.drawingBufferHeight ?? 0;
    const viewportAspect = frame.viewportAspect ?? (width > 0 && height > 0 ? width / height : 4 / 3);
    const plan = buildGameplayRenderPlan({ ...frame, viewportAspect }, this.theme, this.tuning);
    const gl = this.gl;
    if (!gl || this.destroyed || this.contextLost) return { status: this.describe(), plan };
    try {
      this.configureViewport();
      const background = colorTokenToRgba(this.background.colors[0], [0.03, 0.08, 0.15, 1]);
      gl.clearColor(background[0], background[1], background[2], background[3]);
      gl.clear(gl.COLOR_BUFFER_BIT);
      for (const draw of plan.commands) this.drawCommand(draw);
      if (plan.overlay.dim > 0) this.drawShape({ x: 0, y: 0, width: 1, height: 1 }, [0, 0, 0, plan.overlay.dim], 0, 0.08);
      if (plan.overlay.countdown !== null) this.drawCountdown(plan.overlay.countdown);
      this.frameCount += 1; this.state = "running";
    } catch (error) { this.fail(error); }
    return { status: this.describe(), plan };
  }

  /** @param {{color?:readonly [number,number,number,number]}} [options] */
  clear(options = {}) {
    const gl = this.gl;
    if (!gl || this.destroyed) return { status: this.describe() };
    const color = options.color ?? [0, 0, 0, 0]; this.configureViewport(); gl.clearColor(...color); gl.clear(gl.COLOR_BUFFER_BIT); this.frameCount += 1; this.state = "running"; return { status: this.describe() };
  }
  /** @param {{color?:readonly [number,number,number,number]}} [options] */
  renderFrame(options = {}) { return this.clear(options); }

  /** @param {readonly AeroNormalizedLandmark[]} landmarks @param {AeroRendererOverlayOptions} [options] */
  renderLandmarkOverlay(landmarks, options = {}) {
    const gl = this.gl;
    if (!gl || this.destroyed) return { status: this.describe(), pointCount: 0, lineVertexCount: 0 };
    try {
      const program = this.overlayProgram ?? createOverlayProgram(gl); this.overlayProgram = program;
      const surface = normalizeOverlaySurfaceDescriptor({ viewportWidth: gl.drawingBufferWidth, viewportHeight: gl.drawingBufferHeight, ...options.surface });
      const visible = landmarks.filter((landmark) => (typeof landmark.v === "number" ? landmark.v : 1) >= (options.minVisibility ?? 0));
      const points = visible.flatMap((landmark) => { const clip = mapNormalizedLandmarkToClipSpace(landmark, surface); return [clip.x, clip.y]; });
      const byId = new Map(visible.map((landmark) => [landmark.id, landmark]));
      /** @type {number[]} */ const lines = [];
      for (const pair of options.connections ?? []) { const a = byId.get(pair[0]); const b = byId.get(pair[1]); if (a && b) { const ac = mapNormalizedLandmarkToClipSpace(a, surface); const bc = mapNormalizedLandmarkToClipSpace(b, surface); lines.push(ac.x, ac.y, bc.x, bc.y); } }
      drawOverlay(gl, program, lines, gl.LINES, options); drawOverlay(gl, program, points, gl.POINTS, options);
      this.drawCount += 1; this.state = "running";
      return { status: this.describe(), pointCount: points.length / 2, lineVertexCount: lines.length / 2 };
    } catch (error) { this.fail(error); return { status: this.describe(), pointCount: 0, lineVertexCount: 0 }; }
  }

  /**
   * Draws bounded semantic gameplay cursors after a gameplay frame. Coordinates are
   * already-calibrated athlete positions normalized within the supplied playfield grid.
   * The method is deliberately stateless: callers redraw current cursors after every
   * `renderGameplayFrame`, which keeps stale tracking evidence off the canvas.
   *
   * @param {readonly AeroGameplayCursor[]} cursors
   * @param {AeroGameplayCursorOptions} options
   * @returns {AeroGameplayCursorResult}
   */
  renderGameplayCursors(cursors, options) {
    const normalizedOptions = normalizeGameplayCursorOptions(options);
    const grid = normalizeGameplayCursorGrid(normalizedOptions.grid);
    const minConfidence = Math.max(0, Math.min(1, finitePositiveOrZero(normalizedOptions.minConfidence, 0.5)));
    const sizeCssPx = Math.max(12, Math.min(64, finitePositive(normalizedOptions.sizeCssPx, 18)));
    const current = normalizeGameplayCursors(cursors, minConfidence);
    const gl = this.gl;
    if (!gl || this.destroyed || this.contextLost || this.widthCssPx <= 0 || this.heightCssPx <= 0) return Object.freeze({ status:this.describe(), cursorCount:0, roles:Object.freeze([]) });
    const roles = /** @type {AeroGameplayCursorRole[]} */ ([]);
    try {
      for (const role of gameplayCursorRoles) {
        const cursor = current.get(role);
        if (!cursor) continue;
        const centerX = grid.x + cursor.x * grid.width;
        const centerY = grid.y + cursor.y * grid.height;
        const centerColor = role === "nose" ? /** @type {const} */ ([1,0.76,0.04,1]) : this.roleColor(role === "left_wrist" ? "left" : "right", 1, 1);
        this.drawCursorLayer(centerX, centerY, sizeCssPx, [0,0,0,1]);
        this.drawCursorLayer(centerX, centerY, sizeCssPx * 0.76, [1,1,1,1]);
        this.drawCursorLayer(centerX, centerY, sizeCssPx * 0.48, centerColor);
        roles.push(role);
        this.drawCount += 3;
      }
      if (roles.length > 0) this.state = "running";
      return Object.freeze({ status:this.describe(), cursorCount:roles.length, roles:Object.freeze(roles) });
    } catch (error) {
      this.fail(error);
      return Object.freeze({ status:this.describe(), cursorCount:0, roles:Object.freeze([]) });
    }
  }

  /** @returns {AeroWebGl2RendererCapabilities} */
  getCapabilities() {
    const degradations = [];
    if (!this.gl) degradations.push("webgl2_unavailable");
    if (!this.iconTexture) degradations.push(this.iconAtlasError ? "icon_atlas_invalid_fallback_shapes" : "icon_atlas_unavailable_fallback_shapes");
    if (this.background.kind === "linear-gradient" && this.background.colors.length > 1) degradations.push("gradient_background_projected_to_primary_color");
    return Object.freeze({ serviceId: aeroWebGl2RendererServiceId, webgl2: Boolean(this.gl), exactContainerResize: true, dprAware: true, contextLossRecovery: true, alphaMaskIcons: Boolean(this.iconTexture), liveTuning: true, maxDevicePixelRatio: this.tuning.dprCap, degradations: Object.freeze(degradations) });
  }

  /** @returns {AeroWebGl2RendererStatus} */
  describe() {
    return Object.freeze({ serviceId: aeroWebGl2RendererServiceId, state: this.state, supported: Boolean(this.gl), attached: Boolean(this.canvas && this.gl), contextLost: this.contextLost, destroyed: this.destroyed, frameCount: this.frameCount, drawCount: this.drawCount, viewportWidth: this.gl?.drawingBufferWidth ?? this.canvas?.width ?? 0, viewportHeight: this.gl?.drawingBufferHeight ?? this.canvas?.height ?? 0, widthCssPx: this.widthCssPx, heightCssPx: this.heightCssPx, devicePixelRatio: this.devicePixelRatio, themeId: this.themeId, themeVersion: this.themeVersion, themeHash: this.themeHash, tuningId: this.tuning.id, tuningVersion: this.tuning.version, tuningHash: this.tuning.hash, tuningRequiresRegeneration: false, visualProfile: this.visualProfile, visualProfileIdentity: this.visualProfile.identity, visualProfileSettings: this.visualProfile.settings, experimental: true, iconAtlasReady: Boolean(this.iconTexture), iconAtlasError: this.iconAtlasError, errorMessage: this.errorMessage });
  }

  /** @returns {AeroWebGl2RendererStatus} */
  destroy() { if (this.destroyed) return this.describe(); this.destroyed = true; this.detach(); this.state = "destroyed"; this.iconEntries.clear(); this.iconAtlasData = null; return this.describe(); }

  acquireContext() {
    if (!this.canvas || this.destroyed) return;
    try { const context = this.canvas.getContext("webgl2", this.contextAttributes); if (!context) { this.gl = null; this.state = "unsupported"; this.errorMessage = "WebGL2 is unavailable for this canvas"; return; } this.gl = context; this.state = "ready"; this.errorMessage = null; this.contextLost = false; context.enable(context.BLEND); context.blendFunc(context.SRC_ALPHA, context.ONE_MINUS_SRC_ALPHA); this.configureViewport(); if (this.iconAtlasData) this.uploadIconAtlas(this.iconAtlasData); }
    catch (error) { this.gl = null; this.fail(error); }
  }
  configureViewport() { if (this.gl) this.gl.viewport(0, 0, this.gl.drawingBufferWidth || this.canvas?.width || 1, this.gl.drawingBufferHeight || this.canvas?.height || 1); }
  /** @param {import("./gameplay-plan.js").AeroGameplayDrawCommand} draw */
  drawCommand(draw) {
    const roleColor = draw.contrast ? this.cueContrastColor(draw.role, draw.alpha, draw.saturation) : this.roleColor(draw.role, draw.alpha, draw.saturation);
    const color = draw.colorMode === "white" ? /** @type {const} */ ([1,1,1,draw.alpha]) : blendWhite(roleColor, draw.whiten);
    if (draw.kind === "icon" && draw.iconId && this.iconTexture && this.iconEntries.has(draw.iconId)) this.drawIcon(draw.rect, color, this.iconEntries.get(draw.iconId), draw.rotationRad);
    else this.drawShape(draw.rect, color, draw.kind === "circle" ? 1 : draw.kind === "ring" ? 2 : draw.kind === "hatch" ? 3 : 0, this.tuning.approachRingWidth);
    this.drawCount += 1;
  }
  /** @param {string} role @param {number} alpha @param {number} saturation @returns {readonly [number,number,number,number]} */
  roleColor(role, alpha, saturation) {
    const fallback = /** @type {const} */ ([0.85, 0.95, 1, alpha]);
    const token = role === "left" ? this.theme.leftHandColor : role === "right" ? this.theme.rightHandColor : role === "guard" ? this.theme.guardColor : role === "obstacle" ? this.theme.obstacleColor : role === "safe" ? "#56d6c9" : this.theme.receptorColor;
    const color = colorTokenToRgba(token, fallback);
    const gray = color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
    return [gray + (color[0] - gray) * saturation, gray + (color[1] - gray) * saturation, gray + (color[2] - gray) * saturation, color[3] * alpha];
  }
  /** @param {string} role @param {number} alpha @param {number} saturation @returns {readonly [number,number,number,number]} */
  cueContrastColor(role, alpha, saturation) {
    const target = this.roleColor(role, alpha, saturation);
    const luminance = relativeLuminance(target[0], target[1], target[2]);
    const blackContrast = (luminance + 0.05) / 0.05;
    const whiteContrast = 1.05 / (luminance + 0.05);
    const channel = whiteContrast > blackContrast ? 1 : 0;
    return [channel, channel, channel, target[3]];
  }
  /** @param {number} centerX @param {number} centerY @param {number} diameterCssPx @param {readonly [number,number,number,number]} color */
  drawCursorLayer(centerX, centerY, diameterCssPx, color) { const width = diameterCssPx / this.widthCssPx; const height = diameterCssPx / this.heightCssPx; this.drawShape({ x:centerX-width/2,y:centerY-height/2,width,height }, color, 1, 0); }
  /** @param {{x:number,y:number,width:number,height:number}} rect @param {readonly [number,number,number,number]} color @param {number} shape @param {number} ringWidth */
  drawShape(rect, color, shape, ringWidth) { const gl = this.gl; if (!gl) return; const program = this.shapeProgram ?? createShapeProgram(gl); this.shapeProgram = program; uploadQuad(gl, program.buffer, program.positionLocation, program.localLocation, rect); gl.useProgram(program.program); gl.uniform4f(program.colorLocation, ...color); gl.uniform1i(program.shapeLocation, shape); gl.uniform1f(program.ringWidthLocation, ringWidth); gl.drawArrays(gl.TRIANGLES, 0, 6); }
  /** @param {{x:number,y:number,width:number,height:number}} rect @param {readonly [number,number,number,number]} color @param {import("./icon-atlas.js").AeroIconAtlasEntry|undefined} entry @param {number} rotationRad */
  drawIcon(rect, color, entry, rotationRad) { const gl = this.gl; if (!gl || !entry || !this.iconTexture) return; const program = this.iconProgram ?? createIconProgram(gl); this.iconProgram = program; uploadQuad(gl, program.buffer, program.positionLocation, program.localLocation, rect); gl.useProgram(program.program); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.iconTexture); gl.uniform1i(program.samplerLocation, 0); gl.uniform4f(program.colorLocation, ...color); gl.uniform4f(program.uvRectLocation, entry.u0, entry.v0, entry.u1, entry.v1); gl.uniform1f(program.rotationLocation, rotationRad); gl.drawArrays(gl.TRIANGLES, 0, 6); }
  /** @param {number} value */
  drawCountdown(value) { const segments = countdownSegments(value); for (const rect of segments) this.drawShape(rect, [1, 1, 1, 0.94], 0, 0.1); }
  deleteGpuResources() { const gl = this.gl; if (gl) { for (const program of [this.shapeProgram, this.iconProgram, this.overlayProgram]) { if (program) { gl.deleteBuffer(program.buffer); gl.deleteProgram(program.program); } } if (this.iconTexture) gl.deleteTexture(this.iconTexture); } this.releaseGpuReferences(true); }
  /** @param {boolean} clearEntries */
  releaseGpuReferences(clearEntries) { this.shapeProgram = null; this.iconProgram = null; this.overlayProgram = null; this.iconTexture = null; if (clearEntries) this.iconEntries.clear(); }
  /** @param {unknown} error */
  fail(error) { this.state = "error"; this.errorMessage = error instanceof Error ? error.message : "Renderer operation failed"; }
}

/** @param {{contextAttributes?:WebGLContextAttributes}} [options] @returns {AeroWebGl2Renderer} */
export function createAeroWebGl2Renderer(options) { return new AeroWebGl2Renderer(options); }

/** Canonical draw order also makes returned role evidence deterministic. @type {readonly AeroGameplayCursorRole[]} */
const gameplayCursorRoles = Object.freeze(["nose","left_wrist","right_wrist"]);
const gameplayCursorRoleSet = new Set(gameplayCursorRoles);
const maxGameplayCursorCandidates = 12;

/**
 * @param {unknown} value
 * @returns {AeroGameplayCursorOptions}
 */
function normalizeGameplayCursorOptions(value) {
  if (!isPlainDataRecord(value)) throw new TypeError("Gameplay cursor options are required");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(descriptors).some((key) => !["grid","minConfidence","sizeCssPx"].includes(key))) throw new TypeError("Gameplay cursor options contain unsupported fields");
  if (!isDataDescriptor(descriptors.grid)) throw new TypeError("Gameplay cursor grid is required");
  for (const key of ["minConfidence","sizeCssPx"]) if (descriptors[key] && !isDataDescriptor(descriptors[key])) throw new TypeError(`Gameplay cursor ${key} must be data`);
  return /** @type {AeroGameplayCursorOptions} */ ({ grid:descriptors.grid.value,minConfidence:descriptors.minConfidence?.value,sizeCssPx:descriptors.sizeCssPx?.value });
}

/**
 * Invalid and repeated semantic candidates are intentionally omitted. Candidate count is
 * bounded before inspection so malformed callers cannot turn a three-cursor draw into
 * unbounded work. Accessor-bearing records are never invoked.
 * @param {unknown} value
 * @param {number} minConfidence
 * @returns {ReadonlyMap<AeroGameplayCursorRole,AeroGameplayCursor>}
 */
function normalizeGameplayCursors(value, minConfidence) {
  if (!Array.isArray(value)) throw new TypeError("Gameplay cursors must be an array");
  if (value.length > maxGameplayCursorCandidates) throw new TypeError(`Gameplay cursors cannot exceed ${maxGameplayCursorCandidates} candidates`);
  /** @type {Map<AeroGameplayCursorRole,AeroGameplayCursor>} */ const normalized = new Map();
  for (const candidate of value) {
    if (!isPlainDataRecord(candidate)) continue;
    const descriptors = Object.getOwnPropertyDescriptors(candidate);
    if (Object.keys(descriptors).length !== 4 || ["role","x","y","confidence"].some((key) => !isDataDescriptor(descriptors[key]))) continue;
    const role = descriptors.role.value;
    if (!gameplayCursorRoleSet.has(role) || normalized.has(role)) continue;
    const cursor = /** @type {AeroGameplayCursor} */ ({ role,x:descriptors.x.value,y:descriptors.y.value,confidence:descriptors.confidence.value });
    if (validGameplayCursor(cursor, minConfidence)) normalized.set(role, Object.freeze(cursor));
  }
  return normalized;
}

/** @param {unknown} value @returns {{x:number,y:number,width:number,height:number}} */
function normalizeGameplayCursorGrid(value) {
  if (!isPlainDataRecord(value)) throw new TypeError("Gameplay cursor grid is required");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = ["x","y","width","height"];
  const allowed = [...keys,"columns","rows"];
  if (Object.keys(descriptors).some((key) => !allowed.includes(key)) || keys.some((key) => !isDataDescriptor(descriptors[key])) || ["columns","rows"].some((key) => descriptors[key] && !isDataDescriptor(descriptors[key]))) throw new TypeError("Gameplay cursor grid must contain exact data coordinates");
  if ((descriptors.columns && descriptors.columns.value !== 4) || (descriptors.rows && descriptors.rows.value !== 3)) throw new TypeError("Gameplay cursor grid dimensions must remain 4x3");
  const [x,y,width,height] = keys.map((key) => descriptors[key].value);
  if (![x,y,width,height].every((entry) => typeof entry === "number" && Number.isFinite(entry))) throw new TypeError("Gameplay cursor grid must contain finite coordinates");
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) throw new TypeError("Gameplay cursor grid must remain inside normalized viewport space");
  return { x,y,width,height };
}

/** @param {AeroGameplayCursor|undefined} cursor @param {number} minConfidence @returns {cursor is AeroGameplayCursor} */
function validGameplayCursor(cursor, minConfidence) { return Boolean(cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y) && cursor.x >= 0 && cursor.x <= 1 && cursor.y >= 0 && cursor.y <= 1 && Number.isFinite(cursor.confidence) && cursor.confidence >= minConfidence); }

/** @param {unknown} value @returns {value is Record<string,unknown>} */
function isPlainDataRecord(value) { if (!value || typeof value !== "object" || Array.isArray(value)) return false; const prototype = Object.getPrototypeOf(value); return prototype === Object.prototype || prototype === null; }
/** @param {PropertyDescriptor|undefined} descriptor @returns {descriptor is PropertyDescriptor & {value:unknown}} */
function isDataDescriptor(descriptor) { return Boolean(descriptor && Object.hasOwn(descriptor, "value") && descriptor.get === undefined && descriptor.set === undefined); }

/** @param {number|undefined} value @param {number} fallback */
function finitePositive(value, fallback) { return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback; }
/** @param {number|undefined} value @param {number} fallback */
function finitePositiveOrZero(value, fallback) { return Number.isFinite(value) && Number(value) >= 0 ? Number(value) : fallback; }

/** @param {WebGL2RenderingContext} gl @returns {ShapeProgram} */
function createShapeProgram(gl) { const program = linkProgram(gl, QUAD_VERTEX, SHAPE_FRAGMENT); const buffer = requiredBuffer(gl); return { program, buffer, positionLocation: gl.getAttribLocation(program, "a_position"), localLocation: gl.getAttribLocation(program, "a_local"), colorLocation: gl.getUniformLocation(program, "u_color"), shapeLocation: gl.getUniformLocation(program, "u_shape"), ringWidthLocation: gl.getUniformLocation(program, "u_ringWidth") }; }
/** @param {WebGL2RenderingContext} gl @returns {IconProgram} */
function createIconProgram(gl) { const program = linkProgram(gl, QUAD_VERTEX, ICON_FRAGMENT); const buffer = requiredBuffer(gl); return { program, buffer, positionLocation: gl.getAttribLocation(program, "a_position"), localLocation: gl.getAttribLocation(program, "a_local"), colorLocation: gl.getUniformLocation(program, "u_color"), uvRectLocation: gl.getUniformLocation(program, "u_uvRect"), samplerLocation: gl.getUniformLocation(program, "u_mask"), rotationLocation: gl.getUniformLocation(program, "u_rotation") }; }
/** @param {WebGL2RenderingContext} gl @returns {OverlayProgram} */
function createOverlayProgram(gl) { const program = linkProgram(gl, `#version 300 es\nin vec2 a_position; uniform float u_pointSize; void main(){gl_Position=vec4(a_position,0.,1.);gl_PointSize=u_pointSize;}`, `#version 300 es\nprecision mediump float; uniform vec4 u_color; out vec4 outColor; void main(){outColor=u_color;}`); return { program, buffer: requiredBuffer(gl), positionLocation: gl.getAttribLocation(program, "a_position"), colorLocation: gl.getUniformLocation(program, "u_color"), pointSizeLocation: gl.getUniformLocation(program, "u_pointSize") }; }
/** @param {WebGL2RenderingContext} gl @param {string} vertex @param {string} fragment */
function linkProgram(gl, vertex, fragment) { const vs = compile(gl, gl.VERTEX_SHADER, vertex); const fs = compile(gl, gl.FRAGMENT_SHADER, fragment); const program = gl.createProgram(); if (!program) throw new Error("Unable to create renderer program"); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program); gl.deleteShader(vs); gl.deleteShader(fs); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Unable to link renderer program"); return program; }
/** @param {WebGL2RenderingContext} gl @param {number} type @param {string} source */
function compile(gl, type, source) { const shader = gl.createShader(type); if (!shader) throw new Error("Unable to create renderer shader"); gl.shaderSource(shader, source); gl.compileShader(shader); if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "Unable to compile renderer shader"); return shader; }
/** @param {WebGL2RenderingContext} gl */
function requiredBuffer(gl) { const buffer = gl.createBuffer(); if (!buffer) throw new Error("Unable to create renderer buffer"); return buffer; }
/** @param {WebGL2RenderingContext} gl @param {WebGLBuffer} buffer @param {number} positionLocation @param {number} localLocation @param {{x:number,y:number,width:number,height:number}} rect */
function uploadQuad(gl, buffer, positionLocation, localLocation, rect) { const x0 = rect.x * 2 - 1; const x1 = (rect.x + rect.width) * 2 - 1; const y0 = 1 - rect.y * 2; const y1 = 1 - (rect.y + rect.height) * 2; const values = new Float32Array([x0,y0,0,0,x1,y0,1,0,x0,y1,0,1,x0,y1,0,1,x1,y0,1,0,x1,y1,1,1]); gl.useProgram(null); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, values, gl.STREAM_DRAW); gl.enableVertexAttribArray(positionLocation); gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0); gl.enableVertexAttribArray(localLocation); gl.vertexAttribPointer(localLocation, 2, gl.FLOAT, false, 16, 8); }
/** @param {WebGL2RenderingContext} gl @param {OverlayProgram} program @param {number[]} vertices @param {number} primitive @param {AeroRendererOverlayOptions} options */
function drawOverlay(gl, program, vertices, primitive, options) { if (vertices.length === 0) return; const color = options.color ?? [0.24,0.9,0.45,0.95]; gl.useProgram(program.program); gl.bindBuffer(gl.ARRAY_BUFFER, program.buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW); gl.enableVertexAttribArray(program.positionLocation); gl.vertexAttribPointer(program.positionLocation,2,gl.FLOAT,false,0,0); gl.uniform4f(program.colorLocation,...color); gl.uniform1f(program.pointSizeLocation, options.pointSize ?? 6); gl.drawArrays(primitive,0,vertices.length/2); }
/** @param {number} value @returns {readonly {x:number,y:number,width:number,height:number}[]} */
function countdownSegments(value) { const horizontal = (y) => ({x:0.43,y,width:0.14,height:0.025}); const left = (y) => ({x:0.43,y,width:0.025,height:0.12}); const right = (y) => ({x:0.545,y,width:0.025,height:0.12}); if (value === 1) return [right(0.36), right(0.51)]; if (value === 2) return [horizontal(0.34),right(0.36),horizontal(0.49),left(0.51),horizontal(0.64)]; return [horizontal(0.34),right(0.36),horizontal(0.49),right(0.51),horizontal(0.64)]; }
/** @param {number} value */
function finiteNonNegative(value) { return Number.isFinite(value) ? Math.max(0, value) : 0; }
/** @param {readonly [number,number,number,number]} color @param {number} amount @returns {readonly [number,number,number,number]} */
function blendWhite(color, amount) { const value = Math.max(0,Math.min(1,amount)); return [color[0]+(1-color[0])*value,color[1]+(1-color[1])*value,color[2]+(1-color[2])*value,color[3]]; }

/** @param {number} red @param {number} green @param {number} blue */
function relativeLuminance(red, green, blue) {
  const linear = (channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  return linear(red) * 0.2126 + linear(green) * 0.7152 + linear(blue) * 0.0722;
}

const QUAD_VERTEX = `#version 300 es
in vec2 a_position; in vec2 a_local; out vec2 v_local; void main(){v_local=a_local;gl_Position=vec4(a_position,0.,1.);}`;
const SHAPE_FRAGMENT = `#version 300 es
precision mediump float; in vec2 v_local; uniform vec4 u_color; uniform int u_shape; uniform float u_ringWidth; out vec4 outColor;
void main(){float d=distance(v_local,vec2(.5)); if(u_shape==1 && d>.5) discard; if(u_shape==2 && abs(d-.43)>u_ringWidth*.5) discard; vec4 color=u_color; if(u_shape==3 && mod(floor((v_local.x+v_local.y)*18.),2.)<1.) color.rgb*=.48; outColor=color;}`;
const ICON_FRAGMENT = `#version 300 es
precision mediump float; in vec2 v_local; uniform sampler2D u_mask; uniform vec4 u_color; uniform vec4 u_uvRect; uniform float u_rotation; out vec4 outColor;
void main(){float c=cos(u_rotation);float s=sin(u_rotation);vec2 p=v_local-vec2(.5);vec2 q=vec2(c*p.x+s*p.y,-s*p.x+c*p.y)+vec2(.5);if(any(lessThan(q,vec2(0.)))||any(greaterThan(q,vec2(1.)))) discard;vec2 uv=mix(u_uvRect.xy,u_uvRect.zw,q);float alpha=texture(u_mask,uv).a;if(alpha<.02) discard;outColor=vec4(u_color.rgb,u_color.a*alpha);}`;
