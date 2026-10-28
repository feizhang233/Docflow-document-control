export class AuthSessionChangedError extends Error {
  constructor() {
    super('The signed-in session changed while this request was pending.')
    this.name = 'AuthSessionChangedError'
  }
}

export type AuthSessionLock = <R>(task: () => Promise<R>) => Promise<R>

/** Serialize cookie-changing requests and reject results belonging to an older session. */
export class AuthSessionCoordinator<T> {
  private currentGeneration = 0
  private tail: Promise<void> = Promise.resolve()
  private readonly recoveries = new Map<number, Promise<T>>()
  private readonly lock: AuthSessionLock

  constructor(lock: AuthSessionLock = task => task()) {
    this.lock = lock
  }

  generation(): number {
    return this.currentGeneration
  }

  advance(): number {
    this.currentGeneration += 1
    return this.currentGeneration
  }

  isCurrent(generation: number): boolean {
    return generation === this.currentGeneration
  }

  assertCurrent(generation: number): void {
    if (!this.isCurrent(generation)) throw new AuthSessionChangedError()
  }

  exclusive<R>(generation: number, task: () => Promise<R>): Promise<R> {
    const result = this.tail.then(async () => {
      this.assertCurrent(generation)
      try {
        return await this.lock(async () => {
          // An optional browser lock can wait behind another tab's auth request.
          this.assertCurrent(generation)
          try {
            return await task()
          } finally {
            this.assertCurrent(generation)
          }
        })
      } finally {
        this.assertCurrent(generation)
      }
    })
    // A failed request must still release the next auth operation in the queue.
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }

  recover(generation: number, task: () => Promise<T>): Promise<T> {
    const pending = this.recoveries.get(generation)
    if (pending) return pending
    const promise = this.exclusive(generation, task)
    this.recoveries.set(generation, promise)
    const clear = () => {
      if (this.recoveries.get(generation) === promise) this.recoveries.delete(generation)
    }
    // Handle both outcomes directly; a discarded finally() promise would reject again.
    promise.then(clear, clear)
    return promise
  }
}
