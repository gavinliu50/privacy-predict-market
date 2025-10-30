// fetch-retry polyfill for browser environment
// This provides a browser-compatible wrapper for fetch with retry functionality

interface FetchRetryOptions extends RequestInit {
  retries?: number
  retryDelay?: number | ((attempt: number, error: Error | null, response: Response | null) => number)
  retryOn?: number[] | ((attempt: number, error: Error | null, response: Response | null) => boolean | Promise<boolean>)
}

function isPositiveInteger(value: any): boolean {
  return Number.isInteger(value) && value >= 0
}

class ArgumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ArgumentError'
  }
}

export default function fetchRetryFactory(fetch: typeof globalThis.fetch, defaults?: FetchRetryOptions) {
  defaults = defaults || {}
  
  if (typeof fetch !== 'function') {
    throw new ArgumentError('fetch must be a function')
  }

  if (typeof defaults !== 'object') {
    throw new ArgumentError('defaults must be an object')
  }

  if (defaults.retries !== undefined && !isPositiveInteger(defaults.retries)) {
    throw new ArgumentError('retries must be a positive integer')
  }

  if (defaults.retryDelay !== undefined && !isPositiveInteger(defaults.retryDelay) && typeof defaults.retryDelay !== 'function') {
    throw new ArgumentError('retryDelay must be a positive integer or a function returning a positive integer')
  }

  if (defaults.retryOn !== undefined && !Array.isArray(defaults.retryOn) && typeof defaults.retryOn !== 'function') {
    throw new ArgumentError('retryOn property expects an array or function')
  }

  const baseDefaults: Required<Pick<FetchRetryOptions, 'retries' | 'retryDelay' | 'retryOn'>> = {
    retries: 3,
    retryDelay: 1000,
    retryOn: [],
  }

  defaults = Object.assign({}, baseDefaults, defaults)

  return function fetchRetry(input: RequestInfo | URL, init?: FetchRetryOptions): Promise<Response> {
    let retries = defaults!.retries!
    let retryDelay = defaults!.retryDelay!
    let retryOn = defaults!.retryOn!

    if (init && init.retries !== undefined) {
      if (isPositiveInteger(init.retries)) {
        retries = init.retries
      } else {
        throw new ArgumentError('retries must be a positive integer')
      }
    }

    if (init && init.retryDelay !== undefined) {
      if (isPositiveInteger(init.retryDelay) || (typeof init.retryDelay === 'function')) {
        retryDelay = init.retryDelay
      } else {
        throw new ArgumentError('retryDelay must be a positive integer or a function returning a positive integer')
      }
    }

    if (init && init.retryOn) {
      if (Array.isArray(init.retryOn) || (typeof init.retryOn === 'function')) {
        retryOn = init.retryOn
      } else {
        throw new ArgumentError('retryOn property expects an array or function')
      }
    }

    return new Promise((resolve, reject) => {
      const wrappedFetch = (attempt: number) => {
        const _input = typeof Request !== 'undefined' && input instanceof Request
          ? input.clone()
          : input
          
        fetch(_input, init)
          .then((response) => {
            if (Array.isArray(retryOn) && retryOn.indexOf(response.status) === -1) {
              resolve(response)
            } else if (typeof retryOn === 'function') {
              try {
                return Promise.resolve(retryOn(attempt, null, response))
                  .then((retryOnResponse) => {
                    if (retryOnResponse) {
                      retry(attempt, null, response)
                    } else {
                      resolve(response)
                    }
                  }).catch(reject)
              } catch (error) {
                reject(error)
              }
            } else {
              if (attempt < retries) {
                retry(attempt, null, response)
              } else {
                resolve(response)
              }
            }
          })
          .catch((error) => {
            if (typeof retryOn === 'function') {
              try {
                Promise.resolve(retryOn(attempt, error, null))
                  .then((retryOnResponse) => {
                    if (retryOnResponse) {
                      retry(attempt, error, null)
                    } else {
                      reject(error)
                    }
                  })
                  .catch((error) => {
                    reject(error)
                  })
              } catch (error) {
                reject(error)
              }
            } else if (attempt < retries) {
              retry(attempt, error, null)
            } else {
              reject(error)
            }
          })
      }

      function retry(attempt: number, error: Error | null, response: Response | null) {
        const delay = (typeof retryDelay === 'function')
          ? retryDelay(attempt, error, response)
          : retryDelay
        setTimeout(() => {
          wrappedFetch(++attempt)
        }, delay)
      }

      wrappedFetch(0)
    })
  }
}

