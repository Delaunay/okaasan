// Typing Hangul: keys are jamo, composed into syllables like an IME. The key
// layout (standard 2-set, dubeolsik) is data/keyboard.json.
import { LEADS, VOWELS } from './alphabet';

export const TAILS = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
export const VOWEL_PAIRS: Record<string, string> = { 'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ', 'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ', 'ㅡㅣ': 'ㅢ' };
export const TAIL_PAIRS: Record<string, string> = {
  'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄵ', 'ㄴㅎ': 'ㄶ', 'ㄹㄱ': 'ㄺ', 'ㄹㅁ': 'ㄻ', 'ㄹㅂ': 'ㄼ',
  'ㄹㅅ': 'ㄽ', 'ㄹㅌ': 'ㄾ', 'ㄹㅍ': 'ㄿ', 'ㄹㅎ': 'ㅀ', 'ㅂㅅ': 'ㅄ',
};

export const isLead = (j: string | undefined) => !!j && LEADS.includes(j);
export const isVowel = (j: string | undefined) => !!j && VOWELS.includes(j);

export function composeKeys(keys: string[]): string {
  const s: string[] = [];
  for (const k of keys) {
    const prev = s[s.length - 1];
    if (isVowel(prev) && VOWEL_PAIRS[prev + k]) s[s.length - 1] = VOWEL_PAIRS[prev + k];
    else s.push(k);
  }
  let out = '';
  let i = 0;
  while (i < s.length) {
    if (isLead(s[i]) && isVowel(s[i + 1])) {
      const lead = s[i];
      const vowel = s[i + 1];
      i += 2;
      // A consonant closes the syllable unless a vowel follows it.
      let tail = '';
      if (TAILS.includes(s[i]) && !isVowel(s[i + 1])) {
        tail = s[i++];
        const pair = TAIL_PAIRS[tail + s[i]];
        if (pair && !isVowel(s[i + 1])) {
          tail = pair;
          i++;
        }
      }
      out += String.fromCharCode(0xac00 + (LEADS.indexOf(lead) * 21 + VOWELS.indexOf(vowel)) * 28 + TAILS.indexOf(tail));
    } else {
      out += s[i++];
    }
  }
  return out;
}
