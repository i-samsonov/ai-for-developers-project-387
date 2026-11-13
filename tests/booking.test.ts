import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../server/app.js'
import { createClient } from '../src/generated/sdk/client/index.js'
import { calendarApiDeleteBooking, calendarApiDeleteEventType, calendarApiGetBookingSettings, calendarApiListSlots, calendarApiUpdateEventType } from '../src/generated/sdk/sdk.gen.js'

const directories: string[] = []
afterEach(() => directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })))

async function server() {
  const dir = mkdtempSync(join(tmpdir(), 'calendar-test-'))
  directories.push(dir)
  let now = new Date('2026-10-22T06:00:00.000Z')
  const app = createApp({ databasePath: join(dir, 'calendar.sqlite'), now: () => now, logger: false })
  await app.ready()
  return { app, setNow: (value: string) => { now = new Date(value) }, databasePath: join(dir, 'calendar.sqlite') }
}

describe('booking HTTP contract', () => {
  it('generated SDK reaches a real listening API', async () => {
    const { app } = await server()
    try {
      await app.listen({ host: '127.0.0.1', port: 0 })
      const client = createClient({ baseUrl: app.listeningOrigin })
      const settings = await calendarApiGetBookingSettings({ client })
      expect(settings.data?.timezone).toBe('Europe/Moscow')
      const missing = await calendarApiListSlots({ client, path: { id: 'unknown' }, query: { date: '2026-10-22' } })
      expect(missing.response.status).toBe(404)
      expect(missing.error).toEqual({ code: 'not_found', message: 'Тип события не найден' })
    } finally { await app.close() }
  })
  it('serves settings, persists event types, rejects invalid and duplicate ids', async () => {
    const { app, databasePath } = await server()
    try {
      expect((await app.inject('/api/booking-settings')).json()).toEqual({ timezone: 'Europe/Moscow', opensAt: '09:00', closesAt: '18:00', slotStepMinutes: 30, bookingWindowDays: 14 })
      const input = { id: 'intro', name: '  Знакомство  ', description: '  Поговорим  ', durationMinutes: 45 }
      expect((await app.inject({ method: 'POST', url: '/api/event-types', payload: input })).json().name).toBe('Знакомство')
      expect((await app.inject({ method: 'POST', url: '/api/event-types', payload: input })).statusCode).toBe(409)
      expect((await app.inject({ method: 'POST', url: '/api/event-types', payload: { ...input, id: 'UPPER' } })).statusCode).toBe(400)
      expect((await app.inject('/api/event-types')).json()).toHaveLength(1)
    } finally { await app.close() }
    const reopened = createApp({ databasePath, logger: false })
    try { expect((await reopened.inject('/api/event-types')).json()).toHaveLength(1) } finally { await reopened.close() }
  })

  it('rejects malformed types and guest details without changing the saved lists', async () => {
    const { app } = await server()
    try {
      const input = { id: 'intro', name: 'Знакомство', description: 'Поговорим', durationMinutes: 45 }
      for (const invalid of [
        { ...input, id: 'UPPER' }, { ...input, id: '' }, { ...input, name: '   ' },
        { ...input, description: '   ' }, { ...input, durationMinutes: 0 },
        { ...input, durationMinutes: 541 }, { ...input, durationMinutes: 1.5 },
      ]) {
        expect((await app.inject({ method: 'POST', url: '/api/event-types', payload: invalid })).statusCode).toBe(400)
      }
      expect((await app.inject('/api/event-types')).json()).toEqual([])
      expect((await app.inject({ method: 'POST', url: '/api/event-types', payload: input })).statusCode).toBe(200)
      expect((await app.inject({ method: 'POST', url: '/api/event-types', payload: input })).statusCode).toBe(409)
      const booking = { eventTypeId: 'intro', startsAt: '2026-10-23T07:00:00Z', guestName: 'Гость', guestEmail: 'guest@example.com' }
      for (const invalid of [
        { ...booking, guestName: '   ' }, { ...booking, guestEmail: 'invalid' },
        { ...booking, guestEmail: 'a'.repeat(250) + '@example.com' },
      ]) {
        expect((await app.inject({ method: 'POST', url: '/api/bookings', payload: invalid })).statusCode).toBe(400)
      }
      expect((await app.inject('/api/admin/bookings')).json()).toEqual([])
    } finally { await app.close() }
  })

  it('edits an event type without changing its id or existing booking intervals', async () => {
    const { app, databasePath } = await server()
    try {
      await app.inject({ method: 'POST', url: '/api/event-types', payload: { id: 'intro', name: 'Знакомство', description: 'Старое описание', durationMinutes: 60 } })
      const startsAt = '2026-10-23T07:00:00.000Z'
      expect((await app.inject({ method: 'POST', url: '/api/bookings', payload: { eventTypeId: 'intro', startsAt, guestName: 'Гость', guestEmail: 'guest@example.com' } })).statusCode).toBe(200)
      await app.listen({ host: '127.0.0.1', port: 0 })
      const client = createClient({ baseUrl: app.listeningOrigin })
      const updated = { name: 'Новый звонок', description: ' Новое описание ', durationMinutes: 30 }
      const result = await calendarApiUpdateEventType({ client, path: { id: 'intro' }, body: updated })
      expect(result.data).toEqual({ id: 'intro', name: updated.name, description: 'Новое описание', durationMinutes: 30 })
      expect((await app.inject('/api/event-types')).json()).toEqual([result.data])
      const upcoming = (await app.inject('/api/admin/bookings')).json()
      expect(upcoming[0].endsAt).toBe('2026-10-23T08:00:00.000Z')
      expect(upcoming[0].eventType).toMatchObject({ id: 'intro', name: updated.name, durationMinutes: 60 })
      expect((await calendarApiUpdateEventType({ client, path: { id: 'missing' }, body: updated })).response.status).toBe(404)
      expect((await calendarApiUpdateEventType({ client, path: { id: 'intro' }, body: { ...updated, name: '  ' } })).response.status).toBe(400)
      expect((await calendarApiUpdateEventType({ client, path: { id: 'intro' }, body: { ...updated, durationMinutes: 0 } })).response.status).toBe(400)
      expect((await app.inject('/api/event-types/intro/slots?date=2026-10-23')).json().slots.find((slot: { startsAt: string }) => slot.startsAt === startsAt)).toMatchObject({ available: false, reason: 'booked' })
    } finally { await app.close() }
    const reopened = createApp({ databasePath, logger: false })
    try { expect((await reopened.inject('/api/event-types')).json()[0]).toMatchObject({ id: 'intro', name: 'Новый звонок', durationMinutes: 30 }) } finally { await reopened.close() }
  })

  it('deletes unused event types but preserves types referenced by bookings', async () => {
    const { app, databasePath } = await server()
    try {
      const create = (id: string) => app.inject({ method: 'POST', url: '/api/event-types', payload: { id, name: id, description: id, durationMinutes: 30 } })
      await create('unused')
      await create('booked')
      await app.inject({ method: 'POST', url: '/api/bookings', payload: { eventTypeId: 'booked', startsAt: '2026-10-23T07:00:00.000Z', guestName: 'Гость', guestEmail: 'guest@example.com' } })
      await app.listen({ host: '127.0.0.1', port: 0 })
      const client = createClient({ baseUrl: app.listeningOrigin })
      expect((await calendarApiDeleteEventType({ client, path: { id: 'missing' } })).response.status).toBe(404)
      const conflict = await calendarApiDeleteEventType({ client, path: { id: 'booked' } })
      expect(conflict.response.status).toBe(409)
      expect(conflict.error?.code).toBe('conflict')
      expect((await calendarApiDeleteEventType({ client, path: { id: 'unused' } })).data).toEqual({ deleted: true })
      expect((await app.inject('/api/event-types')).json().map((type: { id: string }) => type.id)).toEqual(['booked'])
      expect((await app.inject('/api/event-types/unused/slots?date=2026-10-23')).statusCode).toBe(404)
      expect((await app.inject('/api/admin/bookings')).json()).toHaveLength(1)
    } finally { await app.close() }
    const reopened = createApp({ databasePath, logger: false })
    try { expect((await reopened.inject('/api/event-types')).json().map((type: { id: string }) => type.id)).toEqual(['booked']) } finally { await reopened.close() }
  })

  it('deletes an upcoming booking by id, frees its slot and persists the deletion', async () => {
    const { app, databasePath, setNow } = await server()
    const startsAt = '2026-10-23T07:00:00.000Z'
    try {
      await app.inject({ method: 'POST', url: '/api/event-types', payload: { id: 'intro', name: 'Звонок', description: 'Звонок', durationMinutes: 30 } })
      await app.inject({ method: 'POST', url: '/api/bookings', payload: { eventTypeId: 'intro', startsAt, guestName: 'Гость', guestEmail: 'guest@example.com' } })
      await app.inject({ method: 'POST', url: '/api/bookings', payload: { eventTypeId: 'intro', startsAt: '2026-10-23T08:00:00.000Z', guestName: 'Другой', guestEmail: 'other@example.com' } })
      const upcoming = (await app.inject('/api/admin/bookings')).json()
      expect(upcoming).toHaveLength(2)
      expect(upcoming[0]).toMatchObject({ id: expect.any(Number), startsAt })
      await app.listen({ host: '127.0.0.1', port: 0 })
      const client = createClient({ baseUrl: app.listeningOrigin })
      expect((await calendarApiDeleteBooking({ client, path: { id: upcoming[0].id } })).data).toEqual({ deleted: true })
      expect((await app.inject('/api/admin/bookings')).json().map((booking: { id: number }) => booking.id)).toEqual([upcoming[1].id])
      expect((await app.inject('/api/event-types/intro/slots?date=2026-10-23')).json().slots.find((slot: { startsAt: string }) => slot.startsAt === startsAt)).toMatchObject({ available: true })
      expect((await calendarApiDeleteBooking({ client, path: { id: upcoming[0].id } })).response.status).toBe(404)
      expect((await app.inject({ method: 'DELETE', url: '/api/admin/bookings/not-an-id' })).statusCode).toBe(400)
      setNow('2026-10-23T08:00:00.000Z')
      expect((await calendarApiDeleteBooking({ client, path: { id: upcoming[1].id } })).response.status).toBe(404)
    } finally { await app.close() }
    const reopened = createApp({ databasePath, now: () => new Date('2026-10-22T06:00:00Z'), logger: false })
    try { expect((await reopened.inject('/api/admin/bookings')).json()).toHaveLength(1) } finally { await reopened.close() }
  })

  it('checks full intervals across types, races, boundaries and upcoming meetings', async () => {
    const { app, setNow } = await server()
    const post = (url: string, payload: object) => app.inject({ method: 'POST', url, payload })
    try {
      for (const [id, durationMinutes] of [['long', 60], ['short', 30], ['odd', 45]] as const) {
        expect((await post('/api/event-types', { id, name: id, description: id, durationMinutes })).statusCode).toBe(200)
      }
      const url = '/api/event-types/long/slots?date=2026-10-22'
      const slots = (await app.inject(url)).json().slots
      expect(slots).toHaveLength(18)
      expect(slots[0]).toMatchObject({ startsAt: '2026-10-22T06:00:00.000Z', available: false, reason: 'past' })
      expect(slots.at(-1)).toMatchObject({ available: false, reason: 'does_not_fit' })
      expect((await app.inject('/api/event-types/long/slots?date=2026-11-05')).statusCode).toBe(400)
      expect((await app.inject('/api/event-types/nope/slots?date=2026-10-22')).statusCode).toBe(404)
      const booking = (eventTypeId: string, startsAt: string, guestName = 'Alice') => post('/api/bookings', { eventTypeId, startsAt, guestName, guestEmail: 'alice@example.com' })
      const start = '2026-10-22T06:30:00.000Z'
      const [first, second] = await Promise.all([booking('long', start), booking('short', start)])
      expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409])
      expect((await booking('short', '2026-10-22T07:00:00.000Z')).statusCode).toBe(409)
      expect((await booking('odd', '2026-10-22T07:30:00.000Z')).statusCode).toBe(200)
      expect((await booking('short', '2026-10-22T08:30:00.000Z')).statusCode).toBe(200)
      expect((await booking('short', '2026-10-22T06:00:00.000Z')).statusCode).toBe(400)
      expect((await booking('short', '2026-10-22T06:15:00.000Z')).statusCode).toBe(400)
      expect((await booking('short', '2026-10-22T06:30:00.000Z', '  ')).statusCode).toBe(400)
      const occupied = (await app.inject(url)).json()
      expect(occupied.slots[1]).toMatchObject({ available: false, reason: 'booked' })
      expect(JSON.stringify(occupied)).not.toContain('alice@example.com')
      const upcoming = (await app.inject('/api/admin/bookings')).json()
      expect(upcoming).toHaveLength(3)
      expect(upcoming[0].guestEmail).toBe('alice@example.com')
      expect(upcoming.map((entry: { startsAt: string }) => entry.startsAt)).toEqual([...upcoming.map((entry: { startsAt: string }) => entry.startsAt)].sort())
      setNow(start)
      expect((await app.inject('/api/admin/bookings')).json()).toHaveLength(2)
    } finally { await app.close() }
  })

  it('moves the window at Moscow midnight, permits adjacent bookings and preserves them on restart', async () => {
    const { app, setNow, databasePath } = await server()
    try {
      const makeType = (id: string, durationMinutes: number) => app.inject({ method: 'POST', url: '/api/event-types', payload: { id, name: id, description: id, durationMinutes } })
      await makeType('forty-five', 45)
      await makeType('half-hour', 30)
      const book = (eventTypeId: string, startsAt: string, guestEmail = 'valid@example.com') => app.inject({ method: 'POST', url: '/api/bookings', payload: { eventTypeId, startsAt, guestName: '  Guest  ', guestEmail } })
      expect((await book('forty-five', '2026-10-22T12:00:00Z')).statusCode).toBe(200)
      expect((await book('half-hour', '2026-10-22T12:30:00Z')).statusCode).toBe(409)
      expect((await book('half-hour', '2026-10-22T13:00:00Z')).statusCode).toBe(200)
      expect((await book('half-hour', '2026-10-22T12:00:00Z', 'bad-email')).statusCode).toBe(400)
      expect((await book('half-hour', '2026-11-04T14:30:00Z')).statusCode).toBe(200)
      expect((await book('half-hour', '2026-11-05T14:30:00Z')).statusCode).toBe(400)
      setNow('2026-10-22T21:00:00Z') // 00:00 next day in Moscow
      expect((await app.inject('/api/event-types/half-hour/slots?date=2026-10-22')).statusCode).toBe(400)
      expect((await app.inject('/api/event-types/half-hour/slots?date=2026-11-05')).statusCode).toBe(200)
      expect((await app.inject('/api/admin/bookings')).json()).toHaveLength(1)
    } finally { await app.close() }
    const reopened = createApp({ databasePath, now: () => new Date('2026-10-22T06:00:00Z'), logger: false })
    try {
      expect((await reopened.inject('/api/admin/bookings')).json()).toHaveLength(3)
      expect((await reopened.inject('/api/admin/bookings')).json()[0].guestName).toBe('Guest')
    } finally { await reopened.close() }
  })
})
