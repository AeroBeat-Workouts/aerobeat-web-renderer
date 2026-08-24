// @ts-check

import {
  aeroWebGl2RendererServiceId,
  computeMediaContentRect,
  mapNormalizedLandmarkToClipSpace
} from "../../src/index.js";

/** @type {HTMLElement | null} */
const app = document.querySelector("#app");

if (app instanceof HTMLElement) {
  const surface = {
    viewportWidth: 640,
    viewportHeight: 480,
    intrinsicWidth: 1280,
    intrinsicHeight: 720,
    fitMode: "contain",
    mirrored: true
  };
  app.textContent = JSON.stringify({
    serviceId: aeroWebGl2RendererServiceId,
    contentRect: computeMediaContentRect(surface),
    centerClip: mapNormalizedLandmarkToClipSpace({ id: 0, x: 0.5, y: 0.5 }, surface)
  });
}
