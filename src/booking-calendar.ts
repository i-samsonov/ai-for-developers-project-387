export const dayAt = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

export const monthAt = (month: string, offset: number) => {
  const [year, index] = month.split('-').map(Number)
  return new Date(Date.UTC(year, index - 1 + offset, 1)).toISOString().slice(0, 7)
}

export const calendarDays = (month: string) => {
  const first = `${month}-01`
  const leading = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7
  return Array.from({ length: 42 }, (_, index) => dayAt(first, index - leading))
}
