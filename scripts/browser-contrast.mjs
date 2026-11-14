import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseUrl = process.env.BROWSER_BASE_URL ?? 'http://127.0.0.1:3000'
const output = 'artifacts/browser'
const sha = process.env.EVIDENCE_SHA ?? 'local'
const evidence = { sha, url: baseUrl, checks: [], contrast: [], errors: [] }
await mkdir(output, { recursive: true })

const tomorrow = () => {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  return new Date(Date.parse(`${day}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)
}
const dateLabel = (day) => new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric',
}).format(new Date(`${day}T12:00:00Z`))

async function contrast(page, locator, name, hover = false) {
  await locator.waitFor()
  if (hover) {
    await locator.hover()
    await locator.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished))
    })
  }
  const colors = await locator.evaluate((element) => {
    const style = getComputedStyle(element)
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    const toRgb = (color) => {
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
      if (alpha !== 255) throw new Error(`Non-opaque color: ${color}`)
      return [red, green, blue]
    }
    return {
      foreground: style.color, background: style.backgroundColor,
      foregroundRgb: toRgb(style.color), backgroundRgb: toRgb(style.backgroundColor),
    }
  })
  const luminance = (rgb) => {
    const [red, green, blue] = rgb.map((channel) => {
      const value = channel / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return red * 0.2126 + green * 0.7152 + blue * 0.0722
  }
  const foreground = luminance(colors.foregroundRgb)
  const background = luminance(colors.backgroundRgb)
  const ratio = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
  evidence.contrast.push({ name, state: hover ? 'hover' : 'normal', ...colors, ratio, passed: ratio >= 4.5 })
  if (ratio < 4.5) evidence.errors.push(`${name} (${hover ? 'hover' : 'normal'}): ${ratio.toFixed(3)}:1 < 4.5:1`)
}

let browser
let page
try {
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(baseUrl)
  const cta = page.locator('main a[href="#/booking"]')
  await contrast(page, cta, 'Записаться')
  await contrast(page, cta, 'Записаться', true)
  await page.screenshot({ path: `${output}/home.png`, fullPage: true })

  const response = await fetch(`${baseUrl}/api/event-types`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'browser-check', name: 'Браузерная проверка', description: 'Проверка записи', durationMinutes: 30 }),
  })
  if (response.status !== 200 && response.status !== 201) throw new Error(`Cannot create type: ${response.status} ${await response.text()}`)
  await cta.click()
  await page.getByRole('button', { name: /Браузерная проверка/ }).click()
  await page.getByRole('button', { name: dateLabel(tomorrow()) }).click()
  const selectedDay = page.locator('button[aria-pressed="true"]').first()
  await contrast(page, selectedDay, 'Выбранный день')
  const freeSlot = page.getByRole('button', { name: /Свободно/ }).first()
  await freeSlot.waitFor()
  const slotTime = (await freeSlot.innerText()).match(/\d{2}:\d{2}/)?.[0]
  if (!slotTime) throw new Error('Cannot read selected slot time')
  await freeSlot.click()
  const continueButton = page.getByRole('button', { name: 'Продолжить' })
  await contrast(page, continueButton, 'Продолжить')
  await contrast(page, continueButton, 'Продолжить', true)
  await continueButton.click()
  const confirmButton = page.getByRole('button', { name: 'Подтвердить запись' })
  await contrast(page, confirmButton, 'Подтвердить запись')
  await contrast(page, confirmButton, 'Подтвердить запись', true)
  await page.getByRole('textbox', { name: 'Имя' }).fill('Тестовый гость')
  await page.getByRole('textbox', { name: 'Email' }).fill('browser@example.com')
  await page.screenshot({ path: `${output}/booking.png`, fullPage: true })
  await confirmButton.click()
  await page.getByText('Бронь подтверждена. До встречи!').waitFor()
  if (await page.getByText('Тема разговора', { exact: false }).count()) throw new Error('Guest confirmation unexpectedly shows a topic')
  evidence.checks.push('Бронирование без темы через браузер и API успешно')
  const repeatButton = page.getByRole('button', { name: 'Забронировать еще' })
  await contrast(page, repeatButton, 'Забронировать еще')
  await contrast(page, repeatButton, 'Забронировать еще', true)
  await page.screenshot({ path: `${output}/confirmed.png`, fullPage: true })
  await page.goto(`${baseUrl}/#/upcoming`)
  const booking = page.locator('li', { hasText: 'browser@example.com' })
  await booking.waitFor()
  const bookingText = await booking.innerText()
  for (const value of ['Браузерная проверка', 'Тестовый гость', 'browser@example.com', slotTime]) {
    if (!bookingText.includes(value)) throw new Error(`Owner booking is missing ${value}`)
  }
  if (/Тема разговора/.test(bookingText)) throw new Error('Booking without topic has a placeholder')
  evidence.checks.push('Запись без темы видна владельцу с типом, временем и контактами')
  const createButton = page.getByRole('button', { name: 'Создать', exact: true })
  await contrast(page, createButton, 'Создать')
  await contrast(page, createButton, 'Создать', true)
  await page.getByRole('button', { name: 'Редактировать' }).first().click()
  const saveButton = page.getByRole('button', { name: 'Сохранить', exact: true })
  await contrast(page, saveButton, 'Сохранить')
  await contrast(page, saveButton, 'Сохранить', true)
  await page.screenshot({ path: `${output}/upcoming.png`, fullPage: true })
} catch (error) {
  evidence.errors.push(error instanceof Error ? error.stack ?? error.message : String(error))
  if (page) {
    try {
      await page.screenshot({ path: `${output}/failure.png`, fullPage: true })
    } catch (screenshotError) {
      evidence.errors.push(`Could not capture failure screenshot: ${String(screenshotError)}`)
    }
  }
} finally {
  await browser?.close()
  evidence.passed = evidence.errors.length === 0
  await writeFile(`${output}/report.json`, JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence, null, 2))
}
if (!evidence.passed) process.exitCode = 1
