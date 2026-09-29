'use client';

import { useCallback, useEffect, useState } from 'react';
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

function loadCharacters(): Character[] {
  const saved = read(CHARS_KEY);
  if (!saved) return DEFAULT_CHARACTERS;
  try {
    const parsed = JSON.parse(saved) as Character[];
    return parsed.map((c) => {
      const messages = (c.messages || []).filter((m) => !(m.sender === 'char' && LEGACY_ERROR.test(m.text)));
      return {
        ...c,
        messages: messages.length ? messages : [{ sender: 'char', text: c.firstMessage || '*ทักทายคุณด้วยความเงียบสงบ*' }],
      };
    });
  } catch {
    return DEFAULT_CHARACTERS;
  }
}

export function useCharacters() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCharacters(loadCharacters());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) write(CHARS_KEY, JSON.stringify(characters));
  }, [characters, ready]);

  const update = useCallback((id: string, fn: (c: Character) => Character) => {
    setCharacters((list) => list.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  const add = useCallback((c: Character) => setCharacters((list) => [c, ...list]), []);
  const remove = useCallback((id: string) => setCharacters((list) => list.filter((c) => c.id !== id)), []);

  return { characters, ready, update, add, remove };
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
