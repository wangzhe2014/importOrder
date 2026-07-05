import assert from 'node:assert/strict'
import test from 'node:test'
import { withTimeout } from '../src/app/api/v3/shipments/_timeout.mjs'

test('resolves before timeout', async () => {
  const value = await withTimeout(Promise.resolve('ok'), 'fast', 100)
  assert.equal(value, 'ok')
})

test('rejects when promise exceeds timeout', async () => {
  await assert.rejects(
    () => withTimeout(new Promise(() => {}), 'slow query', 10),
    /slow query timeout after 10ms/
  )
})
