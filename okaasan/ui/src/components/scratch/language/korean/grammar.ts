// Level 3: particles to fill in, sentences to put back in order, and the
// polite 해요 form of the verbs and adjectives. Built on the example sentences.
import { shuffle } from '../engine/util';
import { VOCAB, VOCAB_UNITS, Vocab } from './vocab';

export type Sentence = NonNullable<Vocab['ex']>;
export const SENTENCE_BY: Record<string, Sentence> = Object.fromEntries(VOCAB.filter((w) => w.ex).map((w) => [w.ex!.ko, w.ex!]));
export const SENTENCE_UNIT: Record<string, number> = Object.fromEntries(
  VOCAB_UNITS.flatMap((u, i) => u.words.filter((w) => w.ex).map((w) => [w.ex!.ko, i])),
);

export const hasBatchim = (syllable: string) => {
  const c = syllable.charCodeAt(0) - 0xac00;
  return c >= 0 && c <= 11171 && c % 28 !== 0;
};
export const endsWithL = (syllable: string) => (syllable.charCodeAt(0) - 0xac00) % 28 === 8;

export interface ParticleInfo {
  group: string;
  use: string;
  // Form after a consonant / after a vowel, for particles that change.
  pair?: [string, string];
  // Choices that look plausible next to this one.
  confuse: string[];
}

export const PARTICLES: Record<string, ParticleInfo> = {
  '은': { group: 'topic', use: 'topic marker: what the sentence is about', pair: ['은', '는'], confuse: ['는', '이', '을'] },
  '는': { group: 'topic', use: 'topic marker: what the sentence is about', pair: ['은', '는'], confuse: ['은', '가', '를'] },
  '이': { group: 'topic', use: 'subject marker: who or what does it, or is described', pair: ['이', '가'], confuse: ['가', '은', '을'] },
  '가': { group: 'topic', use: 'subject marker: who or what does it, or is described', pair: ['이', '가'], confuse: ['이', '는', '를'] },
  '을': { group: 'object', use: 'object marker: what the action is done to', pair: ['을', '를'], confuse: ['를', '이', '은'] },
  '를': { group: 'object', use: 'object marker: what the action is done to', pair: ['을', '를'], confuse: ['을', '가', '는'] },
  '에': { group: 'place', use: 'at / to a place, at a time', confuse: ['에서', '로', '를'] },
  '에서': { group: 'place', use: 'where an action happens, or "from" a place', confuse: ['에', '로', '부터'] },
  '으로': { group: 'place', use: 'toward, or by means of; 으로 after a consonant (except ㄹ)', confuse: ['로', '에', '에서'] },
  '로': { group: 'place', use: 'toward, or by means of; 로 after a vowel or ㄹ', confuse: ['으로', '에', '에서'] },
  '부터': { group: 'place', use: 'starting from (a time)', confuse: ['에서', '보다', '에'] },
  '에게': { group: 'place', use: 'to a person', confuse: ['에', '에서', '를'] },
  '와': { group: 'link', use: 'and / with', pair: ['과', '와'], confuse: ['과', '랑', '에'] },
  '과': { group: 'link', use: 'and / with', pair: ['과', '와'], confuse: ['와', '이랑', '의'] },
  '하고': { group: 'link', use: 'and / with, after a vowel or a consonant', confuse: ['와', '에', '를'] },
  '랑': { group: 'link', use: 'and / with, casual', pair: ['이랑', '랑'], confuse: ['이랑', '와', '에'] },
  '이랑': { group: 'link', use: 'and / with, casual', pair: ['이랑', '랑'], confuse: ['랑', '과', '에'] },
  '의': { group: 'link', use: "possessive, like 's", confuse: ['에', '를', '가'] },
  '보다': { group: 'link', use: 'than', confuse: ['부터', '에서', '도'] },
  '도': { group: 'link', use: 'also / even', confuse: ['는', '를', '가'] },
};

