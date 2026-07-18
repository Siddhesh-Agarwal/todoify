import { describe, it, expect, vi } from 'vitest'
import { resolveBinding, type KeyHandler } from './use-keybindings'

const h = () => {}

describe('resolveBinding', () => {
  it('fires c / slash / j / k when no input is focused', () => {
    for (const key of ['c', '/', 'j', 'k']) {
      expect(resolveBinding({ key, shiftKey: false }, { isInputFocused: false }, { c: h, '/': h, j: h, k: h })).toBe(h)
    }
  })

  it('suppresses c / slash / j / k when an input is focused', () => {
    for (const key of ['c', '/', 'j', 'k']) {
      expect(
        resolveBinding({ key, shiftKey: false }, { isInputFocused: true }, { c: h, '/': h, j: h, k: h }),
      ).toBeNull()
    }
  })

  it('always fires Escape, even when an input is focused', () => {
    const esc: KeyHandler = vi.fn()
    expect(resolveBinding({ key: 'Escape', shiftKey: false }, { isInputFocused: true }, { Escape: esc })).toBe(esc)
    expect(resolveBinding({ key: 'Escape', shiftKey: false }, { isInputFocused: false }, { Escape: esc })).toBe(esc)
  })

  it('returns null for keys not in the registry', () => {
    expect(resolveBinding({ key: 'x', shiftKey: false }, { isInputFocused: false }, { c: h })).toBeNull()
  })

  it('treats Shift+c as "Shift+c" (not "c"), so plain-letter bindings do not fire on shift', () => {
    expect(
      resolveBinding({ key: 'C', shiftKey: true }, { isInputFocused: false }, { c: h, '/': h, j: h, k: h }),
    ).toBeNull()
  })

  it('resolves Shift+0 when it is registered (reserved for Phase 4 priority keys)', () => {
    const shift0: KeyHandler = vi.fn()
    // Shift+0 produces event.key === ')' on a US keyboard. The registry key
    // is built as `Shift+${event.key}`, so Phase 4 registers under 'Shift+)'.
    expect(
      resolveBinding({ key: ')', shiftKey: true }, { isInputFocused: false }, { 'Shift+)': shift0 }),
    ).toBe(shift0)
  })
})
