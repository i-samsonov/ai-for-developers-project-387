const reminderLeadMs = 30 * 60_000

export const isReminderDue = ({ startsAt }: { startsAt: string }, now: number) => {
  const start = Date.parse(startsAt)
  return now >= start - reminderLeadMs && now < start
}

export const nextReminderChange = (bookings: { startsAt: string }[], now: number) => {
  const transitions = bookings.flatMap(({ startsAt }) => {
    const start = Date.parse(startsAt)
    return [start - reminderLeadMs, start]
  }).filter((time) => time > now)
  return transitions.length ? Math.min(...transitions) : undefined
}
