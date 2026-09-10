// @ts-check

import assert from "node:assert/strict";
import { isExpectedReadPixelsWarning, READ_PIXELS_WARNING_TEXT } from "./browser-console-policy.js";

assert.equal(isExpectedReadPixelsWarning("warning", READ_PIXELS_WARNING_TEXT, ""), true);

const adversaries = [
  ["error", READ_PIXELS_WARNING_TEXT, "", "wrong console type"],
  ["warn", READ_PIXELS_WARNING_TEXT, "", "non-Playwright warning spelling"],
  ["warning", READ_PIXELS_WARNING_TEXT, "http://127.0.0.1/app.js", "application source URL"],
  ["warning", READ_PIXELS_WARNING_TEXT, "unknown", "unknown source URL"],
  ["warning", `prefix ${READ_PIXELS_WARNING_TEXT}`, "", "message prefix"],
  ["warning", `${READ_PIXELS_WARNING_TEXT} suffix`, "", "message suffix"],
  ["warning", `${READ_PIXELS_WARNING_TEXT}\napplication failure`, "", "composed message"],
  ["warning", "GPU stall due to ReadPixels", "", "partial diagnostic"],
  ["warning", "unrelated warning", "", "unrelated warning"],
  ["error", "unrelated error", "http://127.0.0.1/app.js", "unrelated error"]
];

for (const [type, text, sourceUrl, label] of adversaries) {
  assert.equal(isExpectedReadPixelsWarning(type, text, sourceUrl), false, label);
}

console.log("Exact browser console policy adversarial oracle passed.");
