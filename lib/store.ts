'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_CHARACTERS, DEFAULT_HOST, DEFAULT_MODEL } from './presets';
import type { Character, OllamaStatus } from './types';

const CHARS_KEY = 'dream_characters';
const HOST_KEY = 'dream_ollama_host';
const MODEL_KEY = 'dream_ollama_model';

// Error replies written by the old single-file version were stored as plain text.
const LEGACY_ERROR = /สะดุดเล็กน้อย|เกิดข้อผิดพลาด/;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
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

export function useAuth() {
  /** undefined while checking the session, null when signed out. */
  const [username, setUsername] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d: { username: string | null }) => setUsername(d.username))
      .catch(() => setUsername(null));
  }, []);

  const submit = useCallback(async (mode: 'login' | 'register', name: string, password: string) => {
    const res = await fetch(`/api/auth/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name, password }),
    });
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
    setUsername(((await res.json()) as { username: string }).username);
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUsername(null);
  }, []);

  return { username, submit, logout };
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
          // Empty account: bring over this browser's old chats, or start with the sample character.
          const local = takeLocalCharacters();
          setCharacters(normalize(local ?? DEFAULT_CHARACTERS));
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

export function useOllama() {
  const [host, setHost] = useState(DEFAULT_HOST);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [status, setStatus] = useState<OllamaStatus>('checking');
  const [models, setModels] = useState<string[]>([]);

  const check = useCallback(async (h: string) => {
    setStatus('checking');
    try {
      const res = await fetch(`/api/ollama/tags?host=${encodeURIComponent(h)}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { models: string[] };
      setModels(data.models);
      setStatus('online');
      return true;
    } catch {
      setModels([]);
      setStatus('offline');
      return false;
    }
  }, []);

  useEffect(() => {
    const h = read(HOST_KEY) || DEFAULT_HOST;
    setHost(h);
    setModel(read(MODEL_KEY) || DEFAULT_MODEL);
    check(h);
  }, [check]);

  // A saved model the server doesn't offer (e.g. an old Ollama tag) can't be used — switch to one it has.
  useEffect(() => {
    if (models.length && !models.includes(model)) {
      setModel(models[0]);
      write(MODEL_KEY, models[0]);
    }
  }, [models, model]);

  const save = useCallback(
    (h: string, m: string) => {
      setHost(h);
      setModel(m);
      write(HOST_KEY, h);
      write(MODEL_KEY, m);
      return check(h);
    },
    [check],
  );

  return { host, model, status, models, check, save };
}
