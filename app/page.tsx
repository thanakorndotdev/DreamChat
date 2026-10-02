'use client';

import { useEffect, useState } from 'react';
import AccountModal from '@/components/AccountModal';
import AuthScreen from '@/components/AuthScreen';
import ChatRoom from '@/components/ChatRoom';
import ConsentScreen from '@/components/ConsentScreen';
import CreateWizard from '@/components/CreateWizard';
import Lobby from '@/components/Lobby';
import ReportBug from '@/components/ReportBug';
import { useToast } from '@/components/Toast';
import { useAuth, useBilling, useCatalog, useCharacters, useOllama } from '@/lib/store';
import type { Character } from '@/lib/types';

export default function Home() {
  const auth = useAuth();
  const { characters, ready, saveFailed, update, add, remove, legacy, importLegacy, clearLegacy } = useCharacters(auth.username);
  const catalog = useCatalog(auth.username);
  const { billing, refresh: refreshBilling } = useBilling(auth.username);
  const ollama = useOllama();
  const { toast, Toast } = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  /** Sign-in asked for by an action (starting a chat, creating a character); `start` resumes it afterwards. */
  const [loginFor, setLoginFor] = useState<{ reason: string; start?: string } | null>(null);
  const [pendingStart, setPendingStart] = useState<string | null>(null);

  const active = characters.find((c) => c.id === activeId);
  const maxCharacters = billing?.plan.features.maxCharacters ?? 0;
  const full = !!maxCharacters && characters.length >= maxCharacters;

  useEffect(() => {
    if (saveFailed) toast('บันทึกลงบัญชีไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่');
  }, [saveFailed, toast]);

  // Once signed in (and past consent, with the account's chats loaded), carry on with what they clicked.
  useEffect(() => {
    if (!pendingStart || !auth.username || !ready) return;
    setPendingStart(null);
    startFromCatalog(pendingStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingStart, auth.username, ready]);

  if (auth.me === undefined) return null;
  const signedIn = !!auth.me.username;
  if (signedIn && auth.me.needsConsent) {
    return <ConsentScreen
        username={auth.me.username ?? ""}
        email={auth.me.email}
        phone={auth.me.phone}
        birthdate={auth.me.birthdate}
        guardianConsent={auth.me.guardianConsent}
        onSubmit={auth.consent}
        onLogout={auth.logout}
      />;
  }
  const askLogin = (reason: string, start?: string) => setLoginFor({ reason, start });

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

  async function startFromCatalog(catalogId: string) {
    if (!auth.username) {
      const name = catalog.catalog.find((e) => e.id === catalogId)?.sheet.name;
      return askLogin(`เข้าสู่ระบบหรือสมัครก่อนเริ่มคุย${name ? `กับ ${name}` : ''} แชทของคุณเป็นความลับ`, catalogId);
    }
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
  }

  return (
    <>
      {active ? (
        <ChatRoom
          character={active}
          host={ollama.host}
          model={ollama.model}
          billing={billing}
          onReplied={refreshBilling}
          onReport={() => setReportOpen(true)}
          userAdult={!!auth.me.adult}
          onUpdate={(fn) => update(active.id, fn)}
          onBack={() => setActiveId(null)}
        />
      ) : (
        <Lobby
          characters={characters}
          ready={ready}
          username={auth.me.username ?? ''}
          guest={!signedIn}
          onLogin={() => askLogin('เข้าสู่ระบบหรือสมัครเพื่อเริ่มเขียนเรื่องรักของคุณ')}
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
          onReport={() => setReportOpen(true)}
          onWithdraw={async (id) => {
            await catalog.withdraw(id);
            toast('ถอนคำขอเผยแพร่แล้ว');
          }}
          onDelete={(id) => {
            remove(id);
            toast('ลบเรื่องแล้ว');
          }}
          onCreate={() => (!signedIn ? askLogin('เข้าสู่ระบบหรือสมัครก่อนสร้างตัวละคร') : full ? toast(fullMessage) : setWizardOpen(true))}
          onAccount={() => setAccountOpen(true)}
          legacyCount={legacy?.length ?? 0}
          onImportLegacy={() => {
            if (maxCharacters && characters.length + (legacy?.length ?? 0) > maxCharacters) return toast(fullMessage);
            importLegacy();
            toast('นำเข้าแชทเก่าแล้ว');
          }}
          onDiscardLegacy={() => {
            clearLegacy();
            toast('ลบแชทเก่าออกจากเครื่องนี้แล้ว');
          }}
        />
      )}

      {loginFor && !signedIn && (
        <AuthScreen
          reason={loginFor.reason}
          onClose={() => setLoginFor(null)}
          onSubmit={async (mode, form) => {
            await auth.submit(mode, form);
            if (loginFor.start) setPendingStart(loginFor.start);
            setLoginFor(null);
          }}
        />
      )}
      {accountOpen && signedIn && (
        <AccountModal
          me={auth.me}
          planName={billing?.plan.name ?? 'Free'}
          toast={toast}
          onClose={() => setAccountOpen(false)}
          onLogout={() => {
            setAccountOpen(false);
            setActiveId(null);
            auth.logout();
          }}
          onDeleted={() => {
            setAccountOpen(false);
            setActiveId(null);
            auth.logout();
          }}
        />
      )}
      {reportOpen && (
        <ReportBug
          where={active ? `ห้องแชท ${active.name}` : 'หน้าแรก'}
          onClose={() => setReportOpen(false)}
          onSent={() => toast('ส่งรายงานแล้ว ขอบคุณที่ช่วยบอก ทีมงานจะตอบในแท็บ "ที่เคยแจ้ง"')}
        />
      )}
      {wizardOpen && <CreateWizard host={ollama.host} model={ollama.model} onClose={() => setWizardOpen(false)} onCreate={create} userAdult={!!auth.me.adult} />}
      <Toast />
    </>
  );
}
