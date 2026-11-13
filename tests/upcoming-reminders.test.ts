import { expect, test } from 'vitest'
import { isReminderDue, nextReminderChange } from '../src/upcoming-reminders'

const start = Date.parse('2026-11-13T06:31:00Z')
const booking = { startsAt: new Date(start).toISOString() }

test('reminder starts exactly 30 minutes before the call and ends at its start', () => {
  expect(isReminderDue(booking, start - 30 * 60_000 - 1)).toBe(false)
  expect(isReminderDue(booking, start - 30 * 60_000)).toBe(true)
  expect(isReminderDue(booking, start - 1)).toBe(true)
  expect(isReminderDue(booking, start)).toBe(false)
})

test('schedules only the next reminder transition, even with several calls', () => {
  const later = { startsAt: new Date(start + 60 * 60_000).toISOString() }
  expect(nextReminderChange([later, booking], start - 31 * 60_000)).toBe(start - 30 * 60_000)
  expect(nextReminderChange([later, booking], start - 30 * 60_000)).toBe(start)
  expect(nextReminderChange([later, booking], start)).toBe(start + 30 * 60_000)
  expect(nextReminderChange([booking], start)).toBeUndefined()
  expect(nextReminderChange([], start)).toBeUndefined()
})
