'use client';

import { useEffect, useState } from 'react';
import type { AdminSettings } from '@longrak/shared/api-types';
import { adminFetch, errorText } from './api';

const MODEL_SUGGESTIONS = [
  '@cf/meta/llama-3.1-8b-instruct-fp8',
  '@cf/google/gemma-4-26b-a4b-it',
  '@cf/aisingapore/gemma-sea-lion-v4-27b-it',
];

type Draft = { cf_account_id: string; cf_api_token: string; cf_model: string; cf_fallback_model: string };

export default function SettingsPanel({ toast }: { toast: (text: string) => void }) {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<{ busy: boolean; result?: string; error?: string }>({ busy: false });

  const take = (s: AdminSettings) => {
    setSettings(s);
    setDraft({ cf_account_id: s.cf_account_id, cf_api_token: '', cf_model: s.cf_model, cf_fallback_model: s.cf_fallback_model });
  };

  useEffect(() => {
    adminFetch<AdminSettings>('/api/admin/settings')
      .then(take)
      .catch((e) => toast(errorText(e)));
  }, [toast]);

  if (!settings || !draft) return <p className="admin-loading">กำลังโหลด…</p>;

  const set = (key: keyof Draft, value: string) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  const save = async (extra: Partial<Draft> = {}) => {
    setBusy(true);
    try {
      const { cf_api_token, ...rest } = { ...draft, ...extra };
      // The token field is write-only: blank means "keep what's saved".
      const body = { ...rest, ...(cf_api_token || 'cf_api_token' in extra ? { cf_api_token } : {}) };
      take(await adminFetch<AdminSettings>('/api/admin/settings', { method: 'PUT', body: JSON.stringify(body) }));
      toast('บันทึกการตั้งค่าแล้ว มีผลกับข้อความถัดไป');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const runTest = async () => {
    setTest({ busy: true });
    try {
      const r = await adminFetch<{ model: string; reply: string; ms: number }>('/api/admin/settings', { method: 'POST' });
      setTest({ busy: false, result: `${r.model} ตอบใน ${(r.ms / 1000).toFixed(1)} วินาที: “${r.reply || '(ว่าง)'}”` });
    } catch (e) {
      setTest({ busy: false, error: errorText(e) });
    }
  };

  const tokenHelp =
    settings.cf_api_token_set === 'admin'
      ? 'บันทึกไว้ในหน้านี้แล้ว เว้นว่างไว้ถ้าไม่เปลี่ยน'
      : settings.cf_api_token_set === 'env'
        ? 'ใช้ค่าจาก CLOUDFLARE_API_TOKEN ใน env อยู่ ใส่ใหม่ที่นี่เพื่อใช้แทน'
        : 'ยังไม่มี token สร้างที่ dash.cloudflare.com ให้สิทธิ์ Workers AI Read + Edit';

  return (
    <section className="admin-panel">
      <div className="admin-head">
        <div>
          <h1 className="section-title">ตั้งค่า AI</h1>
          <p className="admin-summary">
            {settings.active.backend === 'ollama'
              ? `ตอนนี้ใช้ Ollama (GPU ของเครื่องเราเอง) รุ่น ${settings.active.model} เป็นหลัก ${
                  settings.active.fallback
                    ? `ถ้าล่มหรือไม่ว่างจะสลับไป Cloudflare Workers AI รุ่น ${settings.active.fallback}`
                    : 'ยังไม่มีตัวสำรอง ใส่ Account ID และ API token เพื่อใช้ Workers AI เป็นตัวสำรอง'
                }`
              : settings.active.backend === 'workers-ai'
                ? `ตอนนี้ใช้ Cloudflare Workers AI รุ่น ${settings.active.model}`
                : 'ยังไม่ได้ตั้งค่า AI ใส่ Account ID และ API token เพื่อใช้ Workers AI'}
          </p>
        </div>
      </div>

      <div className="form settings-form">
        <label className="field">
          <span className="field-label">Cloudflare Account ID</span>
          <input value={draft.cf_account_id} onChange={(e) => set('cf_account_id', e.target.value)} placeholder={settings.env.cf_account_id || 'ยังไม่ได้ตั้ง'} autoComplete="off" spellCheck={false} />
          <span className="help">{settings.env.cf_account_id && !draft.cf_account_id ? 'เว้นว่างไว้ ใช้ค่าจาก env' : 'อยู่ที่ dash.cloudflare.com > AI > Workers AI'}</span>
        </label>

        <label className="field">
          <span className="field-label">API token</span>
          <input type="password" value={draft.cf_api_token} onChange={(e) => set('cf_api_token', e.target.value)} placeholder={settings.cf_api_token_set ? '••••••••' : ''} autoComplete="off" />
          <span className="help">{tokenHelp}</span>
          {settings.cf_api_token_set === 'admin' && (
            <button type="button" className="link danger settings-clear" onClick={() => save({ cf_api_token: '' })} disabled={busy}>
              ลบ token ที่บันทึกไว้ที่นี่
            </button>
          )}
        </label>

        <label className="field">
          <span className="field-label">โมเดลหลัก</span>
          <input
            value={draft.cf_model}
            onChange={(e) => set('cf_model', e.target.value)}
            placeholder={settings.env.cf_model || settings.env.default_model}
            list="cf-models"
            spellCheck={false}
          />
          <span className="help">เว้นว่างไว้ ใช้ {settings.env.cf_model ? 'ค่าจาก env' : 'ค่าเริ่มต้น'}</span>
        </label>

        <label className="field">
          <span className="field-label">โมเดลสำรอง</span>
          <input
            value={draft.cf_fallback_model}
            onChange={(e) => set('cf_fallback_model', e.target.value)}
            placeholder={settings.env.cf_fallback_model || settings.env.default_model}
            list="cf-models"
            spellCheck={false}
          />
          <span className="help">ใช้เมื่อโมเดลหลักล่มหรือคิวเต็ม พิมพ์ none เพื่อปิด</span>
        </label>

        <datalist id="cf-models">
          {MODEL_SUGGESTIONS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>

        <div className="settings-actions">
          <button className="btn btn-primary" onClick={() => save()} disabled={busy}>
            {busy ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
          <button className="btn btn-ghost" onClick={runTest} disabled={test.busy || (settings.active.backend !== 'workers-ai' && !settings.active.fallback)}>
            {test.busy ? 'กำลังทดสอบ…' : 'ทดสอบ Workers AI'}
          </button>
        </div>
        {test.result && <p className="settings-ok">{test.result}</p>}
        {test.error && (
          <p className="form-error" role="alert">
            {test.error}
          </p>
        )}
      </div>

      <div className="admin-head">
        <div>
          <h2 className="section-title">รับชำระเงิน (Stripe)</h2>
          <p className="admin-summary">คีย์ Stripe เป็นความลับ ตั้งใน env ของเซิร์ฟเวอร์เท่านั้น แล้ว restart</p>
        </div>
      </div>
      <dl className="settings-form stripe-status">
        <div>
          <dt>STRIPE_SECRET_KEY</dt>
          <dd data-ok={!!settings.stripe.secretKey || undefined}>
            {settings.stripe.secretKey === 'live' ? 'ตั้งแล้ว (โหมดจริง)' : settings.stripe.secretKey === 'test' ? 'ตั้งแล้ว (โหมดทดสอบ)' : 'ยังไม่ได้ตั้ง ผู้ใช้จะสมัครด้วยบัตรไม่ได้'}
          </dd>
        </div>
        <div>
          <dt>STRIPE_WEBHOOK_SECRET</dt>
          <dd data-ok={settings.stripe.webhook || undefined}>{settings.stripe.webhook ? 'ตั้งแล้ว' : 'ยังไม่ได้ตั้ง จ่ายเงินแล้วแพ็กเกจจะไม่เปิดให้อัตโนมัติ'}</dd>
        </div>
        <div>
          <dt>APP_URL</dt>
          <dd data-ok={!!settings.stripe.appUrl || undefined}>{settings.stripe.appUrl || 'ยังไม่ได้ตั้ง ใช้โดเมนจากคำขอแทน'}</dd>
        </div>
        <div>
          <dt>Webhook endpoint</dt>
          <dd>
            <code>{(settings.stripe.appUrl || (typeof location !== 'undefined' ? location.origin : '')) + '/api/billing/webhook'}</code>
            <span className="help">
              ใส่ใน Stripe Dashboard &gt; Developers &gt; Webhooks เลือก event: checkout.session.completed, customer.subscription.created, customer.subscription.updated,
              customer.subscription.deleted, invoice.paid
            </span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
