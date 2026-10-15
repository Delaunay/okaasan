// Hangul letters (jamo), level 1 units and the words readable with them.
// Sounds and romanizations follow the 90 Day Korean table
// (https://www.90daykorean.com/how-to-learn-the-korean-alphabet/).

export type JamoKind = 'consonant' | 'vowel';

export interface Jamo {
  ch: string;
  rom: string;
  kind: JamoKind;
  group: string;
  hint: string;
  final?: string;  // romanization as a final consonant (batchim)
  say?: string;    // what to play when consonant + ㅏ / ㅇ + vowel would mislead
  sayNote?: string;
}

export const JAMO: Jamo[] = [
  { ch: 'ㄱ', rom: 'g', final: 'k', kind: 'consonant', group: 'Basic consonants', hint: '"g" in "gun", softer, between g and k' },
  { ch: 'ㄴ', rom: 'n', final: 'n', kind: 'consonant', group: 'Basic consonants', hint: '"n" in "northeast"' },
  { ch: 'ㄷ', rom: 'd', final: 't', kind: 'consonant', group: 'Basic consonants', hint: '"d" in "door", between d and t' },
  { ch: 'ㄹ', rom: 'r/l', final: 'l', kind: 'consonant', group: 'Basic consonants', hint: 'a flap between "r" and "l"; "l" at the end of a syllable' },
  { ch: 'ㅁ', rom: 'm', final: 'm', kind: 'consonant', group: 'Basic consonants', hint: '"m" in "mail"' },
  { ch: 'ㅂ', rom: 'b', final: 'p', kind: 'consonant', group: 'Basic consonants', hint: '"b" in "bed", between b and p' },
  { ch: 'ㅅ', rom: 's', final: 't', kind: 'consonant', group: 'Basic consonants', hint: '"s" in "seashell"; "sh" before ㅣ' },
  { ch: 'ㅇ', rom: 'silent/ng', final: 'ng', kind: 'consonant', group: 'Basic consonants', hint: 'silent at the start of a syllable, "ng" in "sing" at the end', say: '아, 앙', sayNote: '아 then 앙: silent at the start, "ng" at the end' },
  { ch: 'ㅈ', rom: 'j', final: 't', kind: 'consonant', group: 'Basic consonants', hint: '"j" in "jug"' },
  { ch: 'ㅊ', rom: 'ch', final: 't', kind: 'consonant', group: 'Basic consonants', hint: '"ch" in "church", with a puff of air' },
  { ch: 'ㅋ', rom: 'k', final: 'k', kind: 'consonant', group: 'Basic consonants', hint: '"k" in "key", with a puff of air' },
  { ch: 'ㅌ', rom: 't', final: 't', kind: 'consonant', group: 'Basic consonants', hint: '"t" in "teeth", with a puff of air' },
  { ch: 'ㅍ', rom: 'p', final: 'p', kind: 'consonant', group: 'Basic consonants', hint: '"p" in "pie", with a puff of air' },
  { ch: 'ㅎ', rom: 'h', final: 't', kind: 'consonant', group: 'Basic consonants', hint: '"h" in "hat"' },
  { ch: 'ㄲ', rom: 'kk', final: 'k', kind: 'consonant', group: 'Double consonants', hint: 'tense k with no air, like "k" in "skip"' },
  { ch: 'ㄸ', rom: 'tt', kind: 'consonant', group: 'Double consonants', hint: 'tense t with no air, like "t" in "stop"' },
  { ch: 'ㅃ', rom: 'pp', kind: 'consonant', group: 'Double consonants', hint: 'tense p with no air, like "p" in "spy"' },
  { ch: 'ㅆ', rom: 'ss', final: 't', kind: 'consonant', group: 'Double consonants', hint: 'strong, hissed "s"' },
  { ch: 'ㅉ', rom: 'jj', kind: 'consonant', group: 'Double consonants', hint: 'tense j with no air, like "ts" in "cats"' },

  { ch: 'ㅏ', rom: 'a', kind: 'vowel', group: 'Basic vowels', hint: '"a" in "father"' },
  { ch: 'ㅑ', rom: 'ya', kind: 'vowel', group: 'Basic vowels', hint: '"ya" in "yacht"' },
  { ch: 'ㅓ', rom: 'eo', kind: 'vowel', group: 'Basic vowels', hint: '"u" in "umbrella"' },
  { ch: 'ㅕ', rom: 'yeo', kind: 'vowel', group: 'Basic vowels', hint: '"yu" in "yummy"' },
  { ch: 'ㅗ', rom: 'o', kind: 'vowel', group: 'Basic vowels', hint: '"o" in "old"' },
  { ch: 'ㅛ', rom: 'yo', kind: 'vowel', group: 'Basic vowels', hint: '"yo" in "yogurt"' },
  { ch: 'ㅜ', rom: 'u', kind: 'vowel', group: 'Basic vowels', hint: '"oo" in "new"' },
  { ch: 'ㅠ', rom: 'yu', kind: 'vowel', group: 'Basic vowels', hint: '"u" in "unicorn"' },
  { ch: 'ㅡ', rom: 'eu', kind: 'vowel', group: 'Basic vowels', hint: '"oo" in "brook", lips flat' },
  { ch: 'ㅣ', rom: 'i', kind: 'vowel', group: 'Basic vowels', hint: '"ee" in "tree"' },
  { ch: 'ㅐ', rom: 'ae', kind: 'vowel', group: 'Compound vowels', hint: '"e" in "egg", mouth a bit more open' },
  { ch: 'ㅒ', rom: 'yae', kind: 'vowel', group: 'Compound vowels', hint: '"ye" in "yes"' },
  { ch: 'ㅔ', rom: 'e', kind: 'vowel', group: 'Compound vowels', hint: '"e" in "egg"' },
  { ch: 'ㅖ', rom: 'ye', kind: 'vowel', group: 'Compound vowels', hint: '"ye" in "yes"' },
  { ch: 'ㅘ', rom: 'wa', kind: 'vowel', group: 'Compound vowels', hint: '"wa" in "waffle"' },
  { ch: 'ㅙ', rom: 'wae', kind: 'vowel', group: 'Compound vowels', hint: '"we" in "wedding"' },
  { ch: 'ㅚ', rom: 'oe', kind: 'vowel', group: 'Compound vowels', hint: '"we" in "wedding"' },
  { ch: 'ㅝ', rom: 'wo', kind: 'vowel', group: 'Compound vowels', hint: '"wo" in "won"' },
  { ch: 'ㅞ', rom: 'we', kind: 'vowel', group: 'Compound vowels', hint: '"we" in "wedding"' },
  { ch: 'ㅟ', rom: 'wi', kind: 'vowel', group: 'Compound vowels', hint: '"wee" in "week"' },
  { ch: 'ㅢ', rom: 'ui', kind: 'vowel', group: 'Compound vowels', hint: '"ooey" in "gooey", run together' },
];
export const JAMO_BY: Record<string, Jamo> = Object.fromEntries(JAMO.map((j) => [j.ch, j]));
export const GROUPS = ['Basic consonants', 'Double consonants', 'Basic vowels', 'Compound vowels'];

