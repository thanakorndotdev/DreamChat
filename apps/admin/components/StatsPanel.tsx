'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowClockwise, DownloadSimple } from '@phosphor-icons/react';
import type { AdminStats, StatsDay, StatsMonth } from '@longrak/shared/api-types';
import { INTERVAL_LABEL, formatPrice } from '@longrak/shared/plans';
import { adminFetch, errorText, formatDate } from './api';

const num = (n: number) => n.toLocaleString('th-TH');
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 1000) / 10}%` : '—');
const shortDay = (day: string) => new Date(`${day}T12:00:00+07:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

const rate = (part: number | null, whole: number) => (part === null ? '—' : pct(part, whole));
const monthLabel = (month: string) => new Date(`${month}-15T12:00:00+07:00`).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
const avgDaily = (days: StatsDay[]) => Math.round(days.reduce((sum, d) => sum + d.activeChatters, 0) / (days.length || 1));

type View = 'summary' | 'marketing' | 'money';
const VIEWS: { id: View; label: string }[] = [
  { id: 'summary', label: 'สรุป' },
  { id: 'marketing', label: 'การตลาด' },
  { id: 'money', label: 'การเงิน' },
];

const KIND_LABEL: Record<string, string> = { subscription: 'ค่าสมาชิก (บัตร)', promptpay: 'ค่าสมาชิก (PromptPay)', tokens: 'แพ็กโทเคน', refund: 'คืนเงิน' };

