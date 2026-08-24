// @ts-check

import {
  mapNormalizedLandmarkToClipSpace,
  normalizeOverlaySurfaceDescriptor
} from "./landmark-mapping.js";

/**
 * AeroBeat-owned WebGL2 renderer service ID.
 *
 * @type {"aero.renderer.webgl2"}
 */
export const aeroWebGl2RendererServiceId = "aero.renderer.webgl2";

/**
 * Renderer lifecycle states.
 *
 * @typedef {"unsupported" | "ready" | "running" | "error"} AeroRendererState
 */

/**
 * @typedef {import("./landmark-mapping.js").AeroNormalizedLandmark} AeroNormalizedLandmark
 * @typedef {import("./landmark-mapping.js").AeroRendererOverlaySurfaceDescriptorInput} AeroRendererOverlaySurfaceDescriptorInput
 */

/**
 * Renderer status snapshot.
 *
 * @typedef {object} AeroWebGl2RendererStatus
 * @property {"aero.renderer.webgl2"} serviceId Stable service ID.
 * @property {AeroRendererState} state Current renderer state.
 * @property {boolean} supported Whether a WebGL2 context is attached.
 * @property {boolean} attached Whether a canvas/context is currently retained.
 * @property {number} frameCount Render helper calls since attach.
 * @property {number} drawCount Overlay draw calls since attach.
 * @property {number} viewportWidth Current drawing-buffer width.
 * @property {number} viewportHeight Current drawing-buffer height.
 * @property {string | undefined} errorMessage Last renderer error message.
 */

/**
 * @typedef {object} AeroRendererClearOptions
 * @property {readonly [number, number, number, number] | undefined} color RGBA clear color.
 */

/**
 * @typedef {object} AeroRendererOverlayOptions
 * @property {AeroRendererOverlaySurfaceDescriptorInput | undefined} surface Media surface mapping metadata.
 * @property {readonly (readonly [number, number])[] | undefined} connections Landmark ID pairs to render as lines.
 * @property {number | undefined} minVisibility Minimum accepted `v` value.
 * @property {readonly [number, number, number, number] | undefined} color RGBA overlay color.
 * @property {number | undefined} pointSize Landmark point size in pixels.
 */

/**
 * @typedef {object} AeroRendererFrameResult
 * @property {AeroWebGl2RendererStatus} status Renderer status after the operation.
 */

/**
 * @typedef {object} AeroRendererOverlayResult
 * @property {AeroWebGl2RendererStatus} status Renderer status after the operation.
 * @property {number} pointCount Number of visible landmarks submitted.
 * @property {number} lineVertexCount Number of line vertices submitted.
 */

/**
 * @typedef {object} AeroWebGl2Renderer
 * @property {"aero.renderer.webgl2"} serviceId Stable service ID.
 * @property {(canvas: HTMLCanvasElement, options?: WebGLContextAttributes) => AeroWebGl2RendererStatus} attach Attaches a canvas and acquires WebGL2.
 * @property {() => AeroWebGl2RendererStatus} detach Releases the retained canvas/context references.
 * @property {() => AeroWebGl2RendererStatus} describe Reports current capability and state.
 * @property {(options?: AeroRendererClearOptions) => AeroRendererFrameResult} clear Clears the current viewport.
 * @property {(options?: AeroRendererClearOptions) => AeroRendererFrameResult} renderFrame Smoke-friendly frame helper.
 * @property {(landmarks: readonly AeroNormalizedLandmark[], options?: AeroRendererOverlayOptions) => AeroRendererOverlayResult} renderLandmarkOverlay Draws normalized landmarks as WebGL2 points and lines.
 */

/**
 * @typedef {object} OverlayProgram
 * @property {WebGLProgram} program Linked WebGL program.
 * @property {number} positionLocation Position attribute location.
 * @property {WebGLUniformLocation | null} colorLocation Overlay color uniform.
 * @property {WebGLUniformLocation | null} pointSizeLocation Point size uniform.
 * @property {WebGLBuffer} buffer Vertex buffer.
 */

