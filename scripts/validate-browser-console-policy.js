// @ts-check

import assert from "node:assert/strict";
import {
  isExpectedReadPixelsWarning,
  READ_PIXELS_WARNING_BODY,
  READ_PIXELS_WARNING_REPEAT_SUFFIX
} from "./browser-console-policy.js";

const expectedPageUrl = "http://127.0.0.1:4173/.testbed/demo/index.html";
const warning = `[.WebGL-0x12ab09]${READ_PIXELS_WARNING_BODY}`;
const repeatedWarning = `${warning}${READ_PIXELS_WARNING_REPEAT_SUFFIX}`;
const accepts = (type, text, sourceUrl, lineNumber, columnNumber, expectedUrl = expectedPageUrl) => (
  isExpectedReadPixelsWarning(type, text, sourceUrl, lineNumber, columnNumber, expectedUrl)
);

assert.equal(accepts("warning", warning, expectedPageUrl, 0, 0), true, "exact Chromium warning");
assert.equal(accepts("warning", repeatedWarning, expectedPageUrl, 0, 0), true, "exact repeat-ending warning");
assert.equal(accepts("warning", warning, expectedPageUrl, 0, 0), true, "duplicate exact warning remains accepted");

const adversaries = [
  ["error", warning, expectedPageUrl, 0, 0, expectedPageUrl, "wrong console type"],
  ["warn", warning, expectedPageUrl, 0, 0, expectedPageUrl, "non-Playwright warning spelling"],
  ["warning", `[.WebGL-0x]${READ_PIXELS_WARNING_BODY}`, expectedPageUrl, 0, 0, expectedPageUrl, "empty context id"],
  ["warning", `[.WebGL-0xAB12]${READ_PIXELS_WARNING_BODY}`, expectedPageUrl, 0, 0, expectedPageUrl, "uppercase context id"],
  ["warning", `[.WebGL-0x12xz]${READ_PIXELS_WARNING_BODY}`, expectedPageUrl, 0, 0, expectedPageUrl, "nonhex context id"],
  ["warning", `prefix ${warning}`, expectedPageUrl, 0, 0, expectedPageUrl, "message prefix"],
  ["warning", `${warning} suffix`, expectedPageUrl, 0, 0, expectedPageUrl, "message suffix"],
  ["warning", `${warning}\napplication failure`, expectedPageUrl, 0, 0, expectedPageUrl, "composed message"],
  ["warning", `${warning}\n`, expectedPageUrl, 0, 0, expectedPageUrl, "trailing newline"],
  ["warning", `${warning} (this message may no longer repeat)`, expectedPageUrl, 0, 0, expectedPageUrl, "mutated repeat suffix"],
  ["warning", READ_PIXELS_WARNING_BODY, expectedPageUrl, 0, 0, expectedPageUrl, "missing Chromium context prefix"],
  ["warning", warning, "http://localhost:4173/.testbed/demo/index.html", 0, 0, expectedPageUrl, "wrong URL origin"],
  ["warning", warning, "http://127.0.0.1:4174/.testbed/demo/index.html", 0, 0, expectedPageUrl, "wrong URL port"],
  ["warning", warning, "http://127.0.0.1:4173/.testbed/demo/other.html", 0, 0, expectedPageUrl, "wrong URL path"],
  ["warning", warning, expectedPageUrl, 1, 0, expectedPageUrl, "same-page application line"],
  ["warning", warning, expectedPageUrl, 0, 1, expectedPageUrl, "same-page application column"],
  ["warning", warning, expectedPageUrl, 0, 0, "http://127.0.0.1:4173/.testbed/demo/other.html", "wrong expected page URL"],
  ["warning", "unrelated warning", expectedPageUrl, 0, 0, expectedPageUrl, "unrelated warning"],
  ["error", "unrelated error", expectedPageUrl, 0, 0, expectedPageUrl, "unrelated error"]
];

for (const [type, text, sourceUrl, lineNumber, columnNumber, expectedUrl, label] of adversaries) {
  assert.equal(accepts(type, text, sourceUrl, lineNumber, columnNumber, expectedUrl), false, label);
}

console.log("Exact browser console policy adversarial oracle passed.");
