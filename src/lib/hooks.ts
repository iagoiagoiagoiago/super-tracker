import { useEffect, useState } from 'react'

/** Current time, refreshed every `ms` while `active`. */
export function useNow(ms = 1000, active = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), ms)
    const onVisible = () => setNow(Date.now())
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ms, active])
  return now
}

/** Keeps the screen on while mounted (Screen Wake Lock API), re-acquiring it when the app comes back. */
export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = async () => {
      try {
        if (document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen')
        if (cancelled) void lock?.release()
      } catch {
        // Not allowed (low battery, unsupported context). Nothing to do.
      }
    }
    void acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', acquire)
      void lock?.release()
    }
  }, [enabled])
}

let audio: AudioContext | undefined

/** Must be called from a user gesture once so iOS lets us play sound later. */
export function unlockAudio() {
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
  } catch {
    // Audio unavailable.
  }
}

/** Short double beep + vibration (where supported) when rest is over. */
export function restDoneAlert() {
  navigator.vibrate?.([120, 80, 120])
  if (!audio) return
  const t = audio.currentTime
  for (const offset of [0, 0.22]) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, t + offset)
    gain.gain.exponentialRampToValueAtTime(0.25, t + offset + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.18)
    osc.connect(gain).connect(audio.destination)
    osc.start(t + offset)
    osc.stop(t + offset + 0.2)
  }
}
