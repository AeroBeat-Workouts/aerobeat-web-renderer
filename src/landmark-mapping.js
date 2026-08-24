// @ts-check

/**
 * Media fitting modes shared with `@aerobeat/web-video` descriptors.
 *
 * @typedef {"stretch" | "contain" | "cover"} AeroRendererFitMode
 */

/**
 * Normalized pose or hand landmark accepted by the renderer overlay path.
 *
 * @typedef {object} AeroNormalizedLandmark
 * @property {number | undefined} id Optional landmark identifier.
 * @property {number} x Normalized horizontal position in source media space.
 * @property {number} y Normalized vertical position in source media space.
 * @property {number | undefined} z Optional normalized depth.
 * @property {number | undefined} v Optional visibility/confidence.
 */

/**
 * Pixel rectangle occupied by fitted media content inside a render viewport.
 *
 * @typedef {object} AeroRendererContentRect
 * @property {number} x Left edge in viewport pixels.
 * @property {number} y Top edge in viewport pixels.
 * @property {number} width Width in viewport pixels.
 * @property {number} height Height in viewport pixels.
 */

/**
 * Surface metadata used to map normalized landmarks over media. It is designed
 * to accept public metadata from `@aerobeat/web-video` without importing that
 * package or owning its lifecycle.
 *
 * @typedef {object} AeroRendererOverlaySurfaceDescriptor
 * @property {number} viewportWidth Canvas drawing-buffer or viewport width.
 * @property {number} viewportHeight Canvas drawing-buffer or viewport height.
 * @property {number | undefined} intrinsicWidth Source media intrinsic width.
 * @property {number | undefined} intrinsicHeight Source media intrinsic height.
 * @property {AeroRendererFitMode} fitMode Presentation fit mode.
 * @property {boolean} mirrored Whether normalized x should be mirrored.
 * @property {AeroRendererContentRect | undefined} contentRect Explicit fitted media rectangle, when already known.
 */

/**
 * Viewport-space landmark after fitting and mirroring.
 *
 * @typedef {object} AeroViewportLandmark
 * @property {number | undefined} id Optional landmark identifier.
 * @property {number} x Pixel-space horizontal position.
 * @property {number} y Pixel-space vertical position.
 * @property {number | undefined} z Optional normalized depth.
 * @property {number | undefined} v Optional visibility/confidence.
 */

/**
 * Clip-space landmark suitable for direct WebGL2 drawing.
 *
 * @typedef {object} AeroClipSpaceLandmark
 * @property {number | undefined} id Optional landmark identifier.
 * @property {number} x Clip-space horizontal position.
 * @property {number} y Clip-space vertical position.
 * @property {number | undefined} z Optional normalized depth.
 * @property {number | undefined} v Optional visibility/confidence.
 */

/**
 * @typedef {object} AeroRendererOverlaySurfaceDescriptorInput
 * @property {number | undefined} viewportWidth Canvas drawing-buffer or viewport width.
 * @property {number | undefined} viewportHeight Canvas drawing-buffer or viewport height.
 * @property {number | undefined} width Alternate viewport width.
 * @property {number | undefined} height Alternate viewport height.
 * @property {number | undefined} intrinsicWidth Source media intrinsic width.
 * @property {number | undefined} intrinsicHeight Source media intrinsic height.
 * @property {number | undefined} videoWidth Alternate source media width.
 * @property {number | undefined} videoHeight Alternate source media height.
 * @property {AeroRendererFitMode | undefined} fitMode Presentation fit mode.
 * @property {boolean | undefined} mirrored Whether normalized x should be mirrored.
 * @property {boolean | undefined} mirror Alternate mirror flag.
 * @property {AeroRendererContentRect | undefined} contentRect Explicit fitted media rectangle.
 */

/**
 * Normalizes a partial descriptor into the renderer's mapping shape.
 *
 * @param {AeroRendererOverlaySurfaceDescriptorInput} [descriptor]
 * @returns {AeroRendererOverlaySurfaceDescriptor}
 */
export function normalizeOverlaySurfaceDescriptor(descriptor = {}) {
  return {
    viewportWidth: positiveNumberOrZero(descriptor.viewportWidth ?? descriptor.width),
    viewportHeight: positiveNumberOrZero(descriptor.viewportHeight ?? descriptor.height),
    intrinsicWidth: positiveNumberOrUndefined(descriptor.intrinsicWidth ?? descriptor.videoWidth),
    intrinsicHeight: positiveNumberOrUndefined(descriptor.intrinsicHeight ?? descriptor.videoHeight),
    fitMode: normalizeFitMode(descriptor.fitMode),
    mirrored: Boolean(descriptor.mirrored ?? descriptor.mirror ?? false),
    contentRect: descriptor.contentRect
  };
}

