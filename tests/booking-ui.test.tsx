// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from '../src/App'
import { createApp } from '../server/app.js'
import { client } from '../src/generated/sdk/client.gen.js'
import { dayAt } from '../src/booking-calendar.js'

const directories: string[] = []
const pendingRequests = new Set<Promise<Response>>()
afterEach(() => {
  cleanup()
  window.location.hash = ''
  directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }))
})

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const dateLabel = (day: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${day}T12:00:00Z`))

async function server(now?: () => Date) {
  const dir = mkdtempSync(join(tmpdir(), 'calendar-ui-test-'))
  directories.push(dir)
  const app = createApp({ databasePath: join(dir, 'calendar.sqlite'), now, logger: false })
  await app.listen({ host: '127.0.0.1', port: 0 })
  client.setConfig({ baseUrl: app.listeningOrigin, fetch: (input, init) => {
    const request = fetch(input, init)
    pendingRequests.add(request)
    void request.then(() => pendingRequests.delete(request), () => pendingRequests.delete(request))
    return request
  } })
  return app
}

async function closeServer(app: Awaited<ReturnType<typeof server>>) {
  await act(async () => {
    while (pendingRequests.size) await Promise.allSettled([...pendingRequests])
  })
  await app.close()
}

it('shows booking hours, start interval and timezone received through the SDK', async () => {
  const app = await server()
  try {
    window.location.hash = '#/booking'
    render(<App />)
    expect(await screen.findByText(/09:00–18:00/)).toBeTruthy()
    expect(screen.getByText(/шаг начала 30 минут/)).toBeTruthy()
    expect(screen.getByText(/Europe\/Moscow/)).toBeTruthy()
  } finally { await closeServer(app) }
})

it('shows past, booked and too-late starts while allowing an available date', async () => {
  const day = today()
  const tomorrow = dayAt(day, 1)
  const app = await server(() => new Date(`${day}T09:00:00Z`))
  try {
    await app.inject({ method: 'POST', url: '/api/event-types', payload: { id: 'intro', name: 'Знакомство', description: 'Поговорим', durationMinutes: 45 } })
    await app.inject({ method: 'POST', url: '/api/bookings', payload: { eventTypeId: 'intro', startsAt: `${tomorrow}T07:00:00Z`, guestName: 'Гость', guestEmail: 'guest@example.com' } })
    window.location.hash = '#/booking'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Знакомство.*Поговорим.*45 мин/ }))
    fireEvent.click(screen.getByRole('button', { name: dateLabel(day) }))
    expect(await screen.findByRole('button', { name: /09:00 - 09:45.*Время прошло/ })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: dateLabel(tomorrow) }))
    expect(await screen.findByRole('button', { name: /10:00 - 10:45.*Занято/ })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: /17:30 - 18:15.*Не помещается до закрытия/ })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: /09:00 - 09:45.*Свободно/ })).toHaveProperty('disabled', false)
  } finally { await closeServer(app) }
})

it('confirms a guest booking with its details and lets the guest start again', async () => {
  const day = today()
  const app = await server(() => new Date(`${day}T09:00:00Z`))
  try {
    await app.inject({ method: 'POST', url: '/api/event-types', payload: { id: 'intro', name: 'Знакомство', description: 'Поговорим', durationMinutes: 30 } })
    window.location.hash = '#/booking'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Знакомство.*Поговорим.*30 мин/ }))
    fireEvent.click(screen.getByRole('button', { name: dateLabel(dayAt(day, 1)) }))
    fireEvent.click(await screen.findByRole('button', { name: /09:00 - 09:30.*Свободно/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }))
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Гость' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'guest@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }))
    const main = screen.getByRole('main')
    expect(await within(main).findByRole('heading', { name: 'Бронь подтверждена. До встречи!' })).toBeTruthy()
    expect(within(main).getByRole('heading', { name: 'Запись на звонок' })).toBeTruthy()
    const information = within(main).getByRole('heading', { name: 'Информация' }).parentElement!
    expect(within(information).getByText(dateLabel(dayAt(day, 1)))).toBeTruthy()
    expect(within(information).getByText('09:00 - 09:30')).toBeTruthy()
    expect(within(information).getByText('17')).toBeTruthy()
    expect(within(information).getByText('30 мин')).toBeTruthy()
    expect(within(main).getByRole('button', { name: 'Забронировать еще' })).toBeTruthy()
    fireEvent.click(within(main).getByRole('button', { name: 'Забронировать еще' }))
    expect(await within(main).findByRole('heading', { name: 'Выберите тип встречи' })).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Предстоящие события' }))
    expect(await screen.findByText(/Гость · guest@example.com/)).toBeTruthy()
  } finally { await closeServer(app) }
})

it('reports a newly occupied slot and lets the guest choose another', async () => {
  const day = today()
  const tomorrow = dayAt(day, 1)
  const app = await server(() => new Date(`${day}T09:00:00Z`))
  try {
    await app.inject({ method: 'POST', url: '/api/event-types', payload: { id: 'intro', name: 'Знакомство', description: 'Поговорим', durationMinutes: 30 } })
    window.location.hash = '#/booking'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Знакомство.*Поговорим.*30 мин/ }))
    fireEvent.click(screen.getByRole('button', { name: dateLabel(tomorrow) }))
    fireEvent.click(await screen.findByRole('button', { name: /09:00 - 09:30.*Свободно/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }))
    await app.inject({ method: 'POST', url: '/api/bookings', payload: { eventTypeId: 'intro', startsAt: `${tomorrow}T06:00:00Z`, guestName: 'Другой', guestEmail: 'other@example.com' } })
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Гость' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'guest@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Время уже занято. Выберите другой слот.')
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(await screen.findByRole('button', { name: /09:00 - 09:30.*Занято/ })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: /09:30 - 10:00.*Свободно/ })).toHaveProperty('disabled', false)
  } finally { await closeServer(app) }
})

it('lets the owner create a type and makes it available to guests through the SDK', async () => {
  const app = await server()
  try {
    window.location.hash = '#/upcoming'
    render(<App />)
    await screen.findByText('Типов пока нет.')
    const form = screen.getByRole('heading', { name: 'Создать тип встречи' }).nextElementSibling as HTMLFormElement
    fireEvent.change(within(form).getByLabelText(/id \(/), { target: { value: 'intro' } })
    fireEvent.change(within(form).getByLabelText('Название'), { target: { value: 'Знакомство' } })
    fireEvent.change(within(form).getByLabelText('Описание'), { target: { value: 'Поговорим' } })
    fireEvent.change(within(form).getByLabelText('Длительность (мин.)'), { target: { value: '45' } })
    fireEvent.submit(form)
    expect(await screen.findByText(/Знакомство \(intro\) · 45 мин/)).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Записаться' }))
    expect(await screen.findByRole('button', { name: /Знакомство.*Поговорим.*45 мин/ })).toBeTruthy()
  } finally { await closeServer(app) }
})

it('shows an empty upcoming list, then the owner sees contacts from all types in time order', async () => {
  const day = today()
  const tomorrow = dayAt(day, 1)
  const app = await server(() => new Date(`${day}T09:00:00Z`))
  try {
    window.location.hash = '#/upcoming'
    const { unmount } = render(<App />)
    expect(await screen.findByText('Предстоящих встреч пока нет.')).toBeTruthy()
    expect(screen.getByText(/доступны без авторизации/)).toBeTruthy()
    unmount()
    for (const [id, name] of [['intro', 'Знакомство'], ['review', 'Обсуждение']] as const) {
      await app.inject({ method: 'POST', url: '/api/event-types', payload: { id, name, description: name, durationMinutes: 30 } })
    }
    await app.inject({ method: 'POST', url: '/api/bookings', payload: { eventTypeId: 'review', startsAt: `${tomorrow}T08:00:00Z`, guestName: 'Поздний', guestEmail: 'later@example.com' } })
    await app.inject({ method: 'POST', url: '/api/bookings', payload: { eventTypeId: 'intro', startsAt: `${tomorrow}T07:00:00Z`, guestName: 'Ранний', guestEmail: 'early@example.com' } })
    render(<App />)
    const first = await screen.findByText(/Ранний · early@example.com/)
    const second = screen.getByText(/Поздний · later@example.com/)
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(first.parentElement?.textContent).toMatch(/Знакомство \(intro\).*10:00.*30 мин/)
    expect(second.parentElement?.textContent).toMatch(/Обсуждение \(review\).*11:00.*30 мин/)
  } finally { await closeServer(app) }
})
