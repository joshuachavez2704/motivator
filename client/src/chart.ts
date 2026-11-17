// The maths behind the trend charts, kept apart from the drawing so it can be tested.

// A tidy top for the y axis: even, so the middle gridline is a whole number too.
export function niceMax(value: number): number {
  if (value <= 4) return 4
  const steps = [6, 8, 10, 12, 16, 20, 24, 30, 40, 50, 60, 80, 100]
  const step = steps.find((s) => value <= s)
  if (step) return step
  return Math.ceil(value / 100) * 100
}

// Which point is closest to where the pointer is? `fraction` is how far across the plot
// the pointer is (0 = left edge, 1 = right edge).
export function nearestIndex(fraction: number, count: number): number {
  if (count <= 1) return 0
  const index = Math.round(fraction * (count - 1))
  return Math.min(count - 1, Math.max(0, index))
}

// "2026-11-10" -> "Nov 10". Built from the numbers so the player's time zone can't shift it.
export function shortDate(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function longDate(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

// Which x labels to show: today, then every seventh day back, so labels never crowd.
export function labelIndexes(count: number): number[] {
  const out: number[] = []
  for (let i = count - 1; i >= 0; i -= 7) out.unshift(i)
  return out
}

// "1 day" / "12 days"
export function dayCount(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`
}
