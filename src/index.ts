import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'

const app = new Hono()
// Process-local state lets the probe distinguish concurrency within one Lambda environment.
const environmentId = randomUUID()
let activeRequests = 0

app.get('/', (c) => c.json({
  message: 'Hello from Hono on Lambda Web Functions!',
  region: process.env.AWS_REGION ?? 'local',
}))

app.post('/probe', async (c) => {
  const body = await c.req.json<{ id?: unknown; delayMs?: unknown }>().catch(() => null)
  const id = body?.id
  const delayMs = body?.delayMs ?? 0

  if (typeof id !== 'string' || id.length === 0 || id.length > 100 ||
      typeof delayMs !== 'number' || !Number.isInteger(delayMs) || delayMs < 0 || delayMs > 2000) {
    return c.json({ error: 'Expected { id: string, delayMs?: integer (0-2000) }' }, 400)
  }

  const activeAtStart = ++activeRequests
  const startedAt = Date.now()

  try {
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    return c.json({ id, environmentId, activeAtStart, startedAt, finishedAt: Date.now() })
  } finally {
    activeRequests--
  }
})

const [hostname, port] = (process.env.AWS_LAMBDA_HTTP_ENDPOINT ?? 'localhost:3000').split(':')

serve({ fetch: app.fetch, hostname, port: Number(port) })