/** Marketing and money at a glance, for research and planning. Aggregates only: nobody's personal data. */
export default function StatsPanel({ toast }: { toast: (text: string) => void }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>('summary');

  const load = useCallback(() => {
    setBusy(true);
    adminFetch<AdminStats>('/api/admin/stats')
      .then(setStats)
      .catch((e) => toast(errorText(e)))
      .finally(() => setBusy(false));
  }, [toast]);
  useEffect(load, [load]);

  if (!stats) return <section className="admin-panel">{busy ? <p className="admin-loading">กำลังโหลด…</p> : null}</section>;

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
          <button className="btn btn-ghost" onClick={() => downloadDaysCsv(stats.days)}>
            <DownloadSimple size={18} />
            <span>CSV รายวัน</span>
          </button>
          <button className="btn btn-ghost" onClick={() => downloadMonthsCsv(stats.months)}>
            <DownloadSimple size={18} />
            <span>CSV รายเดือน</span>
          </button>
        </div>
      </div>

      <div className="tabs stats-views" role="tablist" aria-label="มุมมองภาพรวม">
        {VIEWS.map((v) => (
          <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </div>

      {view === 'summary' && <Summary stats={stats} />}
      {view === 'marketing' && <Marketing stats={stats} />}
      {view === 'money' && <Money stats={stats} />}
    </section>
  );
}

/** The few numbers to look at first, and what they suggest. */
function Summary({ stats }: { stats: AdminStats }) {
  const { users: u, money: m } = stats;
  const k = keyFigures(stats);
  return (
    <>
      <div className="stat-grid">
        <Stat label="รายรับ 30 วัน" value={formatPrice(m.revenue30)} note={k.changeNote} />
        <Stat label="MRR / ARR" value={formatPrice(m.mrr)} note={`ต่อปีประมาณ ${formatPrice(m.mrr * 12)}`} />
        <Stat label="สมาชิกที่จ่ายเงิน" value={num(m.payingMembers)} note={`${pct(m.payingMembers, u.total)} ของผู้ใช้ (conversion)`} />
        <Stat label="คนที่คุยใน 30 วัน" value={num(u.chatters30)} note={`วันนี้ ${num(u.chatters1)} · 7 วัน ${num(u.chatters7)}`} />
        <Stat label="สมัครใหม่ 30 วัน" value={num(u.new30)} note={`7 วัน ${num(u.new7)}`} />
        <Stat label="รายได้ต่อคนที่คุย (ARPU)" value={formatPrice(k.arpu)} note="รายรับ 30 วัน ÷ คนที่คุย 30 วัน" />
      </div>

      <div className="stats-insights">
        <h2 className="stats-subheading">ข้อสังเกตจากตัวเลข</h2>
        <ul>
          {insights(stats).map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </div>

      <div className="chart-grid">
        <DayBars title="รายรับรายวัน" days={stats.days} pick={(d) => d.revenue} format={formatPrice} />
        <DayBars title="คนที่คุยรายวัน" days={stats.days} pick={(d) => d.activeChatters} format={num} />
      </div>
    </>
  );
}

function Marketing({ stats }: { stats: AdminStats }) {
  const { users: u, funnel: f } = stats;
  const steps = [
    { label: 'สมัคร', value: f.signedUp },
    { label: 'ยินยอม PDPA', value: f.consented },
    { label: 'เริ่มคุย', value: f.chatted },
    { label: 'กลับมาคุยซ้ำ', value: f.returned },
    { label: 'จ่ายเงิน', value: f.paid },
  ];
  const weeks = 13;
  return (
    <>
      <div className="stat-grid">
        <Stat label="ผู้ใช้ทั้งหมด" value={num(u.total)} note={`ใหม่ 7 วัน ${num(u.new7)} · 30 วัน ${num(u.new30)}`} />
        <Stat label="คนที่คุยวันนี้" value={num(u.chatters1)} note={`7 วัน ${num(u.chatters7)} · 30 วัน ${num(u.chatters30)}`} />
        <Stat label="เข้าใช้ใน 7 วัน" value={num(u.seen7)} note={`${pct(u.seen7, u.total)} ของผู้ใช้ทั้งหมด`} />
        <Stat label="ความถี่ (DAU/MAU)" value={pct(avgDaily(stats.days), u.chatters30)} note="คนคุยเฉลี่ยต่อวัน ÷ คนคุยใน 30 วัน" />
        <Stat label="ข้อความต่อคน" value={num(stats.messagesPerChatter30)} note="เฉลี่ย 30 วัน ต่อคนที่คุย" />
        <Stat label="รับข่าวสาร" value={num(u.marketingOptIn)} note={`${pct(u.marketingOptIn, u.total)} ยินยอมให้ส่งโปรโมชัน`} />
      </div>

      <div className="chart-grid">
        <figure className="chart">
          <figcaption className="chart-title">
            เส้นทางผู้ใช้ใหม่ <span className="chart-total">คนที่สมัครใน 30 วัน</span>
          </figcaption>
          <ul className="row-bars funnel-bars">
            {steps.map((st) => (
              <li key={st.label}>
                <span className="row-label">{st.label}</span>
                <span className="row-track">
                  <i style={{ width: f.signedUp ? `${(st.value / f.signedUp) * 100}%` : 0 }} />
                </span>
                <span className="row-value">
                  {num(st.value)} <small>{pct(st.value, f.signedUp)}</small>
                </span>
              </li>
            ))}
          </ul>
        </figure>
        <RowBars title="ช่วงอายุ" rows={u.ages.map((a) => ({ label: a.label, value: a.count }))} format={num} />
        <DayBars title="สมัครใหม่รายวัน" days={stats.days} pick={(d) => d.signups} format={num} />
        <DayBars title="ข้อความรายวัน" days={stats.days} pick={(d) => d.messages} format={num} />
        <RowBars title={`ข้อความเฉลี่ยต่อวัน ตามวันในสัปดาห์ (${weeks} สัปดาห์)`} rows={stats.weekdays.map((w) => ({ label: w.label, value: Math.round(w.messages / weeks) }))} format={num} />
        <RowBars title={`สมัครใหม่ ตามวันในสัปดาห์ (${weeks} สัปดาห์)`} rows={stats.weekdays.map((w) => ({ label: w.label, value: w.signups }))} format={num} />
      </div>

      <div className="stats-tables">
        <div>
          <h3 className="stats-subheading">การกลับมาคุย แยกตามสัปดาห์ที่สมัคร</h3>
          {stats.cohorts.length === 0 ? (
            <p className="admin-loading">ยังไม่มีผู้สมัครใน 8 สัปดาห์นี้</p>
          ) : (
            <div className="stats-scroll">
              <table className="admin-table stats-table">
                <thead>
                  <tr>
                    <th>สัปดาห์ที่สมัคร</th>
                    <th>คน</th>
                    <th title="คุยอีกครั้งในวันถัดไป">วันถัดไป</th>
                    <th title="คุยอีกครั้งในวันที่ 7–13">สัปดาห์ที่ 2</th>
                    <th title="คุยอีกครั้งในวันที่ 28–34">เดือนถัดไป</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.cohorts.map((c) => (
                    <tr key={c.week}>
                      <td data-label="สัปดาห์ที่สมัคร">{shortDay(c.week)}</td>
                      <td data-label="คน">{num(c.size)}</td>
                      <td data-label="วันถัดไป">{rate(c.d1, c.size)}</td>
                      <td data-label="สัปดาห์ที่ 2">{rate(c.d7, c.size)}</td>
                      <td data-label="เดือนถัดไป">{rate(c.d30, c.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="admin-char-meta">เปอร์เซ็นต์คนที่กลับมาคุยอีก ช่องว่าง (—) คือยังไม่ครบเวลาให้วัด</p>
        </div>
        <div>
          <h3 className="stats-subheading">ตัวละครยอดนิยมในคลัง</h3>
          {stats.topCatalog.length === 0 ? (
            <p className="admin-loading">ยังไม่มีตัวละครที่เผยแพร่</p>
          ) : (
            <div className="stats-scroll">
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
            </div>
          )}
          <p className="admin-char-meta">
            แชททั้งหมด: สร้างตัวละครเอง {num(stats.characters.own)} · จากคลัง {num(stats.characters.fromCatalog)} · คลังเผยแพร่ {num(stats.characters.catalogPublished)} ตัว รอตรวจ{' '}
            {num(stats.characters.catalogPending)}
          </p>
        </div>
        <div>
          <h3 className="stats-subheading">โค้ดส่วนลด</h3>
          {stats.coupons.length === 0 ? (
            <p className="admin-loading">ยังไม่มีคนใช้โค้ด</p>
          ) : (
            <div className="stats-scroll">
              <table className="admin-table stats-table">
                <thead>
                  <tr>
                    <th>โค้ด</th>
                    <th>ใช้แล้ว</th>
                    <th title="ใช้โค้ดแล้วจ่ายเงินภายหลัง">จ่ายเงินต่อ</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.coupons.map((c) => (
                    <tr key={c.code}>
                      <td data-label="โค้ด">{c.code}</td>
                      <td data-label="ใช้แล้ว">{num(c.redemptions)}</td>
                      <td data-label="จ่ายเงินต่อ">
                        {num(c.paid)} ({pct(c.paid, c.redemptions)})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Money({ stats }: { stats: AdminStats }) {
  const { users: u, money: m, tokens: t } = stats;
  const k = keyFigures(stats);
  return (
    <>
      <div className="stat-grid">
        <Stat label="รายรับ 30 วัน" value={formatPrice(m.revenue30)} note={k.changeNote} />
        <Stat label="รายได้ประจำต่อเดือน (MRR)" value={formatPrice(m.mrr)} note={`สมาชิกบัตรที่ต่ออายุอัตโนมัติ · ต่อปี ${formatPrice(m.mrr * 12)}`} />
        <Stat label="รายรับทั้งหมด" value={formatPrice(m.revenueAll)} note={m.refundsAll ? `หักคืนเงินแล้ว ${formatPrice(m.refundsAll)}` : 'สุทธิหลังคืนเงิน'} />
        <Stat label="PromptPay รอจ่าย" value={num(m.pendingPromptPay)} note="QR ที่สร้างใน 24 ชั่วโมงและยังไม่จ่าย" />
      </div>

      <h3 className="stats-subheading">ต่อหัวและการรักษาลูกค้า (30 วัน)</h3>
      <div className="stat-grid">
        <Stat label="รายได้ต่อคนที่คุย (ARPU)" value={formatPrice(k.arpu)} note={`รายรับ ÷ คนที่คุย ${num(u.chatters30)} คน`} />
        <Stat label="รายได้ต่อคนที่จ่าย (ARPPU)" value={formatPrice(k.arppu)} note={`รายรับ ÷ คนที่จ่าย ${num(m.payers30)} คน`} />
        <Stat label="ลูกค้าจ่ายครั้งแรก" value={num(m.newPayers30)} note="คนที่เพิ่งจ่ายเงินเป็นครั้งแรก" />
        <Stat label="อัตราเลิกเป็นสมาชิก (churn)" value={pct(m.lapsed30, m.payingMembers + m.lapsed30)} note={`หมดอายุไม่ต่อ ${num(m.lapsed30)} · กำลังจะไม่ต่อ ${num(m.cancelling)}`} />
        <Stat label="อัตราคืนเงิน" value={pct(k.refunds30, k.gross30)} note={`คืน ${formatPrice(k.refunds30)} จากยอดรับ ${formatPrice(k.gross30)}`} />
      </div>

      <div className="chart-grid">
        <DayBars title="รายรับรายวัน" days={stats.days} pick={(d) => d.revenue} format={formatPrice} />
        <div className="chart">
          <h3 className="chart-title">รายรับ 30 วัน แยกตามช่องทาง</h3>
          {m.byKind30.length === 0 ? (
            <p className="admin-char-meta">ยังไม่มีรายรับใน 30 วันนี้</p>
          ) : (
            <div className="stats-scroll">
              <table className="admin-table stats-table">
                <tbody>
                  {m.byKind30.map((row) => (
                    <tr key={row.kind}>
                      <td data-label="ช่องทาง">{KIND_LABEL[row.kind] ?? row.kind}</td>
                      <td data-label="รายการ">{num(row.count)} รายการ</td>
                      <td data-label="ยอด">{formatPrice(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <MonthBars months={stats.months} />
      </div>

      <h3 className="stats-subheading">รายเดือน (12 เดือน)</h3>
      <div className="stats-scroll">
        <table className="admin-table stats-table stats-months">
          <thead>
            <tr>
              <th>เดือน</th>
              <th>ค่าสมาชิก</th>
              <th>แพ็กโทเคน</th>
              <th>คืนเงิน</th>
              <th>สุทธิ</th>
              <th>คนจ่าย</th>
              <th>จ่ายครั้งแรก</th>
              <th>สมัครใหม่</th>
            </tr>
          </thead>
          <tbody>
            {[...stats.months].reverse().map((r) => (
              <tr key={r.month}>
                <td data-label="เดือน" className="admin-name">
                  {monthLabel(r.month)}
                </td>
                <td data-label="ค่าสมาชิก">{formatPrice(r.membership)}</td>
                <td data-label="แพ็กโทเคน">{formatPrice(r.tokens)}</td>
                <td data-label="คืนเงิน">{r.refunds ? `−${formatPrice(r.refunds)}` : '—'}</td>
                <td data-label="สุทธิ">
                  <strong>{formatPrice(r.net)}</strong>
                </td>
                <td data-label="คนจ่าย">{num(r.payers)}</td>
                <td data-label="จ่ายครั้งแรก">{num(r.newPayers)}</td>
                <td data-label="สมัครใหม่">{num(r.signups)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="stats-tables">
        <div>
          <h3 className="stats-subheading">แพ็กเกจที่ใช้อยู่</h3>
          <div className="stats-scroll">
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
    </>
  );
}

/** Ratios several views share. Money in satang. */
function keyFigures(stats: AdminStats) {
  const { users: u, money: m } = stats;
  const change = m.revenuePrev30 ? Math.round(((m.revenue30 - m.revenuePrev30) / m.revenuePrev30) * 100) : null;
  const refunds30 = -(m.byKind30.find((row) => row.kind === 'refund')?.amount ?? 0);
  return {
    change,
    changeNote: change === null ? 'ยังไม่มีรายรับ 30 วันก่อนหน้าให้เทียบ' : `${change >= 0 ? '+' : ''}${change}% จาก 30 วันก่อนหน้า`,
    arpu: u.chatters30 ? Math.round(m.revenue30 / u.chatters30) : 0,
    arppu: m.payers30 ? Math.round(m.revenue30 / m.payers30) : 0,
    refunds30,
    gross30: m.revenue30 + refunds30,
  };
}

/** Plain-language observations, so the overview reads without a spreadsheet. */
function insights(stats: AdminStats): string[] {
  const { users: u, money: m, funnel: f } = stats;
  const k = keyFigures(stats);
  const out: string[] = [];
  if (k.change !== null)
    out.push(`รายรับ 30 วัน${k.change >= 0 ? 'เพิ่มขึ้น' : 'ลดลง'} ${Math.abs(k.change)}% เทียบกับ 30 วันก่อนหน้า (${formatPrice(m.revenuePrev30)} → ${formatPrice(m.revenue30)})`);
  if (f.signedUp) {
    const steps: [string, number, number][] = [
      ['ยินยอม PDPA', f.signedUp, f.consented],
      ['เริ่มคุยครั้งแรก', f.consented, f.chatted],
      ['กลับมาคุยซ้ำ', f.chatted, f.returned],
      ['จ่ายเงิน', f.returned, f.paid],
    ];
    const [label, from, to] = steps.reduce((worst, s) => (s[1] && s[2] / s[1] < (worst[1] ? worst[2] / worst[1] : 1) ? s : worst));
    out.push(`ผู้สมัครใหม่ 30 วันจ่ายเงินแล้ว ${pct(f.paid, f.signedUp)} จุดที่คนหลุดมากที่สุดคือขั้น “${label}” (ไปต่อเพียง ${pct(to, from)})`);
  }
  const busiest = [...stats.weekdays].sort((a, b) => b.messages - a.messages)[0];
  const quietest = [...stats.weekdays].sort((a, b) => a.messages - b.messages)[0];
  if (busiest?.messages) out.push(`วัน${busiest.label}มีคนคุยมากที่สุด วัน${quietest.label}เงียบที่สุด เหมาะกับการปล่อยโปรโมชันหรือตัวละครใหม่ก่อนวันที่คนเข้าเยอะ`);
  const mature = [...stats.cohorts].reverse().find((c) => c.d7 !== null && c.size > 0);
  if (mature) out.push(`ผู้สมัครสัปดาห์ ${shortDay(mature.week)} กลับมาคุยในสัปดาห์ที่ 2 ${rate(mature.d7, mature.size)}`);
  const top = stats.topCatalog[0];
  if (top?.messages) out.push(`ตัวละครที่คนคุยมากที่สุดคือ ${top.name} (${num(top.messages)} ข้อความ) ใช้เป็นหน้าตาของโฆษณาได้`);
  const coupon = [...stats.coupons].filter((c) => c.redemptions >= 5).sort((a, b) => b.paid / b.redemptions - a.paid / a.redemptions)[0];
  if (coupon) out.push(`โค้ด ${coupon.code} พาคนจ่ายเงินต่อได้ดีที่สุด ${pct(coupon.paid, coupon.redemptions)} ของคนที่ใช้`);
  if (m.payingMembers + m.lapsed30)
    out.push(`สมาชิกหมดอายุโดยไม่ต่อ ${num(m.lapsed30)} คนใน 30 วัน (churn ${pct(m.lapsed30, m.payingMembers + m.lapsed30)}) และอีก ${num(m.cancelling)} คนตั้งไม่ต่ออายุ`);
  if (u.total) out.push(`ส่งโปรโมชันได้ ${num(u.marketingOptIn)} คน (${pct(u.marketingOptIn, u.total)} ของผู้ใช้) ส่งเฉพาะคนที่ยินยอมเท่านั้นตาม PDPA`);
  return out.length ? out : ['ยังมีข้อมูลไม่พอให้สรุป'];
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

/** Net money per month for the last 12 months; one series, so no legend. */
function MonthBars({ months }: { months: StatsMonth[] }) {
  const max = Math.max(...months.map((r) => r.net), 0);
  const total = months.reduce((sum, r) => sum + r.net, 0);
  return (
    <figure className="chart">
      <figcaption className="chart-title">
        รายรับสุทธิรายเดือน <span className="chart-total">รวม 12 เดือน {formatPrice(total)}</span>
      </figcaption>
      <div className="day-bars month-bars" role="img" aria-label={`รายรับสุทธิ 12 เดือนล่าสุด รวม ${formatPrice(total)}`}>
        {months.map((r) => (
          <span key={r.month} className="day-bar" tabIndex={0} data-tip={`${monthLabel(r.month)}: ${formatPrice(r.net)}`} aria-label={`${monthLabel(r.month)} ${formatPrice(r.net)}`}>
            <i style={{ height: max > 0 ? `${Math.max((Math.max(r.net, 0) / max) * 100, r.net > 0 ? 3 : 0)}%` : 0 }} />
          </span>
        ))}
      </div>
      <div className="day-axis" aria-hidden="true">
        <span>{monthLabel(months[0].month)}</span>
        <span>{monthLabel(months[months.length - 1].month)}</span>
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
function downloadDaysCsv(days: StatsDay[]) {
  const lines = ['date,signups,active_chatters,messages,revenue_thb', ...days.map((d) => `${d.day},${d.signups},${d.activeChatters},${d.messages},${baht(d.revenue)}`)];
  saveCsv(`longrakchat-stats-${days[days.length - 1].day}.csv`, lines);
}

/** Twelve months of money and growth, for the books and planning. */
function downloadMonthsCsv(months: StatsMonth[]) {
  const lines = [
    'month,membership_thb,tokens_thb,refunds_thb,net_thb,payers,new_payers,signups',
    ...months.map((r) => `${r.month},${baht(r.membership)},${baht(r.tokens)},${baht(r.refunds)},${baht(r.net)},${r.payers},${r.newPayers},${r.signups}`),
  ];
  saveCsv(`longrakchat-monthly-${months[months.length - 1].month}.csv`, lines);
}

const baht = (satang: number) => (satang / 100).toFixed(2);

function saveCsv(name: string, lines: string[]) {
  const url = URL.createObjectURL(new Blob([`\uFEFF${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
