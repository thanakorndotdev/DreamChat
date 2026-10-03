'use client';

import Link from 'next/link';
import { ArrowDown, ArrowRight, BookOpen, ChatCircleDots, Check, Crown, Heart, LockSimple, MagicWand, Plus, Sparkle, UserCircle } from '@phosphor-icons/react';
import Copyright from '@longrak/shared/components/Copyright';
import { formatPrice, INTERVAL_LABEL, TIER_LABEL, type Plan } from '@longrak/shared/plans';
import type { CatalogEntry } from '@longrak/shared/catalog';
import styles from './LandingPage.module.css';

const features = [
  { icon: ChatCircleDots, number: '01', title: 'จากคนอ่าน เป็นคนในเรื่อง', text: 'เลือกตัวละครที่ถูกใจ แล้วพิมพ์สิ่งที่อยากพูด ทุกคำตอบของคุณช่วยพาเรื่องราวไปในทิศทางใหม่' },
  { icon: MagicWand, number: '02', title: 'คนในจินตนาการ ในแบบของคุณ', text: 'ออกแบบชื่อ บุคลิก บทบาท และฉากเปิดเรื่อง จะเป็นรักในรั้วมหาวิทยาลัย หรือการพบกันในโลกแฟนตาซีก็ได้' },
  { icon: BookOpen, number: '03', title: 'กลับมาเมื่อไหร่ ก็อ่านต่อได้', text: 'เก็บบทสนทนาไว้ในบัญชีของคุณ พร้อมบันทึกเรื่องราวที่ช่วยให้ AI นึกถึงสิ่งที่เคยคุยกัน ตามขอบเขตแพ็กเกจ' },
];

const questions = [
  { q: 'หลงรักแชทคืออะไร?', a: 'พื้นที่สำหรับคุยและเขียนเรื่องราวร่วมกับตัวละคร AI คุณเลือกได้ทั้งตัวละครในคลัง หรือสร้างตัวละครของตัวเอง บทสนทนาและเหตุการณ์เป็นเรื่องสมมติเพื่อความบันเทิง' },
  { q: 'เริ่มใช้งานฟรีได้ไหม?', a: 'ได้เลย เริ่มจากการดูตัวละครในคลังได้โดยไม่ต้องเข้าสู่ระบบ เมื่อพร้อมคุยให้สมัครบัญชีและเลือกใช้แพ็กเกจ Free ดูจำนวนข้อความและขอบเขตการใช้งานปัจจุบันได้ด้านล่าง' },
  { q: 'แชทของฉันจะมีคนอื่นเห็นไหม?', a: 'แชทส่วนตัวผูกกับบัญชีของคุณและไม่แสดงในคลังสาธารณะ หากส่งตัวละครให้ทีมงานพิจารณาเผยแพร่ จะส่งเฉพาะข้อมูลตัวละคร ไม่รวมประวัติแชท อ่านรายละเอียดการจัดเก็บและประมวลผลข้อมูลได้ในนโยบายความเป็นส่วนตัว' },
  { q: 'ถ้ามีบัญชีอยู่แล้ว กลับไปอ่านแชทเดิมอย่างไร?', a: 'กด “เข้าสู่ระบบ” หรือ “ไปหน้าแชท” แล้วใช้บัญชีเดิม เรื่องราวและบทสนทนาของคุณจะอยู่ในคลังส่วนตัว อาจมีขั้นตอนให้ยืนยันข้อมูลบัญชีและความยินยอมก่อนใช้งาน' },
  { q: 'เลือกแพ็กเกจและใช้โค้ดได้ที่ไหน?', a: 'เลือกแพ็กเกจด้านล่างเพื่อไปหน้าสมาชิก เข้าสู่ระบบแล้วตรวจรายละเอียดก่อนสมัคร หรือกรอกโค้ดที่ได้รับในช่องใช้โค้ด การชำระเงินออนไลน์จะแสดงให้ใช้งานเมื่อเปิดให้บริการ' },
];

