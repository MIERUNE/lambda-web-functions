type ProbeResponse = {
  id: string
  environmentId: string
  activeAtStart: number
}

const baseUrl = process.argv[2] ?? 'http://localhost:3000'
const originUrl = process.argv[3]
const probeUrl = new URL('/probe', baseUrl)

async function post(id: string, delayMs: number): Promise<ProbeResponse> {
  const response = await fetch(probeUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, delayMs }),
  })
  if (!response.ok) throw new Error(`POST ${probeUrl}: HTTP ${response.status} ${await response.text()}`)

  const result = await response.json() as ProbeResponse
  if (result.id !== id) throw new Error(`POST body mismatch: sent ${id}, received ${result.id}`)
  return result
}

async function main(): Promise<void> {
  await post('post-check', 0)
  console.log(`POST body: OK (${probeUrl})`)

  if (originUrl) {
    const direct = await fetch(new URL('/probe', originUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'direct-check' }),
    })
    if (direct.status !== 403) throw new Error(`Unsigned direct request: expected HTTP 403, got ${direct.status}`)
    console.log('Unsigned direct request: HTTP 403')
  }

  const started = performance.now()
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) => post(`parallel-${index}`, 1000)))
  const elapsedMs = Math.round(performance.now() - started)
  const maxInOneEnvironment = Math.max(...results.map((result) => result.activeAtStart))
  const environments = new Set(results.map((result) => result.environmentId)).size

  console.log(`8 requests: ${elapsedMs} ms, ${environments} environment(s), max simultaneous in one environment: ${maxInOneEnvironment}`)
  if (maxInOneEnvironment < 2) {
    console.error('Same-environment concurrency was not observed; request placement can vary. Retry the probe.')
    process.exitCode = 2
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
