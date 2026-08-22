import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const page=await readFile(new URL("../src/pages/DegreePlanner/index.tsx",import.meta.url),"utf8")

assert.match(page,/<details className="program-requirements-disclosure">/)
assert.doesNotMatch(page,/<details className="program-requirements-disclosure" open/)
assert.match(page,/<summary>View program requirements/)
assert.match(page,/groups\.length.*confirmed requirement area/)
assert.doesNotMatch(page,/not tracked from this document/)
assert.match(page,/Completion is determined from your coursework, not from this guide\./)

console.log("Confirmed program-guide disclosure presentation checks passed")
