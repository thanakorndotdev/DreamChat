/** What a plan allows. The server enforces these; the client only uses them to show limits. */
export type PlanFeatures = {
  /** Chat replies per day; 0 = unlimited. */
  dailyMessages: number;
  /** Workers AI model for this plan; empty = the model set on the AI settings page. */
  model: string;
  /** Recent messages the AI sees on each reply (short-term memory). */
  historyWindow: number;
  /** Story notes kept in the prompt (long-term memory); 0 turns notes off. */
  memoryNotes: number;
  /** Own characters an account may keep; 0 = unlimited. */
  maxCharacters: number;
};

export type Plan = {
  id: string;
  name: string;
  /** 0 free, 1 Plus, 2 Pro. A catalog character's tier is the lowest level that may chat with it. */
  level: number;
  /** Satang per billing period; 0 = free. */
  price: number;
  interval: 'month' | 'year';
  active: boolean;
  features: PlanFeatures;
  perks: string[];
};

export const FREE_PLAN_ID = 'free';

export const DEFAULT_PLANS: Omit<Plan, 'active'>[] = [
  {
    id: 'free',
    name: 'Free',
    level: 0,
    price: 0,
    interval: 'month',
    features: { dailyMessages: 30, model: '', historyWindow: 8, memoryNotes: 3, maxCharacters: 2 },
    perks: ['ลองคุยกับตัวละครได้ทุกวัน', 'จำบทสนทนาล่าสุดได้ช่วงสั้นๆ', 'สร้างตัวละครเองได้ 2 ตัว'],
  },
  {
    id: 'plus',
    name: 'Rakkao Plus',
    level: 1,
    price: 79_900,
    interval: 'year',
    features: { dailyMessages: 300, model: '', historyWindow: 16, memoryNotes: 15, maxCharacters: 15 },
    perks: [
      'ข้อความต่อวันเยอะกว่า Free มาก',
      'โมเดล AI คุณภาพสูงขึ้น',
      'ตัวละครจำเรื่องสำคัญของเราได้นานขึ้น',
      'บริบทบทสนทนายาวขึ้น คุยต่อเรื่องเดิมได้ลื่นขึ้น',
      'สร้างและปรับแต่งตัวละครได้มากขึ้น',
      'เข้าถึงตัวละครพรีเมียมบางส่วน',
      'ไม่มีโฆษณา',
    ],
  },
  {
    id: 'pro',
    name: 'Rakkao Pro',
    level: 2,
    price: 99_900,
    interval: 'year',
    features: { dailyMessages: 0, model: '', historyWindow: 30, memoryNotes: 40, maxCharacters: 0 },
    perks: [
      'คุยได้แทบไม่จำกัด',
      'โมเดล AI ระดับพรีเมียม',
      'ความจำระยะยาวแบบละเอียด จำความสัมพันธ์และเหตุการณ์สำคัญ',
      'บริบทบทสนทนายาวกว่า Plus',
      'ตัวละครพรีเมียมและฉากพิเศษทั้งหมด',
      'ได้ลองฟีเจอร์ AI ใหม่ก่อนใคร',
      'ไม่มีโฆษณา',
    ],
  },
];

export const TIER_LABEL = ['ทุกคน', 'Plus ขึ้นไป', 'Pro'] as const;

export function formatPrice(satang: number) {
  return `฿${(satang / 100).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;
}

export const INTERVAL_LABEL = { month: 'เดือน', year: 'ปี' } as const;
