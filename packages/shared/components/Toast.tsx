'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toast = useCallback((text: string) => {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 2800);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const Toast = useCallback(
    () => (
      <div className="toast" role="status" aria-live="polite" data-show={message ? '' : undefined}>
        {message}
      </div>
    ),
    [message],
  );

  return { toast, Toast };
}
