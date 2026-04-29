import { describe, expect, it } from 'vitest'
import {
  appError,
  err,
  fail,
  flatMap,
  fromThrown,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  tryAsync,
  trySync,
  unwrapOr,
} from '../lib/result'

describe('result', () => {
  it('builds ok and err values', () => {
    const success = ok(42)
    const failure = err('boom')
    expect(success).toEqual({ ok: true, value: 42 })
    expect(failure).toEqual({ ok: false, error: 'boom' })
    expect(isOk(success)).toBe(true)
    expect(isErr(failure)).toBe(true)
  })

  it('maps and flatMaps over ok', () => {
    expect(map(ok(2), (n) => n * 3)).toEqual(ok(6))
    expect(map(err('x'), (n: number) => n * 3)).toEqual(err('x'))
    expect(flatMap(ok(2), (n) => ok(n + 1))).toEqual(ok(3))
    expect(flatMap(ok(2), () => err('nope'))).toEqual(err('nope'))
  })

  it('maps over err and unwraps fallback', () => {
    expect(mapErr(err('x'), (e) => `${e}!`)).toEqual(err('x!'))
    expect(unwrapOr(err('x'), 0)).toBe(0)
    expect(unwrapOr(ok(1), 0)).toBe(1)
  })

  it('captures sync exceptions as Result errors', () => {
    const result = trySync(() => {
      throw new Error('nope')
    }, (cause) => fromThrown(cause, 'fallback'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toBe('nope')
  })

  it('captures async exceptions as Result errors', async () => {
    const result = await tryAsync(async () => {
      throw new Error('async-bad')
    }, (cause) => fromThrown(cause, 'fallback', 'storage'))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('storage')
      expect(result.error.message).toBe('async-bad')
    }
  })

  it('builds AppError values via fail()', () => {
    expect(fail('storage', 'oops')).toEqual(err(appError('storage', 'oops')))
  })
})
