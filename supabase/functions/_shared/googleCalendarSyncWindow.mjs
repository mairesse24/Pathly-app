export const FREE_BUSY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000
export const MAX_SYNC_RANGE_MS = 366 * 24 * 60 * 60 * 1000

export function resolveSyncWindow(body, now = new Date()) {
  const timeMin = body.time_min && !Number.isNaN(Date.parse(body.time_min)) ? new Date(body.time_min) : new Date(now)
  const timeMax = body.time_max && !Number.isNaN(Date.parse(body.time_max))
    ? new Date(body.time_max)
    : new Date(timeMin.getTime() + FREE_BUSY_WINDOW_MS)
  if (timeMax <= timeMin || timeMax.getTime() - timeMin.getTime() > MAX_SYNC_RANGE_MS) return null
  return { timeMin, timeMax }
}

export function chunkSyncWindow(timeMin, timeMax) {
  const windows = []
  for (let start = timeMin.getTime(); start < timeMax.getTime(); start += FREE_BUSY_WINDOW_MS) {
    windows.push({
      timeMin: new Date(start),
      timeMax: new Date(Math.min(start + FREE_BUSY_WINDOW_MS, timeMax.getTime())),
    })
  }
  return windows
}