/** @type {AeroWebGl2Renderer | undefined} */
let rendererSingleton;

/**
 * Returns the process-local renderer singleton facade used by assembly wiring.
 *
 * @returns {AeroWebGl2Renderer}
 */
export function getAeroWebGl2RendererSingleton() {
  rendererSingleton ??= createAeroWebGl2Renderer();
  return rendererSingleton;
}

/**
 * Creates a WebGL2 renderer facade. This owns durable overlay rendering; 2D
 * canvas overlays may remain temporary proving aids outside this package.
 *
 * @returns {AeroWebGl2Renderer}
 */
export function createAeroWebGl2Renderer() {
  /** @type {HTMLCanvasElement | undefined} */
  let canvas;
  /** @type {WebGL2RenderingContext | undefined} */
  let gl;
  /** @type {OverlayProgram | undefined} */
  let overlayProgram;
  /** @type {AeroRendererState} */
  let state = "unsupported";
  /** @type {string | undefined} */
  let errorMessage;
  let frameCount = 0;
  let drawCount = 0;

  return {
    serviceId: aeroWebGl2RendererServiceId,
    attach(nextCanvas, options = {}) {
      canvas = nextCanvas;
      overlayProgram = undefined;
      frameCount = 0;
      drawCount = 0;
      errorMessage = undefined;
      try {
        const context = nextCanvas.getContext("webgl2", options);
        if (!context) {
          gl = undefined;
          state = "unsupported";
          errorMessage = "WebGL2 is unavailable for this canvas";
          return describe();
        }
        gl = context;
        state = "ready";
        configureViewport(gl, canvas);
        return describe();
      } catch (error) {
        gl = undefined;
        state = "error";
        errorMessage = readErrorMessage(error);
        return describe();
      }
    },
    detach() {
      canvas = undefined;
      gl = undefined;
      overlayProgram = undefined;
      state = "unsupported";
      errorMessage = undefined;
      return describe();
    },
    describe,
    clear(options = {}) {
      return clearFrame(options);
    },
    renderFrame(options = {}) {
      return clearFrame(options);
    },
    renderLandmarkOverlay(landmarks, options = {}) {
      if (!gl) {
        state = state === "error" ? "error" : "unsupported";
        return { status: describe(), pointCount: 0, lineVertexCount: 0 };
      }
      configureViewport(gl, canvas);
      try {
        const program = overlayProgram ?? createOverlayProgram(gl);
        overlayProgram = program;
        const surface = normalizeOverlaySurfaceDescriptor({
          viewportWidth: gl.drawingBufferWidth,
          viewportHeight: gl.drawingBufferHeight,
          ...options.surface
        });
        const visible = landmarks.filter((landmark) => isVisibleLandmark(landmark, options.minVisibility ?? 0));
        const pointVertices = visible.flatMap((landmark) => {
          const clip = mapNormalizedLandmarkToClipSpace(landmark, surface);
          return [clip.x, clip.y];
        });
        const lineVertices = buildLineVertices(visible, options.connections ?? [], surface);
        drawVertices(gl, program, lineVertices, gl.LINES, options);
        drawVertices(gl, program, pointVertices, gl.POINTS, options);
        state = "running";
        drawCount += 1;
        return {
          status: describe(),
          pointCount: pointVertices.length / 2,
          lineVertexCount: lineVertices.length / 2
        };
      } catch (error) {
        state = "error";
        errorMessage = readErrorMessage(error);
        return { status: describe(), pointCount: 0, lineVertexCount: 0 };
      }
    }
  };

  /**
   * @returns {AeroWebGl2RendererStatus}
   */
  function describe() {
    return {
      serviceId: aeroWebGl2RendererServiceId,
      state,
      supported: Boolean(gl),
      attached: Boolean(canvas && gl),
      frameCount,
      drawCount,
      viewportWidth: gl?.drawingBufferWidth ?? canvas?.width ?? 0,
      viewportHeight: gl?.drawingBufferHeight ?? canvas?.height ?? 0,
      errorMessage
    };
  }

  /**
   * @param {AeroRendererClearOptions} options
   * @returns {AeroRendererFrameResult}
   */
  function clearFrame(options) {
    if (!gl) {
      state = state === "error" ? "error" : "unsupported";
      return { status: describe() };
    }
    configureViewport(gl, canvas);
    const color = options.color ?? [0, 0, 0, 0];
    gl.clearColor(color[0], color[1], color[2], color[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    state = "running";
    frameCount += 1;
    return { status: describe() };
  }
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {HTMLCanvasElement | undefined} canvas
 * @returns {void}
 */
function configureViewport(gl, canvas) {
  const width = gl.drawingBufferWidth || canvas?.width || 0;
  const height = gl.drawingBufferHeight || canvas?.height || 0;
  gl.viewport(0, 0, width, height);
}

/**
 * @param {WebGL2RenderingContext} gl
 * @returns {OverlayProgram}
 */
function createOverlayProgram(gl) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, `#version 300 es
in vec2 a_position;
uniform float u_pointSize;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  gl_PointSize = u_pointSize;
}`);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
precision mediump float;
uniform vec4 u_color;
out vec4 outColor;
void main() {
  outColor = u_color;
}`);
  const program = gl.createProgram();
  if (!program) {
    throw new Error("Unable to create overlay shader program");
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Unable to link overlay shader program");
  }
  const buffer = gl.createBuffer();
  if (!buffer) {
    throw new Error("Unable to create overlay vertex buffer");
  }
  return {
    program,
    positionLocation: gl.getAttribLocation(program, "a_position"),
    colorLocation: gl.getUniformLocation(program, "u_color"),
    pointSizeLocation: gl.getUniformLocation(program, "u_pointSize"),
    buffer
  };
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {number} type
 * @param {string} source
 * @returns {WebGLShader}
 */
function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Unable to create overlay shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "Unable to compile overlay shader");
  }
  return shader;
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {OverlayProgram} program
 * @param {number[]} vertices
 * @param {number} primitive
 * @param {AeroRendererOverlayOptions} options
 * @returns {void}
 */
function drawVertices(gl, program, vertices, primitive, options) {
  if (vertices.length === 0) {
    return;
  }
  const color = options.color ?? [0.24, 0.9, 0.45, 0.95];
  gl.useProgram(program.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, program.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);
  gl.enableVertexAttribArray(program.positionLocation);
  gl.vertexAttribPointer(program.positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.uniform4f(program.colorLocation, color[0], color[1], color[2], color[3]);
  gl.uniform1f(program.pointSizeLocation, options.pointSize ?? 6);
  gl.drawArrays(primitive, 0, vertices.length / 2);
}

/**
 * @param {readonly AeroNormalizedLandmark[]} landmarks
 * @param {readonly (readonly [number, number])[]} connections
 * @param {AeroRendererOverlaySurfaceDescriptorInput} surface
 * @returns {number[]}
 */
function buildLineVertices(landmarks, connections, surface) {
  /** @type {Map<number, AeroNormalizedLandmark>} */
  const byId = new Map();
  for (const landmark of landmarks) {
    if (typeof landmark.id === "number") {
      byId.set(landmark.id, landmark);
    }
  }
  /** @type {number[]} */
  const vertices = [];
  for (const connection of connections) {
    const start = byId.get(connection[0]);
    const end = byId.get(connection[1]);
    if (!start || !end) {
      continue;
    }
    const startClip = mapNormalizedLandmarkToClipSpace(start, surface);
    const endClip = mapNormalizedLandmarkToClipSpace(end, surface);
    vertices.push(startClip.x, startClip.y, endClip.x, endClip.y);
  }
  return vertices;
}

/**
 * @param {AeroNormalizedLandmark} landmark
 * @param {number} minVisibility
 * @returns {boolean}
 */
function isVisibleLandmark(landmark, minVisibility) {
  const visibility = typeof landmark.v === "number" ? landmark.v : 1;
  return visibility >= minVisibility;
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function readErrorMessage(error) {
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message;
    return typeof message === "string" ? message : "Renderer operation failed";
  }
  return "Renderer operation failed";
}
