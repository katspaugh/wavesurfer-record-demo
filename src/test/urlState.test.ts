import { describe, expect, it } from 'vitest'
import { buildSessionUrl, FRESH_TOKEN, readSessionParam, SESSION_PARAM } from '../lib/urlState'

describe('urlState', () => {
  it('exposes the param name and fresh token', () => {
    expect(SESSION_PARAM).toBe('session')
    expect(FRESH_TOKEN).toBe('new')
  })

  describe('readSessionParam', () => {
    it('returns null when the param is absent', () => {
      expect(readSessionParam('')).toBeNull()
      expect(readSessionParam('?foo=bar')).toBeNull()
    })

    it('returns the session id when present', () => {
      expect(readSessionParam('?session=abc')).toBe('abc')
      expect(readSessionParam('?foo=bar&session=xyz')).toBe('xyz')
    })

    it('returns the fresh sentinel verbatim', () => {
      expect(readSessionParam('?session=new')).toBe(FRESH_TOKEN)
    })
  })

  describe('buildSessionUrl', () => {
    it('adds the session param when the value is set', () => {
      expect(buildSessionUrl('/', '', '', 'abc')).toBe('/?session=abc')
      expect(buildSessionUrl('/app', '?other=1', '#h', 'abc'))
        .toBe('/app?other=1&session=abc#h')
    })

    it('replaces an existing session param without duplicating it', () => {
      expect(buildSessionUrl('/', '?session=old', '', 'new'))
        .toBe('/?session=new')
    })

    it('removes the session param when value is null', () => {
      expect(buildSessionUrl('/', '?session=abc', '', null)).toBe('/')
      expect(buildSessionUrl('/', '?other=1&session=abc', '#h', null))
        .toBe('/?other=1#h')
    })

    it('preserves pathname and hash with no other params', () => {
      expect(buildSessionUrl('/foo/bar', '', '#anchor', null)).toBe('/foo/bar#anchor')
    })
  })
})
