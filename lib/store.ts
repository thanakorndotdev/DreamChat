'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_HOST, DEFAULT_MODEL } from './presets';
import type { BillingState } from '@/app/api/billing/route';
import type { CatalogEntry, CatalogStatus } from './catalog';
import type { Character, OllamaStatus } from './types';

const CHARS_KEY = 'dream_characters';

// Error replies written by the old single-file version were stored as plain text.
const LEGACY_ERROR = /สะดุดเล็กน้อย|เกิดข้อผิดพลาด/;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function normalize(list: Character[]): Character[] {
  return list.map((c) => {
    const messages = (c.messages || []).filter((m) => !(m.sender === 'char' && LEGACY_ERROR.test(m.text)));
    return {
      ...c,
      // The bundled Iris used to ship with a fixed player name; let people choose their own.
      userName: c.id === 'char-1' && c.userName === 'พี' ? '' : c.userName,
      messages: messages.length ? messages : [{ sender: 'char', text: c.firstMessage || '*ทักทายคุณด้วยความเงียบสงบ*' }],
    };
  });
}

/** Characters saved in this browser before accounts existed; handed to the first account that signs in empty. */
function takeLocalCharacters(): Character[] | null {
  const saved = read(CHARS_KEY);
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved) as Character[];
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

export type Me = {
  username: string | null;
  isAdmin: boolean;
  /** Has to accept the current PDPA terms (and fill in email/phone) before using the app. */
  needsConsent: boolean;
  email: string | null;
  phone: string | null;
};

export type RegisterForm = { username: string; password: string; email: string; phone: string; consent: boolean; marketing: boolean };

export function useAuth() {
  /** undefined while checking the session. */
  const [me, setMe] = useState<Me | undefined>(undefined);

  const refresh = useCallback(
    () =>
      fetch('/api/auth/me')
        .then((r) => r.json() as Promise<Me>)
        .then(setMe)
        .catch(() => setMe({ username: null, isAdmin: false, needsConsent: false, email: null, phone: null })),
    [],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submit = useCallback(
    async (mode: 'login' | 'register', form: RegisterForm) => {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'login' ? { username: form.username, password: form.password } : form),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      await refresh();
    },
    [refresh],
  );

  const consent = useCallback(
    async (form: { consent: boolean; marketing: boolean; email?: string; phone?: string }) => {
      const res = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setMe({ username: null, isAdmin: false, needsConsent: false, email: null, phone: null });
  }, []);

  return {
    me,
    /** undefined while checking, null when signed out or still owing consent (nothing private loads until then). */
    username: me === undefined ? undefined : me.username && !me.needsConsent ? me.username : null,
    submit,
    consent,
    logout,
  };
}

const SAVE_DELAY = 600;

