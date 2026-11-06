import { describe, it, expect } from 'vitest'
import { validateImageFile, qualityToWarnings, cameraErrorCode, MAX_SOURCE_BYTES, stopStream } from './capture'

const f = (name, type, size = 1000) => ({ name, type, size })

describe('validateImageFile', () => {
  it('accepts JPEG, PNG and WebP', () => {
    expect(validateImageFile(f('a.jpg', 'image/jpeg'))).toBeNull()
    expect(validateImageFile(f('a.png', 'image/png'))).toBeNull()
    expect(validateImageFile(f('a.webp', 'image/webp'))).toBeNull()
  })
  it('accepts a camera file with an empty MIME type when the extension is valid', () => {
    expect(validateImageFile(f('IMG_001.JPG', ''))).toBeNull()
  })
  it('rejects empty, wrong type, HEIC and oversized files with a reason key', () => {
    expect(validateImageFile(f('a.jpg', 'image/jpeg', 0)).code).toBe('empty')
    expect(validateImageFile(null).code).toBe('empty')
    expect(validateImageFile(f('a.pdf', 'application/pdf')).code).toBe('type')
    expect(validateImageFile(f('a.gif', 'image/gif')).code).toBe('type')
    expect(validateImageFile(f('a.heic', 'image/heic')).code).toBe('heic')
    expect(validateImageFile(f('a.heic', '')).code).toBe('heic')
    expect(validateImageFile(f('big.jpg', 'image/jpeg', MAX_SOURCE_BYTES + 1)).code).toBe('size')
    expect(validateImageFile(f('x.exe', '')).code).toBe('type')
  })
})

describe('qualityToWarnings', () => {
  it('maps dark/blurry flags to warning codes', () => {
    expect(qualityToWarnings({ isDark: true, isBlurry: true }).map((w) => w.code)).toEqual(['too_dark', 'blurry'])
    expect(qualityToWarnings({ isDark: false, isBlurry: false })).toEqual([])
    expect(qualityToWarnings(undefined)).toEqual([])
  })
})

describe('cameraErrorCode', () => {
  it('classifies getUserMedia errors', () => {
    expect(cameraErrorCode({ name: 'NotAllowedError' })).toBe('permission')
    expect(cameraErrorCode({ name: 'NotFoundError' })).toBe('nocamera')
    expect(cameraErrorCode({ name: 'NotReadableError' })).toBe('inuse')
    expect(cameraErrorCode(new Error('x'))).toBe('unknown')
  })
})

describe('stopStream', () => {
  it('stops every track and tolerates null', () => {
    const stops = []
    stopStream({ getTracks: () => [{ stop: () => stops.push(1) }, { stop: () => stops.push(2) }] })
    expect(stops).toEqual([1, 2])
    expect(() => stopStream(null)).not.toThrow()
  })
})