// Letters that are easy to confuse; used first as wrong choices.
export const SIMILAR = ['ㄱㄲㅋ', 'ㄷㄸㅌ', 'ㅂㅃㅍ', 'ㅅㅆ', 'ㅈㅉㅊ', 'ㅇㅎ', 'ㄴㄷㄹ', 'ㅏㅑㅓㅕ', 'ㅗㅛㅜㅠ', 'ㅐㅔㅒㅖ', 'ㅘㅙㅚ', 'ㅝㅞㅟ', 'ㅡㅢㅣ'];

export const LEADS = Array.from('ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ');
export const VOWELS = Array.from('ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ');

export const compose = (lead: string, vowel: string) =>
  String.fromCharCode(0xac00 + (LEADS.indexOf(lead) * 21 + VOWELS.indexOf(vowel)) * 28);

export const soundOf = (ch: string) =>
  JAMO_BY[ch].say ?? (JAMO_BY[ch].kind === 'consonant' ? compose(ch, 'ㅏ') : compose('ㅇ', ch));

// Vowels that sound the same in modern Seoul Korean: never offered together
// in a listening question.
export const HOMOPHONES = ['ㅐㅔ', 'ㅒㅖ', 'ㅙㅚㅞ'];
export const homophones = (a: string, b: string) => HOMOPHONES.some((h) => h.includes(a) && h.includes(b));

// Jamo of a word without final consonants.
export const jamoOf = (word: string): string[] =>
  Array.from(word).flatMap((s) => {
    const c = s.charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) return [];
    return [LEADS[Math.floor(c / 588)], VOWELS[Math.floor((c % 588) / 28)]];
  });

export interface Unit {
  id: string;
  title: string;
  letters: string[];
}

export const UNITS: Unit[] = [
  { id: 'v1', title: 'First vowels', letters: Array.from('ㅏㅓㅗㅜㅡㅣ') },
  { id: 'c1', title: 'First consonants', letters: Array.from('ㄱㄴㄷㄹㅁ') },
  { id: 'c2', title: 'More consonants', letters: Array.from('ㅂㅅㅇㅈㅎ') },
  { id: 'v2', title: 'Y vowels', letters: Array.from('ㅑㅕㅛㅠ') },
  { id: 'c3', title: 'Aspirated consonants', letters: Array.from('ㅋㅌㅍㅊ') },
  { id: 'c4', title: 'Tense consonants', letters: Array.from('ㄲㄸㅃㅆㅉ') },
  { id: 'v3', title: 'ㅐ and ㅔ vowels', letters: Array.from('ㅐㅔㅒㅖ') },
  { id: 'v4', title: 'W vowels', letters: Array.from('ㅘㅙㅚㅝㅞㅟㅢ') },
];
export const WORDS_UNIT = 'words';