function putCharacter(c: Character, keepalive = false) {
  return fetch(`/api/characters/${encodeURIComponent(c.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(c),
    keepalive,
  }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  });
}

/** Characters of the signed-in account. Changes are saved to the server shortly after they happen. */
export function useCharacters(username: string | null | undefined) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [ready, setReady] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  // Last version of each character known to be on the server; anything else is unsaved.
  const saved = useRef(new Map<string, Character>());
  const latest = useRef<Character[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setReady(false);
    setCharacters([]);
    saved.current = new Map();
    if (!username) return;

    let cancelled = false;
    fetch('/api/characters')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Character[]>;
      })
      .then((remote) => {
        if (cancelled) return;
        if (remote.length) {
          const list = normalize(remote);
          list.forEach((c) => saved.current.set(c.id, c));
          setCharacters(list);
        } else {
          // Empty account: bring over this browser's old chats; otherwise the lobby shows the catalog.
          const local = takeLocalCharacters();
          setCharacters(local ? normalize(local) : []);
          if (local) {
            try {
              localStorage.removeItem(CHARS_KEY);
            } catch {}
          }
        }
        setReady(true);
      })
      .catch(() => !cancelled && setSaveFailed(true));
    return () => {
      cancelled = true;
    };
  }, [username]);

  const flush = useCallback((keepalive = false) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const dirty = latest.current.filter((c) => saved.current.get(c.id) !== c);
    for (const c of dirty) {
      putCharacter(c, keepalive)
        .then(() => {
          saved.current.set(c.id, c);
          setSaveFailed(false);
        })
        .catch(() => setSaveFailed(true));
    }
  }, []);

  useEffect(() => {
    latest.current = characters;
    if (!ready) return;
    if (characters.some((c) => saved.current.get(c.id) !== c)) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY);
    }
  }, [characters, ready, flush]);

  useEffect(() => {
    const onHide = () => flush(true);
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [flush]);

  const update = useCallback((id: string, fn: (c: Character) => Character) => {
    setCharacters((list) => list.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  const add = useCallback((c: Character) => setCharacters((list) => [c, ...list]), []);
  const remove = useCallback((id: string) => {
    setCharacters((list) => list.filter((c) => c.id !== id));
    saved.current.delete(id);
    fetch(`/api/characters/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => setSaveFailed(true));
  }, []);

  return { characters, ready, saveFailed, update, add, remove };
}

/** AI backend status. The host is pinned on the server (OLLAMA_URL / Workers AI), so nothing here is user-configurable. */
export function useOllama() {
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [status, setStatus] = useState<OllamaStatus>('checking');

  useEffect(() => {
    fetch(`/api/ollama/tags?host=${encodeURIComponent(DEFAULT_HOST)}`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json() as Promise<{ models: string[] }>;
      })
      .then(({ models }) => {
        // Use a model the server actually has.
        setModel((m) => (models.length && !models.includes(m) ? models[0] : m));
        setStatus('online');
      })
      .catch(() => setStatus('offline'));
  }, []);

  return { host: DEFAULT_HOST, model, status };
}

export type CatalogCard = Omit<CatalogEntry, 'reviewNote' | 'sourceId'>;
export type Submission = { id: string; sourceId: string | null; status: CatalogStatus; reviewNote: string; tier: number };

/** Published characters and this account's own publish requests. */
export function useCatalog(username: string | null | undefined) {
  const [catalog, setCatalog] = useState<CatalogCard[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  const refresh = useCallback(() => {
    fetch('/api/catalog')
      .then((r) => (r.ok ? (r.json() as Promise<CatalogCard[]>) : []))
      .then(setCatalog)
      .catch(() => {});
    fetch('/api/catalog/mine')
      .then((r) => (r.ok ? (r.json() as Promise<Submission[]>) : []))
      .then(setSubmissions)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (username) refresh();
  }, [username, refresh]);

  const submit = useCallback(
    async (characterId: string) => {
      const res = await fetch('/api/catalog/mine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ characterId }) });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      refresh();
    },
    [refresh],
  );

  const withdraw = useCallback(
    async (characterId: string) => {
      await fetch(`/api/catalog/mine?source=${encodeURIComponent(characterId)}`, { method: 'DELETE' });
      refresh();
    },
    [refresh],
  );

  /** Creates the private copy on the server and returns it. */
  const start = useCallback(async (id: string): Promise<Character> => {
    const res = await fetch(`/api/catalog/${encodeURIComponent(id)}/start`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
    return res.json() as Promise<Character>;
  }, []);

  return { catalog, submissions, submit, withdraw, start };
}

/** The account's plan and today's usage; refresh after each reply to keep the counter current. */
export function useBilling(username: string | null | undefined) {
  const [billing, setBilling] = useState<BillingState | null>(null);
  const refresh = useCallback(() => {
    fetch('/api/billing')
      .then((r) => (r.ok ? (r.json() as Promise<BillingState>) : null))
      .then(setBilling)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (username) refresh();
  }, [username, refresh]);
  return { billing, refresh };
}
