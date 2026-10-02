'use client';

import { useEffect, useState } from 'react';
import AuthScreen from '@/components/AuthScreen';
import ChatRoom from '@/components/ChatRoom';
import ConsentScreen from '@/components/ConsentScreen';
import CreateWizard from '@/components/CreateWizard';
import Lobby from '@/components/Lobby';
import { useToast } from '@/components/Toast';
import { useAuth, useBilling, useCatalog, useCharacters, useOllama } from '@/lib/store';
import type { Character } from '@/lib/types';

export default function Home() {
  const auth = useAuth();
  const { characters, ready, saveFailed, update, add, remove } = useCharacters(auth.username);
  const catalog = useCatalog(auth.username);
  const { billing, refresh: refreshBilling } = useBilling(auth.username);
  const ollama = useOllama();
  const { toast, Toast } = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const active = characters.find((c) => c.id === activeId);
  const maxCharacters = billing?.plan.features.maxCharacters ?? 0;
  const full = !!maxCharacters && characters.length >= maxCharacters;

  useEffect(() => {
    if (saveFailed) toast('บันทึกลงบัญชีไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่');
  }, [saveFailed, toast]);

  if (auth.me === undefined) return null;
  if (!auth.me.username) return <AuthScreen onSubmit={auth.submit} />;
  if (auth.me.needsConsent) {
    return <ConsentScreen username={auth.me.username} email={auth.me.email} phone={auth.me.phone} onSubmit={auth.consent} onLogout={auth.logout} />;
  }

  const open = (id: string) => {
    update(id, (c) => ({ ...c, updatedAt: Date.now() }));
    setActiveId(id);
  };

  const fullMessage = `แพ็กเกจ ${billing?.plan.name ?? ''} มีเรื่องได้ ${maxCharacters} เรื่อง ลบเรื่องเก่าหรืออัปเกรดเพื่อเพิ่ม`;

  const create = (c: Character) => {
    add(c);
    setWizardOpen(false);
    setActiveId(c.id);
  };

  const startFromCatalog = async (catalogId: string) => {
    // Already chatting with this one: continue that story instead of starting another.
    const existing = characters.find((c) => c.sourceId === catalogId);
    if (existing) return open(existing.id);
    if (full) return toast(fullMessage);
    try {
      const c = await catalog.start(catalogId);
      add(c);
      setActiveId(c.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'เริ่มเรื่องไม่สำเร็จ');
    }
  };

  return (
    <>
      {active ? (
        <ChatRoom
          character={active}
          host={ollama.host}
          model={ollama.model}
          billing={billing}
          onReplied={refreshBilling}
          onUpdate={(fn) => update(active.id, fn)}
          onBack={() => setActiveId(null)}
        />
      ) : (
        <Lobby
          characters={characters}
          ready={ready}
          username={auth.me.username}
          isAdmin={auth.me.isAdmin}
          catalog={catalog.catalog}
          submissions={catalog.submissions}
          plan={billing?.plan ?? null}
          onOpen={open}
          onStart={startFromCatalog}
          onSubmitForPublish={async (id) => {
            try {
              await catalog.submit(id);
              toast('ส่งให้แอดมินตรวจแล้ว ผ่านเมื่อไหร่ตัวละครจะขึ้นในคลัง');
            } catch (e) {
              toast(e instanceof Error ? e.message : 'ส่งไม่สำเร็จ');
            }
          }}
          onWithdraw={async (id) => {
            await catalog.withdraw(id);
            toast('ถอนคำขอเผยแพร่แล้ว');
          }}
          onDelete={(id) => {
            remove(id);
            toast('ลบเรื่องแล้ว');
          }}
          onCreate={() => (full ? toast(fullMessage) : setWizardOpen(true))}
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
