import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, CalendarClock } from 'lucide-react'
import { calendarApiCreateBooking, calendarApiCreateEventType, calendarApiDeleteBooking, calendarApiDeleteEventType, calendarApiGetBookingSettings, calendarApiListEventTypes, calendarApiListSlots, calendarApiListUpcomingBookings, calendarApiUpdateEventType } from './generated/sdk/sdk.gen'
import type { BookingSettings, EventType, Slot, UpcomingBooking } from './generated/sdk/types.gen'
import { calendarDays, dayAt, monthAt } from './booking-calendar'

const time = (value: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
const dateTime = (value: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const reasonText: Record<string, string> = { past: 'Время прошло', booked: 'Занято', does_not_fit: 'Не помещается до закрытия' }
const dateLabel = (value: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`))
const endTime = (startsAt: string, durationMinutes: number) => time(new Date(new Date(startsAt).getTime() + durationMinutes * 60_000).toISOString())
const monthLabel = (value: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${value}-01T12:00:00Z`))
type Page = 'home' | 'booking' | 'upcoming'
const currentPage = (): Page => {
  if (typeof window === 'undefined') return 'home'
  if (window.location.hash === '#/booking') return 'booking'
  if (window.location.hash === '#/upcoming') return 'upcoming'
  return 'home'
}

function App() {
  const [page, setPage] = useState<Page>(currentPage)
  const [settings, setSettings] = useState<BookingSettings>()
  const [types, setTypes] = useState<EventType[]>([])
  const [selected, setSelected] = useState<EventType>()
  const [date, setDate] = useState<string>()
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const [details, setDetails] = useState(false)
  const [slots, setSlots] = useState<Slot[]>([])
  const [slot, setSlot] = useState<Slot>()
  const [confirmed, setConfirmed] = useState(false)
  const [upcoming, setUpcoming] = useState<UpcomingBooking[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string>()
  const [deletingBookingId, setDeletingBookingId] = useState<number>()
  const [slotsLoading, setSlotsLoading] = useState(false)
  const windowStart = today()
  const windowEnd = dayAt(windowStart, (settings?.bookingWindowDays ?? 14) - 1)

  const loadTypes = async () => {
    const result = await calendarApiListEventTypes()
    if (result.data) setTypes(result.data)
    else setError('Не удалось загрузить типы событий. Проверьте, что API запущен.')
  }
  useEffect(() => {
    const updatePage = () => { setPage(currentPage()); setError('') }
    window.addEventListener('hashchange', updatePage)
    return () => window.removeEventListener('hashchange', updatePage)
  }, [])
  useEffect(() => {
    if (page === 'upcoming') {
      void calendarApiListUpcomingBookings().then((result) => {
        if (result.data) setUpcoming(result.data)
        else setError('Не удалось загрузить встречи.')
      })
    }
    if (page !== 'home') {
      void calendarApiListEventTypes().then((result) => {
        if (result.data) setTypes(result.data)
        else setError('Не удалось загрузить типы событий. Проверьте, что API запущен.')
      })
    }
    if (page === 'booking') {
      void calendarApiGetBookingSettings().then((result) => {
        if (result.data) setSettings(result.data)
        else setError('Не удалось загрузить настройки записи. Проверьте, что API запущен.')
      })
    }
  }, [page])
  useEffect(() => {
    if (!selected || !date) return
    let active = true
    void calendarApiListSlots({ path: { id: selected.id }, query: { date } }).then((result) => {
      if (!active) return
      setSlotsLoading(false)
      if (result.data) setSlots(result.data.slots)
      else setError('Не удалось загрузить слоты. Попробуйте снова.')
    })
    return () => { active = false }
  }, [selected, date])
  const selectDate = (value: string) => {
    setDate(value)
    setSlot(undefined)
    setSlots([])
    setSlotsLoading(true)
    setError('')
  }

  const book = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected || !slot || !date) return
    const form = new FormData(event.currentTarget)
    setLoading(true)
    setError('')
    try {
      const response = await calendarApiCreateBooking({ body: { eventTypeId: selected.id, startsAt: slot.startsAt, guestName: String(form.get('name')).trim(), guestEmail: String(form.get('email')).trim() } })
      if (response.data) {
        setSlots((previous) => previous.map((item) => item.startsAt === slot.startsAt ? { ...item, available: false, reason: 'booked' } : item))
        setConfirmed(true)
      }
      else {
        setError(response.response.status === 409 ? 'Время уже занято. Выберите другой слот.' : 'Проверьте имя, email и время записи.')
        const refreshed = await calendarApiListSlots({ path: { id: selected.id }, query: { date } })
        if (refreshed.data) setSlots(refreshed.data.slots)
        setSlot(undefined)
      }
    } catch { setError('Не удалось связаться с API.') }
    finally { setLoading(false) }
  }

  const createType = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const element = event.currentTarget
    const form = new FormData(element)
    setError('')
    const response = await calendarApiCreateEventType({ body: { id: String(form.get('id')), name: String(form.get('name')).trim(), description: String(form.get('description')).trim(), durationMinutes: Number(form.get('duration')) } })
    if (response.data) { element.reset(); await loadTypes() }
    else setError(response.response.status === 409 ? 'Этот id уже используется.' : 'Проверьте данные типа события.')
  }

  const updateType = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingId) return
    const form = new FormData(event.currentTarget)
    setLoading(true)
    setError('')
    try {
      const response = await calendarApiUpdateEventType({ path: { id: editingId }, body: { name: String(form.get('name')).trim(), description: String(form.get('description')).trim(), durationMinutes: Number(form.get('duration')) } })
      if (response.data) {
        const updated = response.data
        setTypes((previous) => previous.map((item) => item.id === editingId ? updated : item))
        setSelected((previous) => previous?.id === editingId ? updated : previous)
        setEditingId(undefined)
        const refreshed = await calendarApiListUpcomingBookings()
        if (refreshed.data) setUpcoming(refreshed.data)
      } else setError(response.response.status === 404 ? 'Тип встречи не найден.' : 'Проверьте данные типа встречи.')
    } catch { setError('Не удалось связаться с API.') }
    finally { setLoading(false) }
  }

  const deleteType = async (item: EventType) => {
    if (!window.confirm(`Удалить тип встречи «${item.name}»? Это действие нельзя отменить.`)) return
    setLoading(true)
    setError('')
    try {
      const response = await calendarApiDeleteEventType({ path: { id: item.id } })
      if (response.data) {
        setTypes((previous) => previous.filter((type) => type.id !== item.id))
        setSelected((previous) => previous?.id === item.id ? undefined : previous)
        if (editingId === item.id) setEditingId(undefined)
      } else setError(response.response.status === 409 ? 'Нельзя удалить тип встречи: по нему уже есть записи.' : 'Тип встречи не найден.')
    } catch { setError('Не удалось связаться с API.') }
    finally { setLoading(false) }
  }

  const deleteBooking = async (item: UpcomingBooking) => {
    if (!window.confirm(`Удалить запись «${item.eventType.name}» на ${dateTime(item.startsAt)}? Это действие нельзя отменить.`)) return
    setDeletingBookingId(item.id)
    setError('')
    try {
      const response = await calendarApiDeleteBooking({ path: { id: item.id } })
      if (response.data) setUpcoming((previous) => previous.filter((booking) => booking.id !== item.id))
      else {
        setError(response.response.status === 404 ? 'Запись уже удалена или началась.' : 'Не удалось удалить запись.')
        if (response.response.status === 404) {
          const refreshed = await calendarApiListUpcomingBookings()
          if (refreshed.data) setUpcoming(refreshed.data)
        }
      }
    } catch { setError('Не удалось связаться с API.') }
    finally { setDeletingBookingId(undefined) }
  }

  return <div className={`${page === 'home' ? 'landing-page' : 'bg-slate-50'} min-h-screen text-slate-900`}>
    <header className="border-b border-slate-200 bg-slate-50"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
      <a href="#/" className="flex items-center gap-2 font-semibold"><CalendarClock className="h-5 w-5 text-orange-500" /> Calendar</a>
      <nav aria-label="Основная навигация" className="flex flex-wrap items-center gap-2 text-sm text-slate-500"><a className={`rounded-lg px-3 py-2 hover:text-slate-900 ${page === 'booking' ? 'bg-slate-200/60 text-slate-900' : ''}`} href="#/booking" aria-current={page === 'booking' ? 'page' : undefined}>Записаться</a><a className={`rounded-lg px-3 py-2 hover:text-slate-900 ${page === 'upcoming' ? 'bg-slate-200/60 text-slate-900' : ''}`} href="#/upcoming" aria-current={page === 'upcoming' ? 'page' : undefined}>Предстоящие события</a></nav>
    </div></header>
    <main className={page === 'home' ? 'mx-auto max-w-6xl px-5 py-14 sm:py-16' : 'mx-auto max-w-6xl space-y-6 px-5 py-8'}>
      {error && <p role="alert" className="rounded-lg bg-red-100 p-4 text-red-800">{error}</p>}
      {page === 'home' ? <div className="grid gap-10 md:grid-cols-2 md:gap-12">
        <section>
          <p className="mb-6 inline-block rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase text-slate-500">Быстрая запись на звонок</p>
          <h1 className="text-5xl font-bold tracking-tight">Calendar</h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-500">Один экран, понятные слоты, быстрая бронь. Выберите время и запишитесь на звонок без лишних шагов.</p>
          <a href="#/booking" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3 font-semibold text-white hover:bg-orange-600">Записаться <ArrowRight className="h-4 w-4" /></a>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Что доступно прямо сейчас</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-500">
            <li>• Слоты с шагом 30 минут с 09:00 до 18:00.</li>
            <li>• Проверка конфликта при бронировании.</li>
            <li>• Просмотр предстоящих событий в отдельном разделе.</li>
          </ul>
        </section>
      </div> : page === 'booking' ? <>
        {!confirmed && settings && <p className="rounded-xl bg-white p-4 text-sm text-slate-600">Часовой пояс: {settings.timezone}. Ежедневно {settings.opensAt}–{settings.closesAt}, шаг начала {settings.slotStepMinutes} минут.</p>}
        {confirmed && selected && slot && date ? <section className="space-y-6">
          <h1 className="text-3xl font-bold">Запись на звонок</h1>
          <div className="grid gap-6 md:grid-cols-2">
            <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Информация</h2>
              <div className="mt-4 space-y-3">
                <div className="rounded-xl bg-slate-100 p-3"><p className="text-sm text-slate-500">Выбранная дата</p><p className="font-medium">{dateLabel(date)}</p></div>
                <div className="rounded-xl bg-slate-100 p-3"><p className="text-sm text-slate-500">Выбранное время</p><p className="font-medium">{time(slot.startsAt)} - {endTime(slot.startsAt, selected.durationMinutes)}</p></div>
                <div className="rounded-xl bg-slate-100 p-3"><p className="text-sm text-slate-500">Свободно</p><p className="font-medium">{slots.filter((item) => item.available).length}</p></div>
                <div className="rounded-xl bg-slate-100 p-3"><p className="text-sm text-slate-500">Длительность встречи</p><p className="font-medium">{selected.durationMinutes} мин</p></div>
              </div>
            </aside>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-center text-2xl font-semibold">Бронь подтверждена. До встречи!</h2>
              <button type="button" className="mt-6 w-full rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600" onClick={() => { setConfirmed(false); setSelected(undefined); setDate(undefined); setSlot(undefined); setDetails(false); setSlots([]); void loadTypes() }}>Забронировать еще</button>
            </div>
          </div>
        </section>
          : !selected ? <section><h1 className="mb-4 text-3xl font-bold">Выберите тип встречи</h1>{types.length === 0 && <p>Пока нет доступных типов встреч.</p>}<div className="grid gap-4 sm:grid-cols-2">{types.map((item) => <button key={item.id} onClick={() => { setSelected(item); setDate(undefined); setSlot(undefined); setDetails(false); setMonth(today().slice(0, 7)); setError('') }} className="rounded-xl border bg-white p-5 text-left shadow-sm hover:border-orange-500"><strong className="block text-lg">{item.name}</strong><span className="block">{item.description}</span><span>{item.durationMinutes} мин.</span></button>)}</div></section>
            : <section className="space-y-8">
              <h1 className="text-3xl font-bold">Запись на звонок</h1>
              {details && slot ? <div className="max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold">Ваши данные</h2>
                <p className="mt-3 text-slate-600">{selected.name} · {dateTime(slot.startsAt)} · {selected.durationMinutes} мин.</p>
                <form className="mt-6 space-y-3" onSubmit={(event) => void book(event)}><label className="block">Имя<input className="mt-1 block w-full rounded border p-2" name="name" required maxLength={100} /></label><label className="block">Email<input className="mt-1 block w-full rounded border p-2" name="email" type="email" required maxLength={254} /></label><div className="flex gap-3 pt-2"><button type="button" className="rounded-xl border px-5 py-3" onClick={() => setDetails(false)}>Назад</button><button disabled={loading} className="rounded-xl bg-orange-500 px-5 py-3 font-semibold text-white disabled:opacity-50">{loading ? 'Сохраняем…' : 'Подтвердить запись'}</button></div></form>
              </div> : <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
                <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold">Информация</h2><div className="mt-4 space-y-3">
                  <div className="rounded-xl bg-slate-100 p-3"><p className="text-sm text-slate-500">Тип встречи</p><p className="font-medium">{selected.name}</p></div>
                  <div className="rounded-xl bg-slate-100 p-3"><p className="text-sm text-slate-500">Выбранная дата</p><p className="font-medium">{date ? dateLabel(date) : 'Дата не выбрана'}</p></div>
                  <div className="rounded-xl bg-slate-100 p-3"><p className="text-sm text-slate-500">Выбранное время</p><p className="font-medium">{slot ? time(slot.startsAt) : 'Время не выбрано'}</p></div>
                  <div className="rounded-xl bg-slate-100 p-3"><p className="text-sm text-slate-500">Свободно</p><p className="font-medium">{slotsLoading ? 'Загрузка…' : date ? slots.filter((item) => item.available).length : 0}</p></div>
                  <div className="rounded-xl bg-slate-100 p-3"><p className="text-sm text-slate-500">Длительность встречи</p><p className="font-medium">{selected.durationMinutes} мин.</p></div>
                </div></aside>
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">Календарь</h2><div className="flex gap-2"><button type="button" aria-label="Предыдущий месяц" disabled={monthAt(month, -1) < windowStart.slice(0, 7)} onClick={() => setMonth(monthAt(month, -1))} className="rounded-xl border px-3 py-2 disabled:opacity-40">←</button><button type="button" aria-label="Следующий месяц" disabled={monthAt(month, 1) > windowEnd.slice(0, 7)} onClick={() => setMonth(monthAt(month, 1))} className="rounded-xl border px-3 py-2 disabled:opacity-40">→</button></div></div>
                  <p className="mt-5 text-sm">{monthLabel(month)}</p><p className="mt-1 text-xs text-slate-500">Доступны даты на ближайшие {settings?.bookingWindowDays ?? 14} дней · Europe/Moscow</p>
                  <div className="mt-5 grid grid-cols-7 gap-1 text-center text-xs text-slate-500">{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => <span key={day} className="py-2">{day}</span>)}</div>
                  <div className="grid grid-cols-7 gap-1">{calendarDays(month).map((day) => { const enabled = day >= windowStart && day <= windowEnd; return <button key={day} type="button" disabled={!enabled} aria-label={dateLabel(day)} aria-pressed={date === day} onClick={() => selectDate(day)} className={`aspect-square rounded-lg border text-sm ${date === day ? 'border-orange-500 bg-orange-500 font-semibold text-white' : enabled ? 'border-slate-200 bg-white hover:border-orange-500' : 'border-slate-200 bg-slate-100 text-slate-400'}`}>{Number(day.slice(-2))}</button> })}</div>
                </div>
                <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold">Статус слотов</h2>
                  {!date ? <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-500">Выберите дату в календаре.</p> : <div className="mt-4"><p className="mb-3 text-sm text-slate-500">{slotsLoading ? 'Загружаем время…' : 'Выберите свободное время:'}</p><div className="grid max-h-[430px] gap-2 overflow-y-auto">{slots.map((item) => <button key={item.startsAt} type="button" disabled={!item.available} aria-pressed={slot?.startsAt === item.startsAt} onClick={() => { setSlot(item); setError('') }} className={`flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-3 text-left text-sm ${slot?.startsAt === item.startsAt ? 'border-orange-500 bg-orange-50' : item.available ? 'bg-white hover:border-orange-500' : 'cursor-not-allowed bg-slate-100 text-slate-500'}`}><span className="whitespace-nowrap">{time(item.startsAt)} - {endTime(item.startsAt, selected.durationMinutes)}</span><span className="text-right font-semibold">{item.available ? 'Свободно' : item.reason ? reasonText[item.reason] : 'Недоступно'}</span></button>)}</div>{!slotsLoading && slots.length > 0 && !slots.some((item) => item.available) && <p className="mt-3 text-sm text-slate-500">На этот день свободного времени нет.</p>}</div>}
                  <div className="mt-5 flex gap-3"><button type="button" className="flex-1 rounded-xl border px-3 py-2 text-sm font-semibold" onClick={() => { setSelected(undefined); setDate(undefined); setSlot(undefined) }}>Назад</button><button type="button" disabled={!slot} onClick={() => setDetails(true)} className="flex-1 rounded-xl bg-orange-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Продолжить</button></div>
                </aside>
              </div>}
            </section>}
      </> : <section className="space-y-8"><p className="rounded bg-amber-100 p-3">Учебное локальное приложение: список и контакты гостей доступны без авторизации. Не используйте реальные персональные данные при публичном размещении.</p>
        <div><h1 className="text-2xl font-bold">Предстоящие события</h1>{upcoming.length ? <ul className="mt-3 space-y-3">{upcoming.map((item) => <li className="flex flex-wrap items-center justify-between gap-3 rounded border bg-white p-4" key={item.id}><div><strong>{item.eventType.name}</strong> ({item.eventType.id}) · {dateTime(item.startsAt)} · {item.eventType.durationMinutes} мин.<br />{item.guestName} · {item.guestEmail}</div><button type="button" disabled={deletingBookingId !== undefined} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50" onClick={() => void deleteBooking(item)}>{deletingBookingId === item.id ? 'Удаляем…' : 'Удалить запись'}</button></li>)}</ul> : <p className="mt-3">Предстоящих встреч пока нет.</p>}</div>
        <div><h2 className="text-2xl font-bold">Создать тип встречи</h2><form className="mt-4 grid max-w-lg gap-3" onSubmit={(event) => void createType(event)}><label>id (неизменяемый идентификатор для ссылок и записей)<input name="id" required pattern="[a-z0-9\\-]{1,64}" maxLength={64} className="block w-full rounded border p-2" /></label><label>Название<input name="name" required maxLength={100} className="block w-full rounded border p-2" /></label><label>Описание<textarea name="description" required maxLength={1000} className="block w-full rounded border p-2" /></label><label>Длительность (мин.)<input name="duration" type="number" min="1" max="540" step="1" required className="block w-full rounded border p-2" /></label><button className="rounded-lg bg-orange-600 p-3 text-white">Создать</button></form></div>
        <div><h2 className="text-2xl font-bold">Типы встреч</h2>{types.length ? <ul className="mt-3 space-y-3">{types.map((item) => <li key={item.id} className="rounded-xl border bg-white p-4">
          {editingId === item.id ? <form className="grid max-w-lg gap-3" onSubmit={(event) => void updateType(event)}><p className="font-semibold">Редактировать {item.id}</p><label>Название<input name="name" required maxLength={100} defaultValue={item.name} className="block w-full rounded border p-2" /></label><label>Описание<textarea name="description" required maxLength={1000} defaultValue={item.description} className="block w-full rounded border p-2" /></label><label>Длительность (мин.)<input name="duration" type="number" min="1" max="540" step="1" required defaultValue={item.durationMinutes} className="block w-full rounded border p-2" /></label><div className="flex gap-3"><button disabled={loading} className="rounded-lg bg-orange-600 px-4 py-2 text-white disabled:opacity-50">{loading ? 'Сохраняем…' : 'Сохранить'}</button><button type="button" className="rounded-lg border px-4 py-2" onClick={() => { setEditingId(undefined); setError('') }}>Отмена</button></div></form>
            : <div className="flex flex-wrap items-center justify-between gap-3"><span>{item.name} ({item.id}) · {item.durationMinutes} мин. — {item.description}</span><div className="flex gap-4"><button type="button" className="text-orange-700 underline" onClick={() => { setEditingId(item.id); setError('') }}>Редактировать</button><button type="button" disabled={loading} className="text-red-700 underline disabled:opacity-50" onClick={() => void deleteType(item)}>Удалить</button></div></div>}</li>)}</ul> : <p>Типов пока нет.</p>}</div>
      </section>}
    </main>
  </div>
}

export default App
