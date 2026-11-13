import { afterEach, expect, test } from 'vitest'
import { createServer, type ViteDevServer } from 'vite'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../server/app.js'

let vite: ViteDevServer | undefined

afterEach(async () => {
  await vite?.close()
  vite = undefined
})

test('API responds over HTTP', async () => {
  const app = createApp()

  try {
    const address = await app.listen({ port: 0, host: '127.0.0.1' })
    const response = await fetch(`${address}/health`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  } finally {
    await app.close()
  }
})

test('production server serves frontend and API on the same port', async () => {
  const staticRoot = mkdtempSync(join(tmpdir(), 'calendar-static-'))
  writeFileSync(join(staticRoot, 'index.html'), '<title>Календарь звонков</title>')
  const app = createApp({ databasePath: ':memory:', staticRoot })

  try {
    const address = await app.listen({ port: 0, host: '127.0.0.1' })
    const [page, api] = await Promise.all([fetch(address), fetch(`${address}/api/event-types`)])

    expect(page.status).toBe(200)
    expect(await page.text()).toContain('Календарь звонков')
    expect(api.status).toBe(200)
    expect(await api.json()).toEqual([])
  } finally {
    await app.close()
    rmSync(staticRoot, { recursive: true, force: true })
  }
})

test('frontend serves the application page', async () => {
  vite = await createServer({
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
  })
  await vite.listen()

  const address = vite.resolvedUrls?.local[0]
  expect(address).toBeDefined()

  const response = await fetch(address!)
  expect(response.status).toBe(200)
  expect(await response.text()).toContain('<title>Календарь звонков</title>')
})
