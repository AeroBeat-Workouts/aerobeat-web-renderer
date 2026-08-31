// @ts-check

export { AeroPlayCanvasRenderer, aeroPlayCanvasRendererServiceId, createAeroPlayCanvasRenderer } from "./renderer-facade.js";
export { buildGameplaySceneModel, defaultGameplayTimingWindow, defaultRendererThemeTokens, defaultRendererTuning, gameplayIconIds, gameplayWorldGrid, timestampToWorldZ, worldPositionForCell } from "./gameplay-scene-model.js";
export { normalizeBrandingIconManifest, normalizeIconAtlasData, rasterizeBrandingIconAtlas } from "./icon-atlas.js";
export { colorTokenToRgba, compactRendererVisualProfile, defaultRendererVisualProfile, normalizeBackgroundProjection, normalizeRendererTheme, normalizeRendererTuning, normalizeRendererVisualProfile } from "./visual-profiles.js";
export { computeMediaContentRect, mapNormalizedLandmarkToClipSpace, mapNormalizedLandmarkToViewport, normalizeOverlaySurfaceDescriptor } from "./landmark-mapping.js";