// Why this form of the particle: depends on the syllable before it.
export function particleReason(particle: string, before: string) {
  const info = PARTICLES[particle];
  const last = Array.from(before.trimEnd()).pop() || '';
  const parts = [`${particle}: ${info.use}.`];
  if (info.pair) {
    parts.push(`${hasBatchim(last) ? info.pair[0] : info.pair[1]} because ${last} ends in a ${hasBatchim(last) ? 'consonant' : 'vowel'}.`);
  } else if (particle === '로' || particle === '으로') {
    parts.push(`${particle} because ${last} ends in ${hasBatchim(last) && !endsWithL(last) ? 'a consonant' : endsWithL(last) ? 'ㄹ' : 'a vowel'}.`);
  }
  return parts.join(' ');
}

// Example sentences with the particles to practise in [brackets].
export const CLOZE_SOURCE = [
  '집[에] 도착했어요.',
  '화장실 앞[에서] 20분이나 기다렸어요.',
  '나[는] 따뜻한 나라[가] 너무 좋아!',
  '직업[이] 뭐예요?',
  '그림[을] 왼쪽[으로] 옮겨주세요.',
  '내리실 문[은] 오른쪽입니다.',
  '하루[에] 물 세 잔 마셔요.',
  '시장[에서] 야채[를] 샀어요.',
  '어제 저녁[에] 고기[를] 구워 먹었어요.',
  '빵 먹을때 버터[랑] 잼[이랑] 같이 먹어요.',
  '생선[을] 열 마리나 잡았어요!',
  '저[는] 아침[에] 커피[를] 마시는 것을 좋아해요.',
  '내 남자친구[는] 맥주 한 병[도] 못 마셔요.',
  '나랑 친구[는] 소주[를] 좋아해요.',
  '오늘 친구[하고] 만나기로 했어요.',
  '가족들[과] 함께 여행[을] 가요',
  '아직도 남자 친구[가] 없어요?',
  '여자 친구[와] 커피 마시러 카페[에] 갑니다.',
  '다음 달[에] 결혼할 거예요.',
  '내 첫사랑[은] 지금[의] 남편입니다.',
  '아내[를] 만나러 왔습니다.',
  '저[는] 1시간 동안 운동했어요',
  '학원[에] 갑니다.',
  '언니[가] 집[에서] 호텔[로] 옵니다.',
  '나 커다란 인형[을] 가지고 있어!',
  '아빠[가] 한국 사람이다.',
  '고양이[가] 생선[을] 먹었다.',
  '달리기하고 나서 물[을] 마십니다.',
  '아빠[가] 생일선물[을] 주셨다.',
  '갈매기[를] 처음 봤어요!',
  '어젯밤[에] 늦게 잤습니다.',
  '오늘 오전 7시[에] 일어났어요.',
  '오이[를] 샀습니다.',
  '여기[에] 이름[을] 쓰세요.',
  '그녀[가] 나[를] 보고 웃었어요.',
  '오늘[부터] 여름 옷[을] 입을 거에요.',
  '남자 친구[와] 손[을] 잡고 걸었어요.',
  '제일 좋아하는 책[을] 읽었습니다.',
  '오늘[부터] 운전[을] 배워요.',
  '부모님[을] 만났습니다.',
  '강아지[보다] 고양이[가] 좋아요.',
  '파프리카[를] 싫어합니다.',
  '이번 여름[은] 아주 더워요.',
  '한국[의] 겨울[은] 추워요.',
  '언제[부터] 배[가] 아팠어요?',
  '이 책[은] 정말 재밌는 것 같아요.',
  '집[에]만 있으면 재미없어요!',
  '수학 문제[가] 가장 어렵습니다.',
  '공항[이] 깨끗해요.',
  '앞치마[가] 금방 더러워졌어요.',
  '거북이[는] 토끼[보다] 느려요.',
  '나[는] 북한[과] 남한[의] 역사[에] 매우 관심[이] 있어요.',
  '바닥[이] 아주 미끄러워요. 조심하세요.',
  '이 가방[은] 꽤 무거워요.',
  '가격[은] 상당히 비싼 편이에요.',
  '공항[에] 거의 다 왔어요.',
  '존[은] 한국어[를] 빨리 배우고 있어요.',
  '내 친구[가] 한국어[를] 천천히 배우고 있어요.',
  '이 문제[를] 신중하게 고려해 주세요.',
  '그[는] 항상 바빠요.',
  '우리[는] 늘 함께 점심[을] 먹어요.',
  '봄[에]는 벚꽃[을] 흔히 볼 수 있어요.',
  '내 사촌[은] 보통 한국 음악[을] 듣고 한국 드라마[를] 봐요.',
  '순영이[는] 가끔 친구들[에게] 영어[로] 말해요.',
  '누구나 때로는 실수[를] 해요.',
  '나[는] 직장[에] 좀처럼 지각하지 않아요.',
  '조슈아[는] 드물게 한국어[를] 해요.',
  '그 날[을] 결코 잊지 않을 거예요.',
  '절대 거짓말[을] 하지 않았어요.',
];

