// India has no DST, so a fixed offset is safe and avoids a date library.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

export function istParts(date = new Date()) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  }
}

/** YYYYMMDD in IST, used in order numbers. */
export function istDateStamp(date = new Date()) {
  const { year, month, day } = istParts(date)
  return `${year}${String(month + 1).padStart(2, '0')}${String(day).padStart(2, '0')}`
}

/** Human-readable IST date + time for receipts, e.g. "07/11/2026 20:45 IST". */
export function istDateTime(date = new Date()) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS)
  const { day, month, year } = istParts(date)
  const hours = String(shifted.getUTCHours()).padStart(2, '0')
  const minutes = String(shifted.getUTCMinutes()).padStart(2, '0')
  return `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year} ${hours}:${minutes} IST`
}

function parseHhMm(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return (hours || 0) * 60 + (minutes || 0)
}

/**
 * Orders are taken 24/7, but serviced only during shop hours.
 * Returns null when the shop is open now, otherwise the next opening time (UTC Date).
 */
export function nextServiceAt(now: Date, open: string, close: string): Date | null {
  const { year, month, day, minutes } = istParts(now)
  const openMinutes = parseHhMm(open)
  const closeMinutes = parseHhMm(close)

  let dayOffset: number
  if (minutes >= closeMinutes) dayOffset = 1
  else if (minutes < openMinutes) dayOffset = 0
  else return null

  return new Date(
    Date.UTC(year, month, day + dayOffset, Math.floor(openMinutes / 60), openMinutes % 60) -
      IST_OFFSET_MS,
  )
}
