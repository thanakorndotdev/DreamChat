'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowClockwise, DownloadSimple } from '@phosphor-icons/react';
import type { AdminStats, StatsDay } from '@longrak/shared/api-types';
import { INTERVAL_LABEL, formatPrice } from '@longrak/shared/plans';
import { adminFetch, errorText, formatDate } from './api';

const num = (n: number) => n.toLocaleString('th-TH');
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 1000) / 10}%` : '—');
const shortDay = (day: string) => new Date(`${day}T12:00:00+07:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

const KIND_LABEL: Record<string, string> = { subscription: 'ค่าสมาชิก (บัตร)', promptpay: 'ค่าสมาชิก (PromptPay)', tokens: 'แพ็กโทเคน', refund: 'คืนเงิน' };

/** Marketing and money at a glance, for research and planning. Aggregates only: nobody's personal data. */
export default function StatsPanel({ toast }: { toast: (text: string) => void }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    adminFetch<AdminStats>('/api/admin/stats')
      .then(setStats)
      .catch((e) => toast(errorText(e)))
      .finally(() => setBusy(false));
  }, [toast]);
  useEffect(load, [load]);

  if (!stats) return <section className="admin-panel">{busy ? <p className="admin-loading">กำลังโหลด…</p> : null}</section>;
  const { users: u, money: m, tokens: t } = stats;
  const change = m.revenuePrev30 ? Math.round(((m.revenue30 - m.revenuePrev30) / m.revenuePrev30) * 100) : null;

  return (
    <section className="admin-panel">
      <div className="admin-head">
        <div>
          <h1 className="section-title">ภาพรวม</h1>
          <p className="admin-summary">ข้อมูลรวม ไม่มีข้อมูลส่วนตัวของใคร อัปเดต {formatDate(stats.generatedAt)}</p>
        </div>
        <div className="admin-head-tools">
          <button className="btn btn-ghost" onClick={load} disabled={busy}>
            <ArrowClockwise size={18} />
            <span>รีเฟรช</span>
          </button>
          <button className="btn btn-ghost" onClick={() => downloadCsv(stats.days)}>
            <DownloadSimple size={18} />
            <span>CSV รายวัน</span>
          </button>
        </div>
      </div>

      <h2 className="stats-heading">ผู้ใช้และการตลาด</h2>
      <div className="stat-grid">
        <Stat label="ผู้ใช้ทั้งหมด" value={num(u.total)} note={`ใหม่ 7 วัน ${num(u.new7)} · 30 วัน ${num(u.new30)}`} />
        <Stat label="คนที่คุยวันนี้" value={num(u.chatters1)} note={`7 วัน ${num(u.chatters7)} · 30 วัน ${num(u.chatters30)}`} />
        <Stat label="เข้าใช้ใน 7 วัน" value={num(u.seen7)} note={`${pct(u.seen7, u.total)} ของผู้ใช้ทั้งหมด`} />
        <Stat label="ข้อความต่อคน" value={num(stats.messagesPerChatter30)} note="เฉลี่ย 30 วัน ต่อคนที่คุย" />
        <Stat label="สมาชิกที่จ่ายเงิน" value={num(m.payingMembers)} note={`${pct(m.payingMembers, u.total)} ของผู้ใช้ (conversion)`} />
        <Stat label="รับข่าวสาร" value={num(u.marketingOptIn)} note={`${pct(u.marketingOptIn, u.total)} ยินยอมให้ส่งโปรโมชัน`} />
      </div>

      <div className="chart-grid">
        <DayBars title="สมัครใหม่รายวัน" days={stats.days} pick={(d) => d.signups} format={num} />
        <DayBars title="คนที่คุยรายวัน" days={stats.days} pick={(d) => d.activeChatters} format={num} />
        <DayBars title="ข้อความรายวัน" days={stats.days} pick={(d) => d.messages} format={num} />
        <RowBars title="ช่วงอายุ" rows={u.ages.map((a) => ({ label: a.label, value: a.count }))} format={num} />
      </div>

      <div className="stats-tables">
        <div>
          <h3 className="stats-subheading">แพ็กเกจที่ใช้อยู่</h3>
          <table className="admin-table stats-table">
            <thead>
              <tr>
                <th>แพ็กเกจ</th>
                <th>ราคา</th>
                <th>จ่ายเงิน</th>
                <th>ได้ฟรี</th>
              </tr>
            </thead>
            <tbody>
              {stats.plans.map((p) => (
                <tr key={p.id}>
                  <td data-label="แพ็กเกจ">{p.name}</td>
                  <td data-label="ราคา">
                    {formatPrice(p.price)}/{INTERVAL_LABEL[p.interval]}
                  </td>
                  <td data-label="จ่ายเงิน">{num(p.paying)}</td>
                  <td data-label="ได้ฟรี" title="แอดมินให้หรือใช้โค้ด">
                    {num(p.free)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="stats-subheading">ตัวละครยอดนิยมในคลัง</h3>
          {stats.topCatalog.length === 0 ? (
            <p className="admin-loading">ยังไม่มีตัวละครที่เผยแพร่</p>
          ) : (
            <table className="admin-table stats-table">
              <thead>
                <tr>
                  <th>ตัวละคร</th>
                  <th>คนเริ่มคุย</th>
                  <th>ข้อความ</th>
                  <th>ปลดล็อก</th>
                </tr>
              </thead>
              <tbody>
                {stats.topCatalog.map((c) => (
                  <tr key={c.id}>
                    <td data-label="ตัวละคร">{c.name}</td>
                    <td data-label="คนเริ่มคุย">{num(c.chats)}</td>
                    <td data-label="ข้อความ">{num(c.messages)}</td>
                    <td data-label="ปลดล็อก">{num(c.unlocks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="admin-char-meta">
            แชททั้งหมด: สร้างตัวละครเอง {num(stats.characters.own)} · จากคลัง {num(stats.characters.fromCatalog)} · คลังเผยแพร่ {num(stats.characters.catalogPublished)} ตัว รอตรวจ{' '}
            {num(stats.characters.catalogPending)}
          </p>
        </div>
        {stats.coupons.length > 0 && (
          <div>
            <h3 className="stats-subheading">โค้ดที่ถูกใช้มากที่สุด</h3>
            <table className="admin-table stats-table">
              <thead>
                <tr>
                  <th>โค้ด</th>
                  <th>ใช้แล้ว</th>
                </tr>
              </thead>
              <tbody>
                {stats.coupons.map((c) => (
                  <tr key={c.code}>
                    <td data-label="โค้ด">{c.code}</td>
                    <td data-label="ใช้แล้ว">{num(c.redemptions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2 className="stats-heading">การเงิน</h2>
      <div className="stat-grid">
        <Stat
          label="รายรับ 30 วัน"
          value={formatPrice(m.revenue30)}
          note={change === null ? 'ยังไม่มีรายรับ 30 วันก่อนหน้าให้เทียบ' : `${change >= 0 ? '+' : ''}${change}% จาก 30 วันก่อนหน้า`}
        />
        <Stat label="รายได้ประจำต่อเดือน (MRR)" value={formatPrice(m.mrr)} note="สมาชิกบัตรที่ยังต่ออายุอัตโนมัติ" />
        <Stat label="รายรับทั้งหมด" value={formatPrice(m.revenueAll)} note={m.refundsAll ? `หักคืนเงินแล้ว ${formatPrice(m.refundsAll)}` : 'สุทธิหลังคืนเงิน'} />
        <Stat label="PromptPay รอจ่าย" value={num(m.pendingPromptPay)} note="QR ที่สร้างใน 24 ชั่วโมงและยังไม่จ่าย" />
      </div>
      <div className="chart-grid">
        <DayBars title="รายรับรายวัน" days={stats.days} pick={(d) => d.revenue} format={formatPrice} />
        <div className="chart">
          <h3 className="chart-title">รายรับ 30 วัน แยกตามช่องทาง</h3>
          {m.byKind30.length === 0 ? (
            <p className="admin-char-meta">ยังไม่มีรายรับใน 30 วันนี้</p>
          ) : (
            <table className="admin-table stats-table">
              <tbody>
                {m.byKind30.map((k) => (
                  <tr key={k.kind}>
                    <td data-label="ช่องทาง">{KIND_LABEL[k.kind] ?? k.kind}</td>
                    <td data-label="รายการ">{num(k.count)} รายการ</td>
                    <td data-label="ยอด">{formatPrice(k.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <h3 className="stats-subheading">โทเคน 30 วัน</h3>
      <div className="stat-grid">
        <Stat label="ซื้อ" value={num(t.bought30)} note="โทเคนจากแพ็กที่จ่ายเงิน" />
        <Stat label="เช็คอิน" value={num(t.checkin30)} note="แจกฟรีให้สมาชิก" />
        <Stat label="ใช้ส่งข้อความ" value={num(t.spentMessages30)} note="หลังหักคืนตอน AI ตอบไม่สำเร็จ" />
        <Stat label="ใช้ปลดล็อก" value={num(t.spentUnlocks30)} note="ปลดล็อกคุยไม่จำกัดกับตัวละคร" />
        <Stat label="คงเหลือในระบบ" value={num(t.outstanding)} note={`แอดมินปรับ 30 วัน ${t.admin30 >= 0 ? '+' : ''}${num(t.admin30)}`} />
      </div>
      <p className="admin-char-meta stats-footnote">
        ยอดเงินบันทึกจากการชำระที่สำเร็จ เริ่มนับค่าสมาชิกผ่านบัตรและแพ็กโทเคนตั้งแต่ 3 ต.ค. 2569 ส่วน PromptPay นับย้อนหลังทั้งหมด ตัวเลขทางบัญชีให้ยึดตาม Stripe
      </p>
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-note">{note}</span>
    </div>
  );
}

/** One measure over the last 30 days. A single series, so no legend: the title names it. */
function DayBars({ title, days, pick, format }: { title: string; days: StatsDay[]; pick: (d: StatsDay) => number; format: (n: number) => string }) {
  const values = days.map(pick);
  const max = Math.max(...values, 0);
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <figure className="chart">
      <figcaption className="chart-title">
        {title} <span className="chart-total">รวม 30 วัน {format(total)}</span>
      </figcaption>
      <div className="day-bars" role="img" aria-label={`${title} 30 วันล่าสุด รวม ${format(total)}`}>
        {days.map((d, i) => (
          <span key={d.day} className="day-bar" tabIndex={0} data-tip={`${shortDay(d.day)}: ${format(values[i])}`} aria-label={`${shortDay(d.day)} ${format(values[i])}`}>
            <i style={{ height: max ? `${Math.max((values[i] / max) * 100, values[i] ? 3 : 0)}%` : 0 }} />
          </span>
        ))}
      </div>
      <div className="day-axis" aria-hidden="true">
        <span>{shortDay(days[0].day)}</span>
        <span>{shortDay(days[days.length - 1].day)}</span>
      </div>
    </figure>
  );
}

/** A handful of categories, each a labeled horizontal bar with its number beside it. */
function RowBars({ title, rows, format }: { title: string; rows: { label: string; value: number }[]; format: (n: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  return (
    <figure className="chart">
      <figcaption className="chart-title">{title}</figcaption>
      <ul className="row-bars">
        {rows.map((r) => (
          <li key={r.label}>
            <span className="row-label">{r.label}</span>
            <span className="row-track">
              <i style={{ width: max ? `${(r.value / max) * 100}%` : 0 }} />
            </span>
            <span className="row-value">{format(r.value)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** The daily figures as a spreadsheet, for research outside the console. */
function downloadCsv(days: StatsDay[]) {
  const lines = ['date,signups,active_chatters,messages,revenue_thb', ...days.map((d) => `${d.day},${d.signups},${d.activeChatters},${d.messages},${(d.revenue / 100).toFixed(2)}`)];
  const url = URL.createObjectURL(new Blob([`﻿${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `longrakchat-stats-${days[days.length - 1].day}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
