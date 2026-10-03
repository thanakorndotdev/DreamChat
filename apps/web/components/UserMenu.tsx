'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CaretDown } from '@phosphor-icons/react';

export type UserMenuItem = { label: string; icon: React.ReactNode; danger?: boolean } & ({ href: string } | { onSelect: () => void });

type Props = {
  /** The button's own content (name, avatar icon). */
  children: React.ReactNode;
  label: string;
  className?: string;
  items: UserMenuItem[];
};

/** The signed-in name in a header, opening a short menu below it. */
export default function UserMenu({ children, label, className, items }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      root.current?.querySelector<HTMLElement>('.user-menu-trigger')?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={root}>
      <button type="button" className={`user-menu-trigger ${className ?? ''}`} aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen((o) => !o)}>
        {children}
        <CaretDown size={14} weight="bold" aria-hidden className="user-menu-caret" />
      </button>
      {open && (
        <div className="user-menu-list" role="menu" aria-label={label}>
          {items.map((item) =>
            'href' in item ? (
              <Link key={item.label} role="menuitem" href={item.href} className="user-menu-item" onClick={() => setOpen(false)}>
                {item.icon}
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="user-menu-item"
                data-danger={item.danger || undefined}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
