// @ts-check

export const READ_PIXELS_WARNING_TEXT = "GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels";

/**
 * Returns whether a browser console tuple is the one established Chromium
 * ReadPixels diagnostic that browser validation may ignore.
 *
 * @param {string} type
 * @param {string} text
 * @param {string} sourceUrl
 * @returns {boolean}
 */
export function isExpectedReadPixelsWarning(type, text, sourceUrl) {
  return type === "warning" && text === READ_PIXELS_WARNING_TEXT && sourceUrl === "";
}
