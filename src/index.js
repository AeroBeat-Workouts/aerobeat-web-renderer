// @ts-check

export { AeroWebGl2Renderer, aeroWebGl2RendererServiceId, createAeroWebGl2Renderer } from "./renderer-facade.js";
export { buildGameplayRenderPlan, cellRect, defaultRendererThemeTokens, defaultRendererTuning, gameplayIconIds } from "./gameplay-plan.js";
export { normalizeBrandingIconManifest, rasterizeBrandingIconAtlas } from "./icon-atlas.js";
export { colorTokenToRgba, normalizeBackgroundProjection, normalizeRendererTheme, normalizeRendererTuning } from "./visual-profiles.js";
export { computeMediaContentRect, mapNormalizedLandmarkToClipSpace, mapNormalizedLandmarkToViewport, normalizeOverlaySurfaceDescriptor } from "./landmark-mapping.js";
