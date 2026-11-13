import { expect, test } from 'vitest'
import { calendarDays, dayAt, monthAt } from '../src/booking-calendar'

test('календарь начинает неделю с понедельника и показывает соседние дни', () => {
  const days = calendarDays('2026-03')
  expect(days).toHaveLength(42)
  expect(days[0]).toBe('2026-02-23')
  expect(days[6]).toBe('2026-03-01')
  expect(days.at(-1)).toBe('2026-04-05')
})

test('переходы через границы месяцев и года сохраняют календарные даты', () => {
  expect(dayAt('2026-12-31', 1)).toBe('2027-01-01')
  expect(monthAt('2026-12', 1)).toBe('2027-01')
  expect(monthAt('2026-01', -1)).toBe('2025-12')
})
