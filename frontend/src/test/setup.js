import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '../i18n'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

let n = 0
if (!URL.createObjectURL) URL.createObjectURL = () => `blob:mock-${++n}`
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
}
