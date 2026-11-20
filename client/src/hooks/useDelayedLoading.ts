import { useState, useEffect, useRef } from 'react';

export interface UseDelayedLoadingOptions {
  delay?: number;
  minDuration?: number;
  slowThreshold?: number;
}

export interface UseDelayedLoadingReturn {
  /** True when skeleton should be rendered */
  showSkeleton: boolean;
  /** True when request is taking longer than slowThreshold (default 8000ms) */
  isSlow: boolean;
  /** Cancels the slow warning strip */
  cancelSlow: () => void;
  /** True during the initial 300ms delay window before skeleton appears */
  isPending: boolean;
}

/**
 * useDelayedLoading
 *
 * Rules:
 * 1. Wait `delay` ms (default 300ms) before showing skeleton to prevent flashing on fast network responses.
 * 2. Once skeleton is visible, keep it up for at least `minDuration` ms (default 400ms) to prevent visual jitter.
 * 3. After `slowThreshold` ms (default 8000ms), trigger `isSlow` to show the slow-loading warning strip.
 */
export function useDelayedLoading(
  isLoading: boolean,
  delay: number = 300,
  minDuration: number = 400,
  slowThreshold: number = 8000
): UseDelayedLoadingReturn {
  const [showSkeleton, setShowSkeleton] = useState<boolean>(false);
  const [isSlow, setIsSlow] = useState<boolean>(false);
  const [isPending, setIsPending] = useState<boolean>(false);

  const shownAtRef = useRef<number | null>(null);
  const delayTimerRef = useRef<any>(null);
  const minTimerRef = useRef<any>(null);
  const slowTimerRef = useRef<any>(null);

  useEffect(() => {
    if (isLoading) {
      setIsPending(true);
      setIsSlow(false);

      // 1. Wait `delay` ms before displaying skeleton
      delayTimerRef.current = setTimeout(() => {
        shownAtRef.current = Date.now();
        setShowSkeleton(true);
        setIsPending(false);

        // 2. Start slow threshold timer
        const remainingSlow = Math.max(0, slowThreshold - delay);
        slowTimerRef.current = setTimeout(() => {
          setIsSlow(true);
        }, remainingSlow);
      }, delay);
    } else {
      setIsPending(false);
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current);
        delayTimerRef.current = null;
      }
      if (slowTimerRef.current) {
        clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
      }
      setIsSlow(false);

      if (shownAtRef.current !== null) {
        const elapsed = Date.now() - shownAtRef.current;
        const remainingMin = Math.max(0, minDuration - elapsed);

        if (remainingMin > 0) {
          minTimerRef.current = setTimeout(() => {
            setShowSkeleton(false);
            shownAtRef.current = null;
          }, remainingMin);
        } else {
          setShowSkeleton(false);
          shownAtRef.current = null;
        }
      } else {
        setShowSkeleton(false);
      }
    }

    return () => {
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
      if (minTimerRef.current) clearTimeout(minTimerRef.current);
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    };
  }, [isLoading, delay, minDuration, slowThreshold]);

  const cancelSlow = () => {
    setIsSlow(false);
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }
  };

  return { showSkeleton, isSlow, cancelSlow, isPending };
}
