# Language trainer roadmap

Planned against the stages of the 90 Day Korean guide
(https://www.90daykorean.com/learn-korean/): Beginner → Beginner High →
Intermediate → Intermediate High.

## Layout

- `engine/`: language independent. Lessons, quizzes, progress, spaced
  repetition (Leitner boxes), confusion tracking, sound packs, generic
  `items` and `dialogue` levels built from JSON alone.
- `korean/`: the Korean module, the code JSON cannot express (Hangul
  composition, sound and batchim rules, how letters/words/grammar become
  exercises).
- `website/uploads/language/korean/`: `pack.json`, `data/*.json`, `audio/`.
  `scripts/language_audio.py korean` builds the sound packs from the data.

## Done

| Level | Content | Source |
|---|---|---|
| 1 Alphabet | 40 letters, stroke order, letter ↔ sound, reading simple words | alphabet guide |
| 2 Words | 138 words in 15 topics, example sentences | korean-words, grammar guide |
| 3 Grammar | SOV, 이다/있다/없다, particles, 해요 form, past, future, -고 있어요, negation | grammar guide |
| 4 Conversations | 6 dialogues: reply, meaning, order, dictation | korean-conversation |
| 5 Numbers | Sino/native, 만/억, money, hours, minutes, counters, phone numbers | korean-numbers |
| 6 Frequent words | 230 most frequent subtitle words | FrequencyWords ko_50k |

## Next: Beginner gaps (the guide's level 1 checklist)

1. **Question words**: 뭐, 어디, 언제, 왜, 누구, 몇, 얼마 as a grammar unit with
   question/answer pairs (dialogue type).
2. **Days, months, dates**: Sino months with the 유월 / 시월 exceptions, days of
   the week, 년 월 일 (items type, generated like numbers).
3. **Survival dialogues**: ordering in a restaurant, taking a taxi, shopping
   (얼마예요? + numbers): new dialogue units, no code.
4. **Konglish** unit: 커피, 컴퓨터, 버스 … easy early wins (items type).
5. **Mnemonics**: optional `mnemonic` field on words (집 sounds like "Jeep"),
   shown on the word card.
6. **Pronunciation rules**: liaison (집에 → [지베]), nasalisation
   (합니다 → [함니다]), tensing: hear it, pick the spelling.

## Beginner High

- -고 싶어요 (want to), -하고 / -(이)랑 lists, -아서/어서 (because, and then).
- Irregular verbs as their own drill across all tenses (ㅂ, ㄷ, 르, ㅡ, ㅅ, ㅎ).
- More counters (권, 장, 대, 번) with 몇 questions.
- Daily journal prompt: write one sentence with today's grammar, checked
  against accepted patterns.

## Intermediate and up

- -(으)ㄹ게요, -(으)려고, -(으)면, -(으)니까, honorifics (-시-, 드시다, 계시다).
- Speech levels: convert between 반말 and 존댓말 (the frequency list is
  mostly casual forms, a good source).
- Intermediate High: -(으)ㄴ/는데, passives, -(으)면서, -았/었으면 좋겠다, 도…도.

## Engine features

- **Daily new-item limit** (2–20 a day, as the guide suggests) and a review
  forecast, now that items have due dates.
- **Speaking**: speech recognition (Web Speech API, ko-KR) for "say it"
  exercises, and shadowing (record yourself, play it back after the clip).
- **Listening speed** control and a "slow" replay button.
- **Personalised dialogues**: replace one detail with your own (name, country,
  plans), as the guide recommends.
- **Reading passages**: short texts with tap-to-translate words, linked to the
  vocabulary they use.
- **Hanja roots** (學 in 학생, 학교) as an optional items level.
- **A second language pack** (e.g. Japanese kana) to prove the engine
  boundary: it would need a module for its script (composition, strokes) and
  JSON for everything else.

## Data

- Frequency list beyond the top 300: needs translations (a CC-licensed
  dictionary such as kengdic, or reviewed by hand) and grouping of inflected
  forms under their dictionary form.
- Example sentences per word from Tatoeba (CC BY 2.0), with audio.
