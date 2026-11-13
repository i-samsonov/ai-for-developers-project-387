import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { openStore, type Store } from './storage.js'
import { registerCalendarRoutes } from './generated/routes.js'
import type { EventType, UpcomingBooking } from './generated/types.js'

const settings = { timezone: 'Europe/Moscow', opensAt: '09:00', closesAt: '18:00', slotStepMinutes: 30, bookingWindowDays: 14 } as const
const moscowOffset = 3 * 60 * 60 * 1000
const dayMs = 24 * 60 * 60 * 1000
const localDate = (date: Date) => new Date(date.getTime() + moscowOffset).toISOString().slice(0, 10)
const dayStart = (date: string) => Date.parse(`${date}T00:00:00.000Z`) - moscowOffset
const slotStart = (date: string, index: number) => dayStart(date) + (9 * 60 + index * 30) * 60_000
const failure = (code: string, message: string) => ({ code, message })

type EventRow = EventType
type BookingRow = { id: number; eventTypeId: string; startsAt: number; endsAt: number; guestName: string; guestEmail: string }

export function createApp(options: { databasePath?: string; now?: () => Date; logger?: boolean; staticRoot?: string } = {}) {
  const app = Fastify({ logger: options.logger ?? true })
  let db: Store
  app.addHook('onReady', async () => { db = await openStore(options.databasePath ?? process.env.DATABASE_PATH ?? 'calendar.sqlite') })
  const now = () => (options.now ?? (() => new Date()))().getTime()
  const findType = (id: string) => db.get('SELECT * FROM event_types WHERE id = ?', id) as EventRow | undefined
  const overlap = (end: number, start: number) => db.get('SELECT 1 FROM bookings WHERE startsAt < ? AND endsAt > ? LIMIT 1', end, start)
  const withinWindow = (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(dayStart(date)) || localDate(new Date(dayStart(date))) !== date) return false
    const today = dayStart(localDate(new Date(now())))
    const selected = dayStart(date)
    return selected >= today && selected < today + 14 * dayMs
  }
  const startValid = (start: number) => {
    if (!Number.isFinite(start) || start <= now()) return false
    const date = localDate(new Date(start))
    if (!withinWindow(date)) return false
    const first = slotStart(date, 0)
    return start >= first && start <= slotStart(date, 17) && (start - first) % (30 * 60_000) === 0
  }

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof Error && ('validation' in error || ('statusCode' in error && error.statusCode === 400))) return reply.code(400).send(failure('invalid_request', 'Неверные данные запроса'))
    app.log.error(error)
    return reply.code(500).send(failure('internal_error', 'Ошибка сервера'))
  })
  app.get('/health', async () => ({ status: 'ok' }))

  registerCalendarRoutes(app, {
    CalendarApi_getBookingSettings: async () => settings,
    CalendarApi_listEventTypes: async () => db.all('SELECT * FROM event_types ORDER BY rowid') as EventRow[],
    CalendarApi_createEventType: async (request, reply) => {
      const { id, durationMinutes } = request.body
      const name = request.body.name.trim()
      const description = request.body.description.trim()
      if (!name || name.length > 100 || !description || description.length > 1000) return reply.code(400).send(failure('invalid_request', 'Название и описание обязательны'))
      try {
        db.run('INSERT INTO event_types (id, name, description, durationMinutes) VALUES (?, ?, ?, ?)', id, name, description, durationMinutes)
      } catch (error) {
        if (error instanceof Error && error.message.includes('UNIQUE')) return reply.code(409).send(failure('conflict', 'Этот id уже используется'))
        throw error
      }
      return { id, name, description, durationMinutes }
    },
    CalendarApi_updateEventType: async (request, reply) => {
      const { id } = request.params
      const { durationMinutes } = request.body
      const name = request.body.name.trim()
      const description = request.body.description.trim()
      if (!name || !description) return reply.code(400).send(failure('invalid_request', 'Название и описание обязательны'))
      if (!findType(id)) return reply.code(404).send(failure('not_found', 'Тип события не найден'))
      db.run('UPDATE event_types SET name = ?, description = ?, durationMinutes = ? WHERE id = ?', name, description, durationMinutes, id)
      return { id, name, description, durationMinutes }
    },
    CalendarApi_deleteEventType: async (request, reply) => {
      const { id } = request.params
      if (!findType(id)) return reply.code(404).send(failure('not_found', 'Тип события не найден'))
      if (db.get('SELECT 1 FROM bookings WHERE eventTypeId = ? LIMIT 1', id)) return reply.code(409).send(failure('conflict', 'Нельзя удалить тип события, по которому есть записи'))
      db.run('DELETE FROM event_types WHERE id = ?', id)
      return { deleted: true as const }
    },
    CalendarApi_listSlots: async (request, reply) => {
      const event = findType(request.params.id)
      if (!event) return reply.code(404).send(failure('not_found', 'Тип события не найден'))
      const { date } = request.query
      if (!withinWindow(date)) return reply.code(400).send(failure('invalid_request', 'Дата вне окна записи'))
      return { date, slots: Array.from({ length: 18 }, (_, index) => {
        const start = slotStart(date, index)
        const end = start + event.durationMinutes * 60_000
        const reason = start <= now() ? 'past' : end > dayStart(date) + 18 * 60 * 60_000 ? 'does_not_fit' : overlap(end, start) ? 'booked' : undefined
        return { startsAt: new Date(start).toISOString(), available: !reason, ...(reason ? { reason } : {}) }
      }) }
    },
    CalendarApi_createBooking: async (request, reply) => {
      const { eventTypeId, startsAt, guestEmail } = request.body
      const guestName = request.body.guestName.trim()
      if (!guestName || guestName.length > 100 || guestEmail.trim() !== guestEmail) return reply.code(400).send(failure('invalid_request', 'Проверьте имя и email'))
      const event = findType(eventTypeId)
      if (!event) return reply.code(404).send(failure('not_found', 'Тип события не найден'))
      const start = Date.parse(startsAt)
      if (!startValid(start) || start + event.durationMinutes * 60_000 > dayStart(localDate(new Date(start))) + 18 * 60 * 60_000) return reply.code(400).send(failure('invalid_request', 'Это время недоступно для записи'))
      const end = start + event.durationMinutes * 60_000
      // Synchronous transaction serializes the overlap check and insertion on this SQLite database.
      const insert = db.transaction(() => {
        if (overlap(end, start)) return false
        db.run('INSERT INTO bookings (eventTypeId, startsAt, endsAt, guestName, guestEmail) VALUES (?, ?, ?, ?, ?)', eventTypeId, start, end, guestName, guestEmail)
        return true
      })
      if (!insert) return reply.code(409).send(failure('conflict', 'Время уже занято, выберите другой слот'))
      return { confirmed: true as const }
    },
    CalendarApi_listUpcomingBookings: async () => {
      const rows = db.all(`SELECT b.*, e.id AS typeId, e.name, e.description FROM bookings b JOIN event_types e ON e.id = b.eventTypeId WHERE b.startsAt > ? ORDER BY b.startsAt, b.id`, now()) as (BookingRow & { typeId: string; name: string; description: string })[]
      return rows.map(({ id, typeId, name, description, startsAt, endsAt, guestName, guestEmail }): UpcomingBooking => ({ id, eventType: { id: typeId, name, description, durationMinutes: (endsAt - startsAt) / 60_000 }, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), guestName, guestEmail }))
    },
    CalendarApi_deleteBooking: async (request, reply) => {
      const { id } = request.params
      if (!db.get('SELECT 1 FROM bookings WHERE id = ? AND startsAt > ?', id, now())) return reply.code(404).send(failure('not_found', 'Предстоящая запись не найдена'))
      db.run('DELETE FROM bookings WHERE id = ?', id)
      return { deleted: true as const }
    },
  })
  if (options.staticRoot) void app.register(fastifyStatic, { root: options.staticRoot })
  app.addHook('onClose', async () => { db?.close() })
  return app
}
