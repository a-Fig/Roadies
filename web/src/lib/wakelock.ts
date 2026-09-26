/** Keep a mounted phone's screen on while in a room. Returns a release function. */
export function keepScreenOn(): () => void {
  let lock: WakeLockSentinel | null = null;
  let released = false;
  const acquire = async () => {
    if (released || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      lock = await navigator.wakeLock.request('screen');
    } catch {
      // Not allowed (battery saver, iframe, ...). Nothing else to do.
    }
  };
  // The lock is dropped whenever the page is hidden; take it again on return.
  const onVisibility = () => void acquire();
  document.addEventListener('visibilitychange', onVisibility);
  void acquire();
  return () => {
    released = true;
    document.removeEventListener('visibilitychange', onVisibility);
    void lock?.release().catch(() => {});
  };
}
