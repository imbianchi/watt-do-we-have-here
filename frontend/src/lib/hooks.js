import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Polls fn at intervalMs while the page is visible.
 * Pauses when hidden, runs immediately on focus / visibility return,
 * and re-runs from the start when any dep in `deps` changes.
 */
export function usePolling(fn, intervalMs, deps = []) {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let cancelled = false
    let timer

    const tick = async () => {
      if (cancelled) return
      if (document.visibilityState === 'visible') {
        try { await fnRef.current() } catch { /* swallowed */ }
      }
      if (!cancelled) timer = setTimeout(tick, intervalMs)
    }

    const onResume = () => {
      if (document.visibilityState !== 'visible' || cancelled) return
      clearTimeout(timer)
      tick()
    }

    tick()
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('focus', onResume)

    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('focus', onResume)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps])
}

/**
 * Tween a numeric value with cubic ease-out.
 * Returns the current animated value.
 */
export function useTween(target, duration = 500) {
  const [value, setValue] = useState(typeof target === 'number' ? target : 0)
  const ref = useRef(value)

  useEffect(() => {
    if (typeof target !== 'number' || !isFinite(target)) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      ref.current = target
      setValue(target)
      return
    }
    const start = ref.current
    const t0 = performance.now()
    let raf
    const step = (now) => {
      const k = Math.min((now - t0) / duration, 1)
      const v = start + (target - start) * (1 - Math.pow(1 - k, 3))
      ref.current = v
      setValue(v)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return value
}

/** Persisted state in localStorage. */
export function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw == null ? defaultValue : JSON.parse(raw)
    } catch {
      return defaultValue
    }
  })

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* quota */ }
  }, [key, value])

  return [value, setValue]
}

/** Calls onClose on Escape while `active` is true. */
export function useEscapeKey(active, onClose) {
  useEffect(() => {
    if (!active) return
    const h = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [active, onClose])
}

/** Traps Tab focus within a ref and autofocuses the first focusable element. */
export function useFocusTrap(active, containerRef) {
  useEffect(() => {
    if (!active || !containerRef.current) return
    const el = containerRef.current
    const SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    const focusables = () => Array.from(el.querySelectorAll(SELECTOR)).filter((n) => !n.disabled)

    const list = focusables()
    if (list.length) list[0].focus()

    const handler = (e) => {
      if (e.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    el.addEventListener('keydown', handler)
    return () => el.removeEventListener('keydown', handler)
  }, [active, containerRef])
}

/** Force a re-render at a given interval (used to refresh "Xs ago" labels). */
export function useTick(intervalMs = 1000) {
  const [, set] = useState(0)
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
}

export const useToggle = (initial = false) => {
  const [on, set] = useState(initial)
  const toggle = useCallback(() => set((v) => !v), [])
  return [on, toggle, set]
}