export interface Cloze {
  id: string;
  sentence: Sentence;
  before: string;
  after: string;
  particle: string;
}

// One blank per bracket: '나[는] 나라[가]' gives two exercises.
export const CLOZES: Cloze[] = CLOZE_SOURCE.flatMap((src) => {
  const plain = src.replace(/[[\]]/g, '');
  const parts = src.split(/\[([^\]]+)\]/);  // text, particle, text, particle, ...
  const out: Cloze[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const before = parts.slice(0, i).join('');
    const after = parts.slice(i + 1).join('');
    out.push({ id: `p:${plain}#${(i - 1) / 2}`, sentence: SENTENCE_BY[plain], before, after, particle: parts[i] });
  }
  return out;
});
export const CLOZE_BY: Record<string, Cloze> = Object.fromEntries(CLOZES.map((c) => [c.id, c]));

export function particleChoices(c: Cloze): string[] {
  return shuffle([c.particle, ...PARTICLES[c.particle].confuse.slice(0, 3)]);
}

// Word order: sentences of 3 to 8 chunks, put back in order.
export const ORDER_SENTENCES = Object.keys(SENTENCE_BY).filter((ko) => {
  const n = ko.split(' ').length;
  return n >= 3 && n <= 8;
});
export const orderId = (ko: string) => `o:${ko}`;

// Polite present (해요 form) of the verbs and adjectives.
export const CONJ_RULES: Record<string, string> = {
  merge: 'Stem ends in ㅏ: add 아요 and the two ㅏ merge (가 + 아요 → 가요).',
  a: 'Last stem vowel is ㅏ or ㅗ: add 아요 (좋 + 아요 → 좋아요).',
  eo: 'Last stem vowel is not ㅏ or ㅗ: add 어요 (먹 + 어요 → 먹어요).',
  wa: 'Stem ends in ㅗ: ㅗ + 아요 contracts to ㅘ요 (보 + 아요 → 봐요).',
  wo: 'Stem ends in ㅜ: ㅜ + 어요 contracts to ㅝ요 (주 + 어요 → 줘요).',
  yeo: 'Stem ends in ㅣ: ㅣ + 어요 contracts to ㅕ요 (마시 + 어요 → 마셔요).',
  ha: '하다 verbs: 하 becomes 해요 (공부하다 → 공부해요).',
  eu: 'Stem ends in ㅡ: the ㅡ drops; 아요 if the syllable before has ㅏ or ㅗ, otherwise 어요 (쓰다 → 써요, 아프다 → 아파요).',
  b: 'ㅂ irregular: the final ㅂ becomes 우, and 우 + 어요 → 워요 (덥다 → 더워요).',
  d: 'ㄷ irregular: the final ㄷ becomes ㄹ before a vowel (걷다 → 걸어요).',
  reu: '르 irregular: 르 becomes ㄹ + ㄹ, then 아요 or 어요 (빠르다 → 빨라요).',
  ida: '이다 (to be): 이에요 after a consonant, 예요 after a vowel (사람이에요, 의사예요).',
};

export interface Conj {
  dict: string;
  polite: string;
  rule: string;
  wrong: string[];
}

