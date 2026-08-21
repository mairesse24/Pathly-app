import assert from "node:assert/strict"
import test from "node:test"
import {
  chunkSyncWindow,
  FREE_BUSY_WINDOW_MS,
  resolveSyncWindow,
} from "../supabase/functions/_shared/googleCalendarSyncWindow.mjs"

test("default FreeBusy sync starts now and covers exactly the next 90 days", () => {
  const now = new Date("2026-08-20T12:00:00.000Z")
  const window = resolveSyncWindow({}, now)
  assert.ok(window)
  assert.equal(window.timeMin.toISOString(), now.toISOString())
  assert.equal(window.timeMax.getTime() - window.timeMin.getTime(), FREE_BUSY_WINDOW_MS)
})

test("no Google FreeBusy request window can exceed 90 days", () => {
  const timeMin = new Date("2026-01-01T00:00:00.000Z")
  const timeMax = new Date("2026-07-30T00:00:00.000Z")
  const chunks = chunkSyncWindow(timeMin, timeMax)
  assert.equal(chunks.length, 3)
  assert.ok(chunks.every(chunk => chunk.timeMax.getTime() - chunk.timeMin.getTime() <= FREE_BUSY_WINDOW_MS))
  assert.equal(chunks[0].timeMin.toISOString(), timeMin.toISOString())
  assert.equal(chunks.at(-1).timeMax.toISOString(), timeMax.toISOString())
})