function planDetails(plan: Plan) {
  const { dailyMessages, freePerCharacter, checkinTokens, maxCharacters, historyWindow, memoryNotes } = plan.features;
  return [
    dailyMessages ? `คุยฟรี ${dailyMessages.toLocaleString('th-TH')} ข้อความต่อวัน` : 'ไม่จำกัดจำนวนข้อความต่อวัน',
    ...(freePerCharacter ? [`ฟรี ${freePerCharacter} ข้อความต่อตัวละคร จากนั้นใช้โทเคน`] : []),
    ...(checkinTokens ? [`เช็คอินรับ ${checkinTokens.toLocaleString('th-TH')} โทเคนทุกวัน`] : []),
    maxCharacters ? `เก็บเรื่องราวได้ ${maxCharacters} เรื่อง` : 'เก็บเรื่องราวได้ไม่จำกัด',
    `จำบทสนทนาล่าสุด ${historyWindow} ข้อความ`,
    memoryNotes ? `บันทึกความทรงจำ ${memoryNotes} บันทึก` : 'ความจำจากบทสนทนาล่าสุด',
  ];
}

/** "ไอริส (Iris)" → "ไอริส", for buttons. */
const shortName = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '') || name;

/** The opening line as a preview: *actions* in italics, cut to a couple of lines. */
function Greeting({ text }: { text: string }) {
  const clipped = text.length > 120 ? `${text.slice(0, 118).trimEnd()}…` : text;
  return <>{clipped.split(/(\*[^*]+\*?)/g).filter(Boolean).map((part, i) => part.startsWith('*') ? <em key={i}>{part.replace(/\*/g, '')}</em> : <span key={i}>{part}</span>)}</>;
}

type Props = {
  plans: Plan[] | null;
  payments: boolean;
  username: string | null;
  /** Published characters to feature, as the visitor's plan sees them (a locked one has no opening line). */
  characters: Omit<CatalogEntry, 'reviewNote' | 'sourceId'>[];
};

