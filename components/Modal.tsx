'use client';

import { useEffect, useRef } from 'react';
import { X } from '@phosphor-icons/react';

type Props = {
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
};

export default function Modal({ title, subtitle, onClose, footer, children, wide }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  // Callers pass inline handlers, so keep the latest one in a ref; otherwise the
  // effect below re-runs on every keystroke and yanks focus back to the first field.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    panel.current?.querySelector<HTMLElement>('input, textarea, select, button:not(.modal-close)')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div>
            <h2 className="modal-title">{title}</h2>
            {subtitle && <div className="modal-sub">{subtitle}</div>}
          </div>
          <button className="icon-btn modal-close" onClick={onClose} aria-label="ปิด">
            <X size={18} weight="bold" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}
