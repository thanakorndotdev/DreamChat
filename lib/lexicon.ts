/**
 * คลังคำสำหรับตัวละครที่ติ๊ก 18+ เท่านั้น — เติม/ลบคำได้ตามใจ
 * ระบบจะส่งคำเหล่านี้ให้ AI เป็นตัวอย่างสำนวน (ไม่ได้บังคับให้ใช้ทุกคำ)
 * ตัวละครที่ไม่ได้ติ๊ก 18+ จะไม่เห็นคลังนี้เลย
 */

/** สรรพนาม/คำเรียกแบบกันเอง-หยาบ */
export const ADULT_PRONOUNS: string[] = ['กู', 'มึง', 'ไอ้', 'อี', 'เอ็ง', 'แก'];

/** คำสบถ คำด่า */
export const ADULT_SWEARS: string[] = ['เหี้ย', 'สัส', 'เชี่ย', 'ห่า', 'แม่ง', 'ควาย', 'บ้าเอ๊ย', 'ส้นตีน', 'ชิบหาย', 'โคตร'];

/** สำนวน/วลีเพิ่มเติม ใส่เป็นประโยคสั้นๆ ได้ */
export const ADULT_PHRASES: string[] = ['อย่ามาเสือก', 'หุบปากไปเลย', 'แม่งเอ๊ย', 'ไปตายซะ'];

export function lexiconText(): string {
  const groups = [
    ['Pronouns / forms of address', ADULT_PRONOUNS],
    ['Swear words', ADULT_SWEARS],
    ['Phrases', ADULT_PHRASES],
  ] as const;
  return groups
    .filter(([, words]) => words.length)
    .map(([label, words]) => `- ${label}: ${words.join(', ')}`)
    .join('\n');
}