/**
 * Computes the fitted media rectangle inside a viewport.
 *
 * @param {AeroRendererOverlaySurfaceDescriptorInput | AeroRendererOverlaySurfaceDescriptor} descriptor
 * @returns {AeroRendererContentRect}
 */
export function computeMediaContentRect(descriptor) {
  const surface = normalizeOverlaySurfaceDescriptor(descriptor);
  if (surface.contentRect) {
    return sanitizeRect(surface.contentRect);
  }
  if (surface.viewportWidth <= 0 || surface.viewportHeight <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  if (
    surface.fitMode === "stretch" ||
    !surface.intrinsicWidth ||
    !surface.intrinsicHeight
  ) {
    return { x: 0, y: 0, width: surface.viewportWidth, height: surface.viewportHeight };
  }

  const containScale = Math.min(
    surface.viewportWidth / surface.intrinsicWidth,
    surface.viewportHeight / surface.intrinsicHeight
  );
  const coverScale = Math.max(
    surface.viewportWidth / surface.intrinsicWidth,
    surface.viewportHeight / surface.intrinsicHeight
  );
  const scale = surface.fitMode === "cover" ? coverScale : containScale;
  const width = surface.intrinsicWidth * scale;
  const height = surface.intrinsicHeight * scale;
  return {
    x: (surface.viewportWidth - width) * 0.5,
    y: (surface.viewportHeight - height) * 0.5,
    width,
    height
  };
}

/**
 * Maps a normalized landmark to viewport pixels, respecting fit and mirror.
 *
 * @param {AeroNormalizedLandmark} landmark
 * @param {AeroRendererOverlaySurfaceDescriptorInput | AeroRendererOverlaySurfaceDescriptor} descriptor
 * @returns {AeroViewportLandmark}
 */
export function mapNormalizedLandmarkToViewport(landmark, descriptor) {
  const surface = normalizeOverlaySurfaceDescriptor(descriptor);
  const rect = computeMediaContentRect(surface);
  const normalizedX = clamp01(landmark.x);
  const x = surface.mirrored ? 1 - normalizedX : normalizedX;
  return {
    id: landmark.id,
    x: rect.x + x * rect.width,
    y: rect.y + clamp01(landmark.y) * rect.height,
    z: landmark.z,
    v: landmark.v
  };
}

/**
 * Maps a normalized landmark to WebGL clip space.
 *
 * @param {AeroNormalizedLandmark} landmark
 * @param {AeroRendererOverlaySurfaceDescriptorInput | AeroRendererOverlaySurfaceDescriptor} descriptor
 * @returns {AeroClipSpaceLandmark}
 */
export function mapNormalizedLandmarkToClipSpace(landmark, descriptor) {
  const surface = normalizeOverlaySurfaceDescriptor(descriptor);
  const viewport = mapNormalizedLandmarkToViewport(landmark, surface);
  return {
    id: landmark.id,
    x: surface.viewportWidth > 0 ? (viewport.x / surface.viewportWidth) * 2 - 1 : 0,
    y: surface.viewportHeight > 0 ? 1 - (viewport.y / surface.viewportHeight) * 2 : 0,
    z: landmark.z,
    v: landmark.v
  };
}

/**
 * @param {AeroRendererFitMode | undefined} value
 * @returns {AeroRendererFitMode}
 */
function normalizeFitMode(value) {
  return value === "cover" || value === "stretch" || value === "contain" ? value : "contain";
}

/**
 * @param {number | undefined} value
 * @returns {number}
 */
function positiveNumberOrZero(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * @param {number | undefined} value
 * @returns {number | undefined}
 */
function positiveNumberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * @param {number} value
 * @returns {number}
 */
function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1);
}

/**
 * @param {AeroRendererContentRect} rect
 * @returns {AeroRendererContentRect}
 */
function sanitizeRect(rect) {
  return {
    x: finiteNumberOrZero(rect.x),
    y: finiteNumberOrZero(rect.y),
    width: positiveNumberOrZero(rect.width),
    height: positiveNumberOrZero(rect.height)
  };
}

/**
 * @param {number} value
 * @returns {number}
 */
function finiteNumberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}
