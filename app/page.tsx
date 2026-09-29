'use client';

import { useEffect, useState } from 'react';
import AuthScreen from '@/components/AuthScreen';
import ChatRoom from '@/components/ChatRoom';
import CreateWizard from '@/components/CreateWizard';
import Lobby from '@/components/Lobby';
import { useToast } from '@/components/Toast';
import { useAuth, useCharacters, useOllama } from '@/lib/store';
import type { Character } from '@/lib/types';

export default function Home() {
  const auth = useAuth();
  const { characters, ready, saveFailed, update, add, remove } = useCharacters(auth.username);
  const ollama = useOllama();
  const { toast, Toast } = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const active = characters.find((c) => c.id === activeId);

  useEffect(() => {
    if (saveFailed) toast('บันทึกลงบัญชีไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่');
  }, [saveFailed, toast]);

  if (auth.username === undefined) return null;
  if (auth.username === null) return <AuthScreen onSubmit={auth.submit} />;

  const open = (id: string) => {
    update(id, (c) => ({ ...c, updatedAt: Date.now() }));
    setActiveId(id);
  };

  const create = (c: Character) => {
    add(c);
    setWizardOpen(false);
    setActiveId(c.id);
  };

  return (
    <>
      {active ? (
        <ChatRoom
          character={active}
          host={ollama.host}
          model={ollama.model}
          status={ollama.status}
          onUpdate={(fn) => update(active.id, fn)}
          onBack={() => setActiveId(null)}
        />
      ) : (
        <Lobby
          characters={characters}
          ready={ready}
          status={ollama.status}
          username={auth.username}
          onOpen={open}
          onDelete={(id) => {
            remove(id);
            toast('ลบตัวละครแล้ว');
          }}
          onCreate={() => setWizardOpen(true)}
          onLogout={() => {
            setActiveId(null);
            auth.logout();
          }}
        />
      )}

      {wizardOpen && <CreateWizard host={ollama.host} model={ollama.model} onClose={() => setWizardOpen(false)} onCreate={create} />}
      <Toast />
    </>
  );
}
