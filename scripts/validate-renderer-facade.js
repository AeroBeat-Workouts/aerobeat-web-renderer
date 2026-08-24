// @ts-check

import assert from "node:assert/strict";

import {
  aeroWebGl2RendererServiceId,
  computeMediaContentRect,
  createAeroWebGl2Renderer,
  getAeroWebGl2RendererSingleton,
  mapNormalizedLandmarkToClipSpace,
  mapNormalizedLandmarkToViewport
} from "../src/index.js";

/**
 * @typedef {object} FakeCanvas
 * @property {number} width Drawing width.
 * @property {number} height Drawing height.
 * @property {(type: string, options?: WebGLContextAttributes) => FakeWebGl2 | null} getContext Gets fake context.
 */

/**
 * @typedef {object} FakeWebGl2
 * @property {number} COLOR_BUFFER_BIT Constant.
 * @property {number} ARRAY_BUFFER Constant.
 * @property {number} STREAM_DRAW Constant.
 * @property {number} FLOAT Constant.
 * @property {number} LINES Constant.
 * @property {number} POINTS Constant.
 * @property {number} VERTEX_SHADER Constant.
 * @property {number} FRAGMENT_SHADER Constant.
 * @property {number} COMPILE_STATUS Constant.
 * @property {number} LINK_STATUS Constant.
 * @property {number} drawingBufferWidth Drawing-buffer width.
 * @property {number} drawingBufferHeight Drawing-buffer height.
 * @property {number} clearCalls Clear calls.
 * @property {number} drawCalls Draw calls.
 * @property {(x: number, y: number, width: number, height: number) => void} viewport Sets viewport.
 * @property {(r: number, g: number, b: number, a: number) => void} clearColor Sets clear color.
 * @property {(mask: number) => void} clear Clears buffer.
 * @property {(type: number) => object | null} createShader Creates shader.
 * @property {(shader: object, source: string) => void} shaderSource Sets shader source.
 * @property {(shader: object) => void} compileShader Compiles shader.
 * @property {(shader: object, pname: number) => boolean} getShaderParameter Reads shader state.
 * @property {(shader: object) => string} getShaderInfoLog Reads shader log.
 * @property {() => object | null} createProgram Creates program.
 * @property {(program: object, shader: object) => void} attachShader Attaches shader.
 * @property {(program: object) => void} linkProgram Links program.
 * @property {(program: object, pname: number) => boolean} getProgramParameter Reads program state.
 * @property {(program: object) => string} getProgramInfoLog Reads program log.
 * @property {() => object | null} createBuffer Creates buffer.
 * @property {(program: object, name: string) => number} getAttribLocation Reads attribute location.
 * @property {(program: object, name: string) => object | null} getUniformLocation Reads uniform location.
 * @property {(program: object) => void} useProgram Uses program.
 * @property {(target: number, buffer: object) => void} bindBuffer Binds buffer.
 * @property {(target: number, data: Float32Array, usage: number) => void} bufferData Uploads data.
 * @property {(index: number) => void} enableVertexAttribArray Enables attribute.
 * @property {(index: number, size: number, type: number, normalized: boolean, stride: number, offset: number) => void} vertexAttribPointer Sets attribute pointer.
 * @property {(location: object | null, x: number, y: number, z: number, w: number) => void} uniform4f Sets vec4 uniform.
 * @property {(location: object | null, x: number) => void} uniform1f Sets float uniform.
 * @property {(mode: number, first: number, count: number) => void} drawArrays Draws arrays.
 */

const containRect = computeMediaContentRect({
  viewportWidth: 640,
  viewportHeight: 480,
  intrinsicWidth: 1280,
  intrinsicHeight: 720,
  fitMode: "contain",
  mirrored: false
});
assert.deepEqual(containRect, { x: 0, y: 60, width: 640, height: 360 });

const mirroredViewport = mapNormalizedLandmarkToViewport(
  { id: 1, x: 0.25, y: 0.5, v: 1 },
  {
    viewportWidth: 640,
    viewportHeight: 480,
    intrinsicWidth: 1280,
    intrinsicHeight: 720,
    fitMode: "contain",
    mirrored: true
  }
);
assert.equal(mirroredViewport.x, 480);
assert.equal(mirroredViewport.y, 240);

