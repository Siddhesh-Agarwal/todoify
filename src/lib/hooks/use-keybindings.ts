import { useEffect, useRef } from 'react'

export type KeyHandler = () => void
export type KeyRegistry = Record<string, KeyHandler>

export interface BindingEvent {
  key: string
  shiftKey: boolean
}
export interface BindingContext {
  isInputFocused: boolean
}

// Pure: decide which handler (if any) a keydown should trigger.
// - Build a key id: "Shift+<key>" when shift is held, else the raw key.
// - If an editable element is focused, only Escape passes through (DESIGN §5:
//   never hijack j/k/c/slash while typing).
export function resolveBinding(
  event: BindingEvent,
  ctx: BindingContext,
  registry: KeyRegistry,
): KeyHandler | null {
  const id = event.shiftKey ? `Shift+${event.key}` : event.key
  if (ctx.isInputFocused && id !== 'Escape') return null
  return registry[id] ?? null
}

function isEditableFocused(): boolean {
  if (typeof document === 'undefined') return false
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable
}

// Bind a key→handler registry to window keydown. The registry is kept in a ref
// so callers can pass a fresh object each render without re-binding the listener.
export function useKeybindings(registry: KeyRegistry) {
  const ref = useRef(registry)
  ref.current = registry
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const fn = resolveBinding({ key: e.key, shiftKey: e.shiftKey }, { isInputFocused: isEditableFocused() }, ref.current)
      if (fn) {
        e.preventDefault()
        fn()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
