import { useEffect, useRef } from 'react';

export const AI_DATA_CHANGED_EVENT = 'medconnect:data-changed';

/** Re-run a page's fetch after the Ask AI assistant applies a confirmed change. */
const useAIRefresh = (callback) => {
  const ref = useRef(callback);
  ref.current = callback;

  useEffect(() => {
    const handler = () => ref.current?.();
    window.addEventListener(AI_DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(AI_DATA_CHANGED_EVENT, handler);
  }, []);
};

export default useAIRefresh;
