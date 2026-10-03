/**
 * Refuses picture descriptions that ask for a minor or for nudity. Character pictures are covers
 * anyone may see, so this holds whatever the account's age. A word list is a first gate, not a
 * guarantee: the prompt sent to Flux also always asks for a clothed adult (app/api/images/route.ts).
 */

/** Plurals and endings count too: teen(s|ager), little girl(s), nud(e|es|ity), loli(con). */
const MINOR_WORDS =
  /\b(child(ren|ish|like)?|kids?|kiddos?|minors?|under-?age(d)?|teen(s|age|aged|ager|agers)?|pre-?teens?|tweens?|lol(i|is|ita|itas|icon)|shota(con)?|toddlers?|bab(y|ies)|infants?|(little|young|small) (girl|boy)s?|school ?(child|children|kid|kids|girl|girls|boy|boys)|(high|middle|elementary|primary|junior high) ?school(er|ers)?|grade ?school(er|ers)?|elementary|junior high|jailbait|chibi)\b/;
const EXPLICIT_WORDS =
  /\b(nud(e|es|ity|ist)|naked|nsfw|top-?less|bottom-?less|nipples?|areolas?|genital(s|ia)?|penis|vagina|pussy|boobs?|tits?|breasts? out|sex(ual|ually|y time)?|porn(o|ographic)?|explicit|hentai|lewd|erotic|undress(ed|ing)?|unclothed|strip(ping|per)?)\b/;
const THAI_WORDS = /(เด็ก|ประถม|มัธยม|นักเรียน|ผู้เยาว์|ขวบ|วัยรุ่น|เปลือย|โป๊|ลามก|ไม่ใส่เสื้อผ้า|ถอดเสื้อผ้า|อนาจาร|หัวนม|อวัยวะเพศ)/;
/** The same terms with spaces, dots and dashes squeezed out: "n u d e", "l.o.l.i". */
const SQUEEZED = /(loli|nsfw|hentai|porn|nude|naked|underage|preteen|toddler|jailbait)/;

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i' };

/**
 * Lowercase, compatibility forms folded (fullwidth, ligatures), invisible characters dropped, and accents
 * taken off Latin letters only ("nüde"); Thai vowels and tone marks are combining marks too and must stay.
 */
function normalize(text: string) {
  return text
    .normalize('NFKD')
    .replace(/\p{Cf}/gu, '')
    .replace(/(\p{Script=Latin})\p{Mn}+/gu, '$1')
    .normalize('NFC')
    .toLowerCase();
}

/** "14 year old", "aged 12", "age: 15", "15yo", "อายุ 15", "15 ปี" — any stated age under 18. */
function statesMinorAge(text: string) {
  const ages = [
    ...text.matchAll(/\b(\d{1,3})\s*(?:-|\s)?\s*(?:years?|yrs?|y\/?o|yo)\b/g),
    ...text.matchAll(/\bage(?:d|s)?\s*(?:of|:|=|is)?\s*(\d{1,3})\b/g),
    ...text.matchAll(/อายุ\s*(\d{1,3})/g),
    ...text.matchAll(/(\d{1,3})\s*ปี/g),
  ].map((m) => Number(m[1]));
  return ages.some((age) => age < 18);
}

export function unsafeImagePrompt(raw: string): boolean {
  const text = normalize(raw);
  const deleet = text.replace(/[0134578@$!]/g, (c) => LEET[c] ?? c);
  const squeezed = deleet.replace(/[^\p{L}]/gu, '');
  return statesMinorAge(text) || [text, deleet].some((t) => MINOR_WORDS.test(t) || EXPLICIT_WORDS.test(t) || THAI_WORDS.test(t)) || SQUEEZED.test(squeezed);
}