export interface Word {
  ko: string;
  rom: string;
  en: string;
}

// Words without final consonants, so they only need the letters above.
export const WORDS: Word[] = [
  { ko: '나무', rom: 'namu', en: 'tree' },
  { ko: '다리', rom: 'dari', en: 'leg, bridge' },
  { ko: '고기', rom: 'gogi', en: 'meat' },
  { ko: '거기', rom: 'geogi', en: 'there' },
  { ko: '누나', rom: 'nuna', en: 'older sister (said by a man)' },
  { ko: '가구', rom: 'gagu', en: 'furniture' },
  { ko: '머리', rom: 'meori', en: 'head, hair' },
  { ko: '나라', rom: 'nara', en: 'country' },
  { ko: '모두', rom: 'modu', en: 'everyone, all' },
  { ko: '도로', rom: 'doro', en: 'road' },
  { ko: '구두', rom: 'gudu', en: 'dress shoes' },
  { ko: '너무', rom: 'neomu', en: 'too (much)' },
  { ko: '아이', rom: 'ai', en: 'child' },
  { ko: '오이', rom: 'oi', en: 'cucumber' },
  { ko: '어머니', rom: 'eomeoni', en: 'mother' },
  { ko: '바다', rom: 'bada', en: 'sea' },
  { ko: '모자', rom: 'moja', en: 'hat' },
  { ko: '사자', rom: 'saja', en: 'lion' },
  { ko: '나비', rom: 'nabi', en: 'butterfly' },
  { ko: '하나', rom: 'hana', en: 'one' },
  { ko: '두부', rom: 'dubu', en: 'tofu' },
  { ko: '지도', rom: 'jido', en: 'map' },
  { ko: '비누', rom: 'binu', en: 'soap' },
  { ko: '소리', rom: 'sori', en: 'sound' },
  { ko: '호수', rom: 'hosu', en: 'lake' },
  { ko: '어디', rom: 'eodi', en: 'where' },
  { ko: '우리', rom: 'uri', en: 'we, our' },
  { ko: '바지', rom: 'baji', en: 'trousers' },
  { ko: '버스', rom: 'beoseu', en: 'bus' },
  { ko: '우유', rom: 'uyu', en: 'milk' },
  { ko: '여자', rom: 'yeoja', en: 'woman' },
  { ko: '야구', rom: 'yagu', en: 'baseball' },
  { ko: '요리', rom: 'yori', en: 'cooking' },
  { ko: '여우', rom: 'yeou', en: 'fox' },
  { ko: '휴지', rom: 'hyuji', en: 'tissue' },
  { ko: '커피', rom: 'keopi', en: 'coffee' },
  { ko: '토마토', rom: 'tomato', en: 'tomato' },
  { ko: '피자', rom: 'pija', en: 'pizza' },
  { ko: '기차', rom: 'gicha', en: 'train' },
  { ko: '치마', rom: 'chima', en: 'skirt' },
  { ko: '코', rom: 'ko', en: 'nose' },
  { ko: '포도', rom: 'podo', en: 'grapes' },
  { ko: '스키', rom: 'seuki', en: 'ski' },
  { ko: '카메라', rom: 'kamera', en: 'camera' },
  { ko: '아빠', rom: 'appa', en: 'dad' },
  { ko: '오빠', rom: 'oppa', en: 'older brother (said by a woman)' },
  { ko: '토끼', rom: 'tokki', en: 'rabbit' },
  { ko: '까치', rom: 'kkachi', en: 'magpie' },
  { ko: '아저씨', rom: 'ajeossi', en: 'mister' },
  { ko: '쓰레기', rom: 'sseuregi', en: 'trash' },
  { ko: '개', rom: 'gae', en: 'dog' },
  { ko: '새', rom: 'sae', en: 'bird' },
  { ko: '노래', rom: 'norae', en: 'song' },
  { ko: '네', rom: 'ne', en: 'yes' },
  { ko: '세계', rom: 'segye', en: 'world' },
  { ko: '시계', rom: 'sigye', en: 'clock' },
  { ko: '얘기', rom: 'yaegi', en: 'talk, story' },
  { ko: '찌개', rom: 'jjigae', en: 'stew' },
  { ko: '사과', rom: 'sagwa', en: 'apple' },
  { ko: '회사', rom: 'hoesa', en: 'company' },
  { ko: '돼지', rom: 'dwaeji', en: 'pig' },
  { ko: '뭐', rom: 'mwo', en: 'what' },
  { ko: '귀', rom: 'gwi', en: 'ear' },
  { ko: '쉬다', rom: 'swida', en: 'to rest' },
  { ko: '의자', rom: 'uija', en: 'chair' },
  { ko: '의사', rom: 'uisa', en: 'doctor' },
  { ko: '웨이터', rom: 'weiteo', en: 'waiter' },
];
export const WORD_BY: Record<string, Word> = Object.fromEntries(WORDS.map((w) => [w.ko, w]));
