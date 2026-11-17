import { describe, expect, it } from 'vitest'
import { dayCount, labelIndexes, nearestIndex, niceMax, shortDate } from './chart'

describe('niceMax', () => {
  it('never goes below 4, so a quiet chart still has a scale', () => {
    expect(niceMax(0)).toBe(4)
    expect(niceMax(3)).toBe(4)
  })
  it('rounds up to an even number', () => {
    expect(niceMax(5)).toBe(6)
    expect(niceMax(9)).toBe(10)
    expect(niceMax(21)).toBe(24)
    expect(niceMax(100)).toBe(100)
  })
  it('handles values past 100', () => {
    expect(niceMax(101)).toBe(200)
    expect(niceMax(430)).toBe(500)
  })
  it('is always even, so the middle gridline is a whole number', () => {
    for (let v = 0; v <= 600; v++) expect(niceMax(v) % 2).toBe(0)
  })
  it('always fits the value', () => {
    for (let v = 0; v <= 600; v++) expect(niceMax(v)).toBeGreaterThanOrEqual(v)
  })
})

describe('nearestIndex', () => {
  it('snaps to the closest point', () => {
    expect(nearestIndex(0, 30)).toBe(0)
    expect(nearestIndex(1, 30)).toBe(29)
    expect(nearestIndex(0.5, 31)).toBe(15)
  })
  it('stays in range when the pointer is outside the plot', () => {
    expect(nearestIndex(-0.4, 30)).toBe(0)
    expect(nearestIndex(1.7, 30)).toBe(29)
  })
  it('copes with a single point', () => {
    expect(nearestIndex(0.9, 1)).toBe(0)
  })
})

describe('labelIndexes', () => {
  it('ends on today and steps back a week at a time', () => {
    expect(labelIndexes(30)).toEqual([1, 8, 15, 22, 29])
    expect(labelIndexes(7)).toEqual([6])
    expect(labelIndexes(8)).toEqual([0, 7])
  })
})

describe('shortDate and dayCount', () => {
  it('does not move the date with the time zone', () => {
    expect(shortDate('2026-11-01')).toMatch(/1/)
    expect(shortDate('2026-11-01')).not.toMatch(/Oct|31/)
  })
  it('says day or days', () => {
    expect(dayCount(1)).toBe('1 day')
    expect(dayCount(0)).toBe('0 days')
    expect(dayCount(12)).toBe('12 days')
  })
})
