// Past, future, progressive and negative polite forms of every verb and
// adjective (the "forms" list of data/grammar.json). Generated once from the
// rules, then checked by hand; kept as data so each form has audio.
//
//   past      polite form minus 요, ㅆ added to the last syllable, + 어요
//   future    stem + ㄹ 거예요 after a vowel, 을 거예요 after a consonant
//             (stems in ㄹ just add 거예요; ㅂ and ㄷ irregulars change first)
//   prog      action verbs only: stem + 고 있어요
//   neg       안 + verb, or noun + 안 + 해요 for noun-하다 verbs;
//             있다 → 없어요, 이다 → 아니에요
//   negji     stem + 지 않아요

export interface Forms {
  dict: string;
  type: 'v' | 'a' | 'x';   // action verb, adjective, special (이다, 있다, 없다)
  past: string;
  future?: string;
  prog?: string;
  neg?: string;
  negji?: string;
}

export let FORMS: Forms[] = [];
export let FORMS_BY: Record<string, Forms> = {};

export function initForms(forms: Forms[]) {
  FORMS = forms;
  FORMS_BY = Object.fromEntries(FORMS.map((f) => [f.dict, f]));
}