const coverClip = mapNormalizedLandmarkToClipSpace(
  { id: 2, x: 0.5, y: 0.5, v: 1 },
  {
    viewportWidth: 640,
    viewportHeight: 480,
    intrinsicWidth: 1280,
    intrinsicHeight: 720,
    fitMode: "cover",
    mirrored: false
  }
);
assert.equal(coverClip.x, 0);
assert.equal(coverClip.y, 0);

const unsupportedRenderer = createAeroWebGl2Renderer();
const unsupported = unsupportedRenderer.attach(/** @type {HTMLCanvasElement} */ (/** @type {unknown} */ ({
  width: 320,
  height: 180,
  getContext() {
    return null;
  }
})));
assert.equal(unsupported.state, "unsupported");
assert.equal(unsupported.supported, false);

const gl = createFakeWebGl2();
/** @type {FakeCanvas} */
const fakeCanvas = {
  width: 320,
  height: 180,
  getContext(type) {
    assert.equal(type, "webgl2");
    return gl;
  }
};

const renderer = createAeroWebGl2Renderer();
const attached = renderer.attach(/** @type {HTMLCanvasElement} */ (/** @type {unknown} */ (fakeCanvas)));
assert.equal(attached.serviceId, aeroWebGl2RendererServiceId);
assert.equal(attached.state, "ready");
assert.equal(attached.supported, true);

const frame = renderer.renderFrame({ color: [0.02, 0.04, 0.08, 1] });
assert.equal(frame.status.state, "running");
assert.equal(frame.status.frameCount, 1);
assert.equal(gl.clearCalls, 1);

const overlay = renderer.renderLandmarkOverlay(
  [
    { id: 0, x: 0.25, y: 0.25, v: 1 },
    { id: 1, x: 0.75, y: 0.75, v: 1 },
    { id: 2, x: 0.5, y: 0.5, v: 0.1 }
  ],
  {
    minVisibility: 0.35,
    connections: [[0, 1]],
    surface: {
      viewportWidth: 320,
      viewportHeight: 180,
      intrinsicWidth: 320,
      intrinsicHeight: 180,
      fitMode: "stretch",
      mirrored: false
    }
  }
);
assert.equal(overlay.pointCount, 2);
assert.equal(overlay.lineVertexCount, 2);
assert.equal(overlay.status.drawCount, 1);
assert.equal(gl.drawCalls, 2);

assert.equal(getAeroWebGl2RendererSingleton(), getAeroWebGl2RendererSingleton());

console.log("Renderer facade validation passed.");

/**
 * @returns {FakeWebGl2}
 */
function createFakeWebGl2() {
  return {
    COLOR_BUFFER_BIT: 0x4000,
    ARRAY_BUFFER: 0x8892,
    STREAM_DRAW: 0x88e0,
    FLOAT: 0x1406,
    LINES: 0x0001,
    POINTS: 0x0000,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    drawingBufferWidth: 320,
    drawingBufferHeight: 180,
    clearCalls: 0,
    drawCalls: 0,
    viewport() {},
    clearColor() {},
    clear() {
      this.clearCalls += 1;
    },
    createShader(type) {
      return { type };
    },
    shaderSource() {},
    compileShader() {},
    getShaderParameter() {
      return true;
    },
    getShaderInfoLog() {
      return "";
    },
    createProgram() {
      return {};
    },
    attachShader() {},
    linkProgram() {},
    getProgramParameter() {
      return true;
    },
    getProgramInfoLog() {
      return "";
    },
    createBuffer() {
      return {};
    },
    getAttribLocation() {
      return 0;
    },
    getUniformLocation() {
      return {};
    },
    useProgram() {},
    bindBuffer() {},
    bufferData() {},
    enableVertexAttribArray() {},
    vertexAttribPointer() {},
    uniform4f() {},
    uniform1f() {},
    drawArrays() {
      this.drawCalls += 1;
    }
  };
}
