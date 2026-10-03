import { useEffect, useState } from 'react';

/** Remaining whole seconds until `target`. Updates every 1 second. */
export function useCountdown(target: Date | null | undefined): number | null {
  const targetMs = target?.getTime() ?? null;
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(() =>
    calcRemaining(targetMs),
  );

  useEffect(() => {
    setRemainingSeconds(calcRemaining(targetMs));
    if (targetMs == null) return;

    const id = setInterval(() => {
      setRemainingSeconds(calcRemaining(targetMs));
    }, 1000);

    return () => clearInterval(id);
  }, [targetMs]);

  return remainingSeconds;
}

function calcRemaining(targetMs: number | null): number | null {
  if (targetMs == null) return null;
  return Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
}
