// @ts-check

export const READ_PIXELS_WARNING_BODY = "GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels";
export const READ_PIXELS_WARNING_REPEAT_SUFFIX = " (this message will no longer repeat)";
export const READ_PIXELS_WARNING_PATTERN = /^\[\.WebGL-0x[0-9a-f]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels(?: \(this message will no longer repeat\))?$(?![\s\S])/;

/**
 * Returns whether a browser console tuple is the established Chromium
 * ReadPixels diagnostic for one exact validator page.
 *
 * @param {string} type
 * @param {string} text
 * @param {string} sourceUrl
 * @param {number} lineNumber
 * @param {number} columnNumber
 * @param {string} expectedPageUrl
 * @returns {boolean}
 */
export function isExpectedReadPixelsWarning(type, text, sourceUrl, lineNumber, columnNumber, expectedPageUrl) {
  return type === "warning"
    && READ_PIXELS_WARNING_PATTERN.test(text)
    && sourceUrl === expectedPageUrl
    && lineNumber === 0
    && columnNumber === 0;
}
