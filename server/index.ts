import { createApp } from './app.js'
import { resolve } from 'node:path'

const app = createApp({ staticRoot: resolve('dist') })
const port = Number(process.env.PORT ?? 3000)

try {
  await app.listen({ port, host: '0.0.0.0' })
} catch (error) {
  app.log.error(error)
  process.exitCode = 1
}