export default function LandingPage({ plans, payments, username, characters }: Props) {
  const available = plans?.filter((plan) => plan.active).sort((a, b) => a.level - b.level || a.price - b.price);
  const free = available?.find((plan) => plan.price === 0);

  return (
    <div className={styles.landing}>
      <a className={styles.skipLink} href="#main">ข้ามไปเนื้อหา</a>
      <header className={styles.header}>
        <div className={styles.navbar}>
          <Link className={styles.brand} href="/" aria-label="หลงรักแชท หน้าแรก">
            <span className={styles.brandIcon}><Heart size={21} weight="fill" aria-hidden /></span>
            หลงรักแชท<span className={styles.brandDot}>.</span>
          </Link>
          <nav className={styles.navLinks} aria-label="เมนูหลัก">
            {characters.length > 0 && <a href="#characters">ตัวละคร</a>}<a href="#about">ทำความรู้จัก</a><a href="#how-it-works">วิธีเริ่มต้น</a><a href="#pricing">แพ็กเกจ</a>
          </nav>
          {username
            ? <Link className={styles.navCta} href="/chat" title="ไปหน้าแชท"><UserCircle size={19} aria-hidden /><span className={styles.navUser}>{username}</span><ArrowRight size={17} aria-hidden /></Link>
            : <Link className={styles.navCta} href="/chat?login=1">เข้าสู่ระบบ <ArrowRight size={17} aria-hidden /></Link>}
        </div>
      </header>

      <main id="main">
        {characters.length > 0 && (
          <section id="characters" className={`${styles.section} ${styles.characters} ${styles.container}`} aria-labelledby="characters-title">
            <div className={styles.sectionHeading}><p className={styles.eyebrow}><Sparkle size={15} weight="fill" aria-hidden /> ตัวละครที่รอคุณอยู่</p><h2 id="characters-title">วันนี้ อยากทักใครก่อนดี?</h2><p>แต่ละคนมีนิสัย เรื่องราว และประโยคแรกที่รอส่งถึงคุณ<br />เลือกคนที่ใจเต้นแรงที่สุด แล้วตอบกลับไปได้เลย</p></div>
            <ul className={styles.characterRow}>
              {characters.map((e) => {
                const name = shortName(e.sheet.name);
                return (
                  <li className={styles.characterCard} key={e.id}>
                    <Link className={styles.characterPhoto} href={`/chat?start=${encodeURIComponent(e.id)}`} tabIndex={-1} aria-hidden>
                      {e.sheet.avatar ? <img src={e.sheet.avatar} alt="" loading="lazy" /> : <span className={styles.characterNoPhoto}><Heart size={40} weight="fill" /></span>}
                      {e.tier > 0 && <span className={styles.characterTier}><Crown size={12} weight="fill" /> {TIER_LABEL[e.tier]}</span>}
                      <span className={styles.characterOnline}>พร้อมคุย</span>
                    </Link>
                    <div className={styles.characterBody}>
                      <h3>{e.sheet.name}</h3>
                      <p className={styles.characterRole}>{e.sheet.role}</p>
                      <p className={styles.characterMeta}>{[e.sheet.gender, e.sheet.age, e.sheet.job].filter(Boolean).join(' · ')}</p>
                      {e.sheet.firstMessage
                        ? <p className={styles.characterGreeting}><Greeting text={e.sheet.firstMessage} /></p>
                        : <p className={styles.characterGreeting}><em>ประโยคแรกของ{name} รอคุณอยู่ในแพ็กเกจ {TIER_LABEL[e.tier]}</em></p>}
                      <Link className={styles.characterCta} href={`/chat?start=${encodeURIComponent(e.id)}`}>
                        <ChatCircleDots size={18} aria-hidden /> คุยกับ{name}<ArrowRight size={16} aria-hidden />
                      </Link>
                    </div>
                  </li>
                );
              })}
              <li className={`${styles.characterCard} ${styles.characterCreate}`}>
                <span className={styles.featureIcon}><MagicWand size={28} weight="duotone" aria-hidden /></span>
                <h3>ยังไม่เจอคนที่ใช่?</h3>
                <p>ออกแบบตัวละครของคุณเอง ทั้งหน้าตา นิสัย และฉากที่ได้พบกัน</p>
                <Link className={styles.outlineButton} href="/chat?create=1">สร้างตัวละคร <ArrowRight size={17} aria-hidden /></Link>
              </li>
            </ul>
            <p className={styles.characterMore}><Link className={styles.textButton} href="/chat">ดูตัวละครทั้งหมดในคลัง <ArrowRight size={17} aria-hidden /></Link></p>
          </section>
        )}

        <section className={`${styles.hero} ${styles.container}`} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}><span className={styles.smallLine} /> พื้นที่เล็ก ๆ สำหรับเรื่องราวของคุณ</p>
            <h1 id="hero-title">บางเรื่องรัก<br />เริ่มต้นด้วยคำว่า<br /><span className={styles.hello}>“สวัสดี”<Sparkle className={styles.helloStar} size={35} weight="fill" aria-hidden /></span></h1>
            <p className={styles.heroDescription}>พบตัวละครที่ทำให้คุณอยากคุยต่ออีกนิด<br className={styles.desktopBreak} /> แล้วเขียนเรื่องราวบทใหม่ไปด้วยกัน ผ่านบทสนทนากับ AI<br className={styles.desktopBreak} /> ที่คุณเลือกทิศทางของเรื่องได้เอง</p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryButton} href="/chat">เริ่มเรื่องของคุณ <ArrowRight size={20} aria-hidden /></Link>
              <a className={styles.textButton} href="#pricing">ดูแพ็กเกจ <ArrowDown size={17} aria-hidden /></a>
            </div>
            <p className={styles.heroNote}><Check size={16} aria-hidden /> {free ? 'เริ่มต้นฟรี ไม่ต้องใช้บัตรเครดิต' : 'แวะดูตัวละครก่อนได้ แล้วค่อยเริ่มคุย'}</p>
          </div>

          <div className={styles.storyStage} aria-label="ตัวอย่างบทสนทนาสมมติกับตัวละคร AI">
            <span className={styles.orbit} aria-hidden />
            <div className={styles.storyCard}>
              <div className={styles.storyTop}><span>เรื่องของเรา</span><Heart size={18} aria-hidden /></div>
              <div className={styles.bookScene} aria-hidden>
                <span className={styles.sceneSun} /><span className={styles.sceneHill} />
                <span className={styles.sceneHillBack} /><span className={styles.sceneWindow} />
                <span className={styles.sceneCaption}>a little hello,<br />a new beginning.</span>
              </div>
              <div className={styles.storyHeading}><span>บทที่ 01 · การพบกัน</span><h2>ที่นั่งข้าง ๆ ยังว่างไหม?</h2><p>โรแมนติก · ร้านหนังสือ · บ่ายวันฝนตก</p></div>
              <div className={styles.conversation}>
                <div className={styles.characterLabel}><span>อ</span><p>ไอริส <small>ตัวละคร AI</small></p><Sparkle size={15} aria-hidden /></div>
                <div className={styles.characterBubble}><em>*เงยหน้าจากหนังสือ แล้วยิ้มให้คุณ*</em><p>“ฝนยังไม่หยุดเลย… นั่งอ่านด้วยกันก่อนไหม?”</p></div>
                <div className={styles.userBubble}>“ได้สิ กำลังอ่านเรื่องอะไรอยู่เหรอ?”</div>
              </div>
              <div className={styles.storyBottom}><span>และเรื่องราว… ก็เริ่มต้นขึ้น</span><Heart size={14} weight="fill" aria-hidden /></div>
            </div>
            <div className={styles.floatingNote}><span><BookOpen size={22} aria-hidden /></span><div>เรื่องต่อไป<br /><strong>คุณเป็นคนเขียน</strong></div></div>
            <span className={styles.floatingStar} aria-hidden>✳</span>
            <p className={styles.sampleLabel}>ตัวอย่างเรื่องราวสมมติ</p>
          </div>
        </section>

        <div className={styles.promiseStrip}><div className={styles.container}><span><ChatCircleDots size={19} aria-hidden /> คุยกับตัวละคร AI</span><span><MagicWand size={19} aria-hidden /> สร้างโลกในแบบของคุณ</span><span><LockSimple size={19} aria-hidden /> แชทส่วนตัวในบัญชีคุณ</span></div></div>

        <section id="about" className={`${styles.section} ${styles.container}`} aria-labelledby="about-title">
          <div className={styles.sectionHeading}><p className={styles.eyebrow}>มากกว่าการอ่านเรื่องราว</p><h2 id="about-title">ครั้งนี้ คุณมีบทอยู่ในนั้นด้วย</h2><p>ไม่ต้องคิดพล็อตให้จบ แค่เริ่มจากประโยคที่อยากพูด<br />แล้วปล่อยให้เรื่องค่อย ๆ เติบโตไปกับคุณ</p></div>
          <div className={styles.featureGrid}>{features.map(({ icon: Icon, number, title, text }) => (
            <article className={styles.feature} key={number}><div className={styles.featureTop}><span className={styles.featureIcon}><Icon size={28} weight="duotone" aria-hidden /></span><span>{number}</span></div><h3>{title}</h3><p>{text}</p></article>
          ))}</div>
        </section>

        <section id="how-it-works" className={`${styles.howSection} ${styles.container}`} aria-labelledby="how-title">
          <div className={styles.howIntro}><p className={styles.eyebrow}>หน้าว่าง ๆ ที่รอคุณอยู่</p><h2 id="how-title">เรื่องของคุณ<br />เริ่มง่าย ๆ แค่นี้</h2><p>จะเป็นคนช่างฝัน นักอ่านตัวยง<br />หรือแค่อยากลองคุย ก็เริ่มได้เหมือนกัน</p><Link className={styles.textButton} href="/chat">ไปพบตัวละครของคุณ <ArrowRight size={19} aria-hidden /></Link></div>
          <ol className={styles.steps}>
            <li><span>01</span><div><h3>เลือกคนที่อยากรู้จัก</h3><p>เปิดดูคลังตัวละคร หรือสร้างคนใหม่พร้อมบุคลิกและฉากในจินตนาการของคุณ</p></div></li>
            <li><span>02</span><div><h3>สมัคร แล้วส่งคำทักทาย</h3><p>สร้างบัญชี ยืนยันข้อมูลและความยินยอม จากนั้นเริ่มเรื่องแรกด้วยข้อความของคุณ</p></div></li>
            <li><span>03</span><div><h3>เขียนบทต่อไปด้วยกัน</h3><p>คุย สวมบทบาท และพาเรื่องไปได้หลายทาง อยากพักเมื่อไหร่ ก็กลับมาอ่านต่อได้ในบัญชีเดิม</p></div></li>
          </ol>
        </section>

        <section className={`${styles.faqSection} ${styles.container}`} aria-labelledby="faq-title">
          <div><p className={styles.eyebrow}>ก่อนเริ่มบทแรก</p><h2 id="faq-title">เผื่อคุณกำลังสงสัย</h2><p className={styles.faqLead}>ทำความรู้จักกันอีกนิด<br />ก่อนจะไปสร้างเรื่องราวของคุณ</p></div>
          <div className={styles.faqList}>{questions.map(({ q, a }) => <details className={styles.faq} key={q}><summary>{q}<Plus size={19} aria-hidden /></summary><p>{a}</p></details>)}</div>
        </section>

        <section id="pricing" className={styles.pricingSection} aria-labelledby="pricing-title">
          <div className={styles.container}>
            <div className={styles.sectionHeading}><p className={styles.eyebrow}><Heart size={15} weight="fill" aria-hidden /> ให้เรื่องราวมีพื้นที่เติบโต</p><h2 id="pricing-title">เลือกจังหวะที่ใช่<br />ให้เรื่องของคุณ</h2><p>เริ่มต้นทำความรู้จัก หรืออยู่คุยกันให้นานขึ้น<br />เลือกแพ็กเกจให้พอดีกับเรื่องที่คุณอยากเขียน</p></div>
            {available?.length ? <div className={styles.planGrid}>{available.map((plan) => {
              const featured = plan.level === 1;
              return <article className={`${styles.planCard} ${featured ? styles.featuredPlan : ''}`} key={plan.id}>
                <div className={styles.planLabel}><span>{plan.price === 0 ? 'สำหรับบทแรกของคุณ' : plan.level === 1 ? 'สำหรับเรื่องที่อยากคุยต่อ' : 'สำหรับโลกที่คุณอยากสร้าง'}</span>{featured && <span className={styles.recommended}>แนะนำ</span>}</div>
                <h3>{plan.name}</h3>
                <p className={styles.planPrice}>{plan.price === 0 ? 'ฟรี' : <>{formatPrice(plan.price)}<span> / {INTERVAL_LABEL[plan.interval]}</span></>}</p>
                <p className={styles.planBilling}>{plan.price === 0 ? 'เริ่มได้โดยไม่ต้องผูกบัตร' : `ราคาเต็มต่อ${INTERVAL_LABEL[plan.interval]} ไม่มีค่าเริ่มต้น`}</p>
                <Link className={featured ? styles.primaryButton : styles.outlineButton} href={plan.price === 0 ? '/chat?login=1' : `/membership?plan=${encodeURIComponent(plan.id)}#plan-${encodeURIComponent(plan.id)}`}>
                  {plan.price === 0 ? 'เริ่มต้นฟรี' : `เลือก ${plan.name}`}<ArrowRight size={17} aria-hidden />
                </Link>
                <ul>{planDetails(plan).map((detail) => <li key={detail}><Check size={17} weight="bold" aria-hidden /><span>{detail}</span></li>)}</ul>
                {plan.perks.length > 0 && <details className={styles.planMore}><summary>รายละเอียดเพิ่มเติม <Plus size={15} aria-hidden /></summary><ul>{plan.perks.map((perk, index) => <li key={index}><Check size={15} aria-hidden /><span>{perk}</span></li>)}</ul></details>}
              </article>;
            })}</div> : <div className={styles.pricingUnavailable}><p>กำลังอัปเดตรายละเอียดแพ็กเกจ</p><Link className={styles.outlineButton} href="/membership">ดูแพ็กเกจที่หน้าสมาชิก <ArrowRight size={18} aria-hidden /></Link></div>}
            <p className={styles.paymentNote}>{payments ? 'แพ็กเกจที่ชำระผ่านบัตรต่ออายุอัตโนมัติ ยกเลิกการต่ออายุได้ในหน้าสมาชิก' : 'ขณะนี้ยังไม่เปิดชำระเงินออนไลน์ หากมีโค้ดแพ็กเกจ สามารถใช้ได้ที่หน้าสมาชิก'}<br /><Link href="/membership">ไปหน้าสมาชิกและใช้โค้ด</Link><span> · </span><Link href="/terms">เงื่อนไขการใช้งาน</Link></p>
          </div>
        </section>
      </main>

      <footer className={`${styles.footer} ${styles.container}`}><div><Link className={styles.brand} href="/"><Heart size={22} weight="fill" aria-hidden /> หลงรักแชท<span className={styles.brandDot}>.</span></Link><p>เรื่องรักที่คุณเป็นคนเขียน</p></div><nav aria-label="ลิงก์ท้ายหน้า"><Link href="/chat">ไปหน้าแชท</Link><Link href="/privacy">ความเป็นส่วนตัว</Link><Link href="/terms">ข้อกำหนดการใช้งาน</Link></nav><div className={styles.footerNote}><Copyright /><p>ตัวละครและบทสนทนาสร้างด้วย AI เพื่อความบันเทิง</p></div></footer>
    </div>
  );
}