export const CONJ_UNITS: { id: string; title: string; items: Conj[] }[] = [
  { id: 'g-conj1', title: 'Polite form: 아요 / 어요 / 해요', items: [
    { dict: '가다', polite: '가요', rule: 'merge', wrong: ['가아요', '가어요', '거요'] },
    { dict: '자다', polite: '자요', rule: 'merge', wrong: ['자아요', '자어요', '저요'] },
    { dict: '사다', polite: '사요', rule: 'merge', wrong: ['사아요', '사어요', '서요'] },
    { dict: '만나다', polite: '만나요', rule: 'merge', wrong: ['만나아요', '만나어요', '만너요'] },
    { dict: '일어나다', polite: '일어나요', rule: 'merge', wrong: ['일어나아요', '일어나어요', '일어너요'] },
    { dict: '좋다', polite: '좋아요', rule: 'a', wrong: ['좋어요', '좋요', '조아요'] },
    { dict: '있다', polite: '있어요', rule: 'eo', wrong: ['있아요', '있요', '이써요'] },
    { dict: '먹다', polite: '먹어요', rule: 'eo', wrong: ['먹아요', '먹요', '머거요'] },
    { dict: '웃다', polite: '웃어요', rule: 'eo', wrong: ['웃아요', '웃요', '우서요'] },
    { dict: '울다', polite: '울어요', rule: 'eo', wrong: ['울아요', '울요', '우러요'] },
    { dict: '입다', polite: '입어요', rule: 'eo', wrong: ['입아요', '이워요', '입요'] },
    { dict: '읽다', polite: '읽어요', rule: 'eo', wrong: ['읽아요', '읽요', '일어요'] },
    { dict: '싫다', polite: '싫어요', rule: 'eo', wrong: ['싫아요', '싫요', '시러요'] },
    { dict: '재미있다', polite: '재미있어요', rule: 'eo', wrong: ['재미있아요', '재미있요', '재미이써요'] },
    { dict: '재미없다', polite: '재미없어요', rule: 'eo', wrong: ['재미없아요', '재미없요', '재미업써요'] },
    { dict: '공부하다', polite: '공부해요', rule: 'ha', wrong: ['공부하아요', '공부하요', '공부하어요'] },
    { dict: '피곤하다', polite: '피곤해요', rule: 'ha', wrong: ['피곤하아요', '피곤하요', '피곤헤요'] },
    { dict: '깨끗하다', polite: '깨끗해요', rule: 'ha', wrong: ['깨끗하아요', '깨끗하요', '깨끗헤요'] },
    { dict: '이다', polite: '이에요', rule: 'ida', wrong: ['이어요', '이아요', '이요'] },
  ] },
  { id: 'g-conj2', title: 'Polite form: contractions & irregulars', items: [
    { dict: '오다', polite: '와요', rule: 'wa', wrong: ['오아요', '오요', '워요'] },
    { dict: '보다', polite: '봐요', rule: 'wa', wrong: ['보어요', '보요', '붜요'] },
    { dict: '주다', polite: '줘요', rule: 'wo', wrong: ['주아요', '주요', '좌요'] },
    { dict: '배우다', polite: '배워요', rule: 'wo', wrong: ['배우아요', '배와요', '배우요'] },
    { dict: '마시다', polite: '마셔요', rule: 'yeo', wrong: ['마시아요', '마시요', '마서요'] },
    { dict: '느리다', polite: '느려요', rule: 'yeo', wrong: ['느리아요', '느리요', '늘러요'] },
    { dict: '쓰다', polite: '써요', rule: 'eu', wrong: ['쓰어요', '싸요', '쓰요'] },
    { dict: '슬프다', polite: '슬퍼요', rule: 'eu', wrong: ['슬프어요', '슬파요', '슬프요'] },
    { dict: '아프다', polite: '아파요', rule: 'eu', wrong: ['아프어요', '아퍼요', '아프요'] },
    { dict: '덥다', polite: '더워요', rule: 'b', wrong: ['덥어요', '덥아요', '더와요'] },
    { dict: '춥다', polite: '추워요', rule: 'b', wrong: ['춥어요', '춥아요', '추와요'] },
    { dict: '어렵다', polite: '어려워요', rule: 'b', wrong: ['어렵어요', '어렵아요', '어려와요'] },
    { dict: '쉽다', polite: '쉬워요', rule: 'b', wrong: ['쉽어요', '쉽아요', '쉬와요'] },
    { dict: '더럽다', polite: '더러워요', rule: 'b', wrong: ['더럽어요', '더럽아요', '더러와요'] },
    { dict: '걷다', polite: '걸어요', rule: 'd', wrong: ['걷어요', '걷아요', '걸아요'] },
    { dict: '빠르다', polite: '빨라요', rule: 'reu', wrong: ['빠르어요', '빠라요', '빨러요'] },
  ] },
];
export const CONJ_BY: Record<string, Conj> = Object.fromEntries(CONJ_UNITS.flatMap((u) => u.items).map((c) => [`c:${c.dict}`, c]));

