const moscowDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Moscow',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export const groupUpcomingByDay = <T extends { id: number; startsAt: string }>(bookings: T[]) => {
  const groups: { day: string; items: T[] }[] = []
  const sorted = [...bookings].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id - b.id)
  for (const item of sorted) {
    const parts = moscowDate.formatToParts(new Date(item.startsAt))
    const part = (type: 'year' | 'month' | 'day') => parts.find((value) => value.type === type)!.value
    const day = `${part('year')}-${part('month')}-${part('day')}`
    const last = groups.at(-1)
    if (last?.day === day) last.items.push(item)
    else groups.push({ day, items: [item] })
  }
  return groups
}
