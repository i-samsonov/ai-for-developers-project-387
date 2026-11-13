import { expect, test } from 'vitest'
import { groupUpcomingByDay } from '../src/upcoming-bookings'

test('groups upcoming calls by Moscow start date, even across UTC midnight', () => {
  const bookings = [
    { id: 3, startsAt: '2026-11-14T08:00:00Z' },
    { id: 2, startsAt: '2026-11-13T21:30:00Z' },
    { id: 1, startsAt: '2026-11-13T20:30:00Z' },
  ]
  expect(groupUpcomingByDay(bookings)).toEqual([
    { day: '2026-11-13', items: [bookings[2]] },
    { day: '2026-11-14', items: [bookings[1], bookings[0]] },
  ])
  expect(bookings.map((item) => item.id)).toEqual([3, 2, 1])
  expect(groupUpcomingByDay([])).toEqual([])
})
