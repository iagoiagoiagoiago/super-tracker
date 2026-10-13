export type PersistState = 'persisted' | 'not-persisted' | 'unsupported'

/**
 * Asks the browser not to evict our IndexedDB data under storage pressure.
 * On iOS this is most reliable once the app is installed to the home screen.
 */
export async function requestPersistentStorage(): Promise<PersistState> {
  if (!navigator.storage?.persist) return 'unsupported'
  if (await navigator.storage.persisted()) return 'persisted'
  return (await navigator.storage.persist()) ? 'persisted' : 'not-persisted'
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}