export interface GrammarUnit {
  id: string;
  title: string;
  rule: string;       // shown at the start of each lesson
  items: string[];    // stats keys: p:..., o:..., c:...
}

export const PARTICLE_GROUPS: { group: string; title: string; rule: string }[] = [
  { group: 'topic', title: 'Particles: 은/는 and 이/가',
    rule: '은/는 marks the topic, what the sentence is about (often in contrast). 이/가 marks the subject, often new information. 은 and 이 go after a consonant (책은, 직업이), 는 and 가 after a vowel (저는, 나라가).' },
  { group: 'object', title: 'Particles: 을/를',
    rule: '을/를 marks the object, what the action is done to. 을 after a consonant (책을), 를 after a vowel (커피를). Korean puts the verb last: 커피를 마셔요 = coffee-OBJECT drink.' },
  { group: 'place', title: 'Particles: 에, 에서, (으)로, 부터',
    rule: '에: at or to a place, at a time (집에 가요, 7시에). 에서: where an action happens, or from (시장에서 샀어요). (으)로: toward or by means of (왼쪽으로, 영어로). 부터: starting from (오늘부터). 에게: to a person.' },
  { group: 'link', title: 'Particles: and, of, than, also',
    rule: '와/과, 하고, (이)랑 all mean "and / with": 와 and 랑 after a vowel, 과 and 이랑 after a consonant, 하고 after either. 의 is the possessive (한국의 겨울 = Korea\'s winter). 보다 means "than". 도 means "also" or "even".' },
];

export const ORDER_GROUPS: { id: string; title: string; units: number[] }[] = [
  { id: 'g-order1', title: 'Word order: everyday', units: [0, 1, 2, 3, 4, 5] },
  { id: 'g-order2', title: 'Word order: actions', units: [6, 7] },
  { id: 'g-order3', title: 'Word order: describing', units: [8, 9, 10, 11, 12] },
];

export const GRAMMAR_UNITS: GrammarUnit[] = [
  ...PARTICLE_GROUPS.map((g) => ({
    id: `g-${g.group}`, title: g.title, rule: g.rule,
    items: CLOZES.filter((c) => PARTICLES[c.particle].group === g.group).map((c) => c.id),
  })),
  ...ORDER_GROUPS.map((g) => ({
    id: g.id, title: g.title,
    rule: 'Korean is subject-object-verb: the verb or adjective comes last, particles follow the word they mark, and time words usually come first (어제 저녁에 고기를 먹었어요 = yesterday evening meat-OBJECT ate).',
    items: ORDER_SENTENCES.filter((ko) => g.units.includes(SENTENCE_UNIT[ko])).map(orderId),
  })),
  ...CONJ_UNITS.map((u) => ({
    id: u.id, title: u.title,
    rule: 'The polite present (해요 form) is how you talk to most people. Take the stem (dictionary form minus 다), then add 아요 or 어요 depending on its last vowel. ' +
      (u.id === 'g-conj1' ? '하다 always becomes 해요.' : 'Here the vowels contract, and a few verbs change their stem first (irregulars).'),
    items: u.items.map((c) => `c:${c.dict}`),
  })),
];
