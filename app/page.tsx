'use client';

import { useState } from 'react';
import ChatRoom from '@/components/ChatRoom';
import CreateWizard from '@/components/CreateWizard';
import Lobby from '@/components/Lobby';
import SettingsDialog from '@/components/SettingsDialog';
import { useToast } from '@/components/Toast';
import { useCharacters, useOllama } from '@/lib/store';
import type { Character } from '@/lib/types';

export default function Home() {
  const { characters, ready, update, add, remove } = useCharacters();
  const ollama = useOllama();
  const { toast, Toast } = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const active = characters.find((c) => c.id === activeId);

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
          model={ollama.model}
          onOpen={open}
          onDelete={(id) => {
            remove(id);
            toast('ลบตัวละครแล้ว');
          }}
          onCreate={() => setWizardOpen(true)}
          onSettings={() => setSettingsOpen(true)}
        />
      )}

      {wizardOpen && <CreateWizard onClose={() => setWizardOpen(false)} onCreate={create} />}
      {settingsOpen && (
        <SettingsDialog
          ollama={ollama}
          onClose={() => setSettingsOpen(false)}
          onSaved={(ok) => toast(ok ? 'บันทึกแล้ว เชื่อมต่อ Ollama ได้' : 'บันทึกแล้ว แต่ยังติดต่อ Ollama ไม่ได้')}
        />
      )}
      <Toast />
    </>
  );
}
