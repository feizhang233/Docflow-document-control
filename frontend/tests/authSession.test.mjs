import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { transformSync } from 'esbuild'

const source = readFileSync(new URL('../src/lib/authSession.ts', import.meta.url), 'utf8')
const { code } = transformSync(source, { loader: 'ts', format: 'esm', target: 'es2022' })
const { AuthSessionCoordinator, AuthSessionChangedError } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

test('parallel recovery callers share one request and its exact promise', async () => {
  const sessions = new AuthSessionCoordinator()
  const started = deferred()
  const response = deferred()
  let requests = 0
  const recover = () => sessions.recover(sessions.generation(), async () => {
    requests += 1
    started.resolve()
    return response.promise
  })
  const first = recover()
  const others = Array.from({ length: 10 }, recover)
  for (const other of others) assert.equal(other, first)
  await started.promise
  assert.equal(requests, 1)
  const user = { id: 1 }
  response.resolve(user)
  assert.deepEqual(await Promise.all([first, ...others]), Array(11).fill(user))
})

test('a failed recovery allows another attempt and does not poison queued auth work', async () => {
  const sessions = new AuthSessionCoordinator()
  const failure = new Error('Connection interrupted')
  const failed = sessions.recover(sessions.generation(), async () => { throw failure })
  const next = sessions.exclusive(sessions.generation(), async () => 'queued operation completed')
  await assert.rejects(failed, error => error === failure)
  assert.equal(await next, 'queued operation completed')
  assert.equal(await sessions.recover(sessions.generation(), async () => 'recovered'), 'recovered')
})

test('advancing the session skips old queued work and rejects an old successful response', async () => {
  const sessions = new AuthSessionCoordinator()
  const started = deferred()
  const response = deferred()
  const oldGeneration = sessions.generation()
  const inFlight = sessions.exclusive(oldGeneration, async () => {
    started.resolve()
    await response.promise
    return 'old user'
  })
  const inFlightRejected = assert.rejects(inFlight, AuthSessionChangedError)
  await started.promise
  let staleRequests = 0
  const staleQueued = sessions.exclusive(oldGeneration, async () => { staleRequests += 1 })
  const staleRejected = assert.rejects(staleQueued, AuthSessionChangedError)
  const currentGeneration = sessions.advance()
  const fresh = sessions.exclusive(currentGeneration, async () => 'new user')
  assert.equal(sessions.isCurrent(oldGeneration), false)
  assert.equal(sessions.isCurrent(currentGeneration), true)
  assert.throws(() => sessions.assertCurrent(oldGeneration), AuthSessionChangedError)
  response.resolve()
  await Promise.all([inFlightRejected, staleRejected])
  assert.equal(staleRequests, 0)
  assert.equal(await fresh, 'new user')
})

test('an old failed response is reported as a changed session after a new login begins', async () => {
  const sessions = new AuthSessionCoordinator()
  const started = deferred()
  const response = deferred()
  const old = sessions.exclusive(sessions.generation(), async () => {
    started.resolve()
    return response.promise
  })
  const rejected = assert.rejects(old, AuthSessionChangedError)
  await started.promise
  sessions.advance()
  response.reject(new Error('Old refresh was rejected'))
  await rejected
})

for (const action of ['login', 'logout']) {
  test(`${action} waits for an in-flight refresh so its cookie change remains final`, async () => {
    const sessions = new AuthSessionCoordinator()
    const started = deferred()
    const response = deferred()
    const cookieWrites = []
    const refresh = sessions.recover(sessions.generation(), async () => {
      started.resolve()
      await response.promise
      cookieWrites.push('old refreshed cookie')
      return 'old user'
    })
    const rejectedRefresh = assert.rejects(refresh, AuthSessionChangedError)
    await started.promise
    const newGeneration = sessions.advance()
    const changed = sessions.exclusive(newGeneration, async () => {
      cookieWrites.push(action === 'login' ? 'new account cookie' : 'cleared cookies')
      return action
    })
    assert.deepEqual(cookieWrites, [])
    response.resolve()
    await rejectedRefresh
    assert.equal(await changed, action)
    assert.deepEqual(cookieWrites, ['old refreshed cookie', action === 'login' ? 'new account cookie' : 'cleared cookies'])
  })
}

test('a new generation gets its own recovery and an old cleanup cannot clear it', async () => {
  const sessions = new AuthSessionCoordinator()
  const oldStarted = deferred()
  const oldResponse = deferred()
  const freshStarted = deferred()
  const freshResponse = deferred()
  const old = sessions.recover(sessions.generation(), async () => {
    oldStarted.resolve()
    return oldResponse.promise
  })
  const rejectedOld = assert.rejects(old, AuthSessionChangedError)
  await oldStarted.promise
  const currentGeneration = sessions.advance()
  const fresh = sessions.recover(currentGeneration, async () => {
    freshStarted.resolve()
    return freshResponse.promise
  })
  assert.notEqual(fresh, old)
  assert.equal(sessions.recover(currentGeneration - 1, async () => 'unexpected old duplicate'), old)
  assert.equal(sessions.recover(currentGeneration, async () => 'unexpected current duplicate'), fresh)
  oldResponse.resolve('old user')
  await rejectedOld
  await freshStarted.promise
  assert.equal(sessions.recover(currentGeneration, async () => 'unexpected duplicate request'), fresh)
  freshResponse.resolve('current user')
  assert.equal(await fresh, 'current user')
})

test('an injected shared lock serializes cookie writes from separate coordinators', async () => {
  let lockTail = Promise.resolve()
  const lock = task => {
    const result = lockTail.then(task)
    lockTail = result.then(() => undefined, () => undefined)
    return result
  }
  const firstTab = new AuthSessionCoordinator(lock)
  const secondTab = new AuthSessionCoordinator(lock)
  const started = deferred()
  const response = deferred()
  const writes = []
  const first = firstTab.exclusive(firstTab.generation(), async () => {
    started.resolve()
    await response.promise
    writes.push('first tab')
  })
  await started.promise
  const second = secondTab.exclusive(secondTab.generation(), async () => { writes.push('second tab') })
  assert.deepEqual(writes, [])
  response.resolve()
  await Promise.all([first, second])
  assert.deepEqual(writes, ['first tab', 'second tab'])
})

test('a session changed while waiting for a browser lock never sends its stale auth request', async () => {
  const lockRequested = deferred()
  const lockGranted = deferred()
  const sessions = new AuthSessionCoordinator(async task => {
    lockRequested.resolve()
    await lockGranted.promise
    return task()
  })
  let requests = 0
  const stale = sessions.exclusive(sessions.generation(), async () => { requests += 1 })
  const rejected = assert.rejects(stale, AuthSessionChangedError)
  await lockRequested.promise
  sessions.advance()
  lockGranted.resolve()
  await rejected
  assert.equal(requests, 0)
  assert.equal(await sessions.exclusive(sessions.generation(), async () => 'current request'), 'current request')
})
