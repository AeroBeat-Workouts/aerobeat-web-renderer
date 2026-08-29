// @ts-check

export { AeroWebGl2Renderer, aeroWebGl2RendererServiceId, createAeroWebGl2Renderer } from "./renderer-facade.js";
export { applyNamedEasing, buildGameplayRenderPlan, cellRect, defaultRendererThemeTokens, defaultRendererTuning, fitPlayfieldGrid, gameplayIconIds } from "./gameplay-plan.js";
export { normalizeBrandingIconManifest, normalizeIconAtlasData, rasterizeBrandingIconAtlas } from "./icon-atlas.js";
export { colorTokenToRgba, compactRendererVisualProfile, defaultRendererVisualProfile, normalizeBackgroundProjection, normalizeRendererTheme, normalizeRendererTuning, normalizeRendererVisualProfile } from "./visual-profiles.js";
export { computeMediaContentRect, mapNormalizedLandmarkToClipSpace, mapNormalizedLandmarkToViewport, normalizeOverlaySurfaceDescriptor } from "./landmark-mapping.js";
