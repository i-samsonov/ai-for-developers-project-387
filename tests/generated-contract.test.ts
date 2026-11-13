import { describe, expect, it } from 'vitest'
import Fastify from 'fastify'
import { registerCalendarRoutes } from '../server/generated/routes.js'

describe('generated Fastify routes', () => {
  it('registers contract paths and validates request bodies before handlers run', async () => {
    const app = Fastify({ logger: false })
    let created = false
    let updated = false
    let deleted = false
    registerCalendarRoutes(app, {
      CalendarApi_getBookingSettings: async () => ({ timezone: 'Europe/Moscow', opensAt: '09:00', closesAt: '18:00', slotStepMinutes: 30, bookingWindowDays: 14 }),
      CalendarApi_listEventTypes: async () => [],
      CalendarApi_createEventType: async () => { created = true; return { id: 'test', name: 'Test', description: 'Test', durationMinutes: 45 } },
      CalendarApi_updateEventType: async () => { updated = true; return { id: 'test', name: 'Updated', description: 'Test', durationMinutes: 30 } },
      CalendarApi_deleteEventType: async () => { deleted = true; return { deleted: true } },
      CalendarApi_listSlots: async () => ({ date: '2026-10-22', slots: [] }),
      CalendarApi_createBooking: async () => ({ confirmed: true }),
      CalendarApi_listUpcomingBookings: async () => [],
      CalendarApi_deleteBooking: async () => ({ deleted: true }),
    })

    try {
      const settings = await app.inject('/api/booking-settings')
      expect(settings.statusCode).toBe(200)
      expect(settings.json().timezone).toBe('Europe/Moscow')

      const invalid = await app.inject({ method: 'POST', url: '/api/event-types', payload: { id: 'UPPER', name: 'Test', description: 'Test', durationMinutes: 45 } })
      expect(invalid.statusCode).toBe(400)
      expect(created).toBe(false)

      const valid = await app.inject({ method: 'POST', url: '/api/event-types', payload: { id: 'test', name: 'Test', description: 'Test', durationMinutes: 45 } })
      expect(valid.statusCode).toBe(200)
      expect(created).toBe(true)

      const invalidUpdate = await app.inject({ method: 'PATCH', url: '/api/event-types/test', payload: { name: 'Updated', description: 'Test', durationMinutes: 0 } })
      expect(invalidUpdate.statusCode).toBe(400)
      expect(updated).toBe(false)
      const validUpdate = await app.inject({ method: 'PATCH', url: '/api/event-types/test', payload: { name: 'Updated', description: 'Test', durationMinutes: 30 } })
      expect(validUpdate.statusCode).toBe(200)
      expect(updated).toBe(true)
      expect((await app.inject({ method: 'DELETE', url: '/api/event-types/test' })).statusCode).toBe(200)
      expect(deleted).toBe(true)
    } finally {
      await app.close()
    }
  })
})
