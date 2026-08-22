import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const css = readFileSync(new URL("../src/uiAudit.css", import.meta.url), "utf8")
const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8")

assert.match(main, /import ['"]\.\/uiAudit\.css['"]/)
assert.match(css, /:root\[data-theme="dark"\] \.academic-disclaimer/)
assert.match(css, /:root\[data-theme="dark"\] \.degree-empty-state/)
assert.match(css, /:root\[data-theme="dark"\] \.privacy-notice/)
assert.match(css, /:root\[data-theme="dark"\] \.day\.today \.calendar-day-button/)
assert.match(css, /:root\[data-theme="dark"\] \.calendar-overdue-banner/)
assert.match(css, /:root\[data-theme="dark"\] \.calendar-save-banner/)

console.log("theme-boundary specificity checks passed")
