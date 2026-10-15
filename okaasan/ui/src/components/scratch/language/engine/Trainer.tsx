// Page shell for any language pack: levels, unit paths, quizzes, reviews,
// the confusion list, progress storage and the sound pack picker.
import { useEffect, useMemo, useState } from 'react';
import { Badge, Box, Button, Flex, Grid, Heading, HStack, Text, VStack } from '@chakra-ui/react';
import { Flame, GraduationCap, RotateCcw, Shuffle, Star, Volume2 } from 'lucide-react';
import { privateJsonStore } from '../../../../services/jsonstore';
import type { Answer, Ex, LanguageModule, LanguagePack, Progress } from './types';
import { EMPTY_PROGRESS, confusionKey, dueCount, makeCtx, schedule, topConfusions } from './util';
import { loadPack } from './load';
import { useSpeaker } from './audio';
import { Lesson } from './Lesson';
import { DescribedItem, TrainerContext, UnitCard } from './widgets';
import { STROKE_KEYFRAMES } from './strokes';

const dayStr = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

interface Running {
  id: number;
  title: string;
  exercises: Ex[];
  exam?: boolean;
  unitId?: string;   // counts as a lesson of this unit
  quizId?: string;   // keeps the best score
}

// `dir`: the pack folder under the site's uploads, e.g. 'uploads/language/korean/'.
export function LanguageTrainer({ dir, module }: { dir: string; module: LanguageModule }) {
  const [pack, setPack] = useState<LanguagePack | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadPack(dir, module).then(setPack).catch((e) => setError(String(e)));
  }, [dir, module]);
  if (error) return <Box p={6}><Text color="var(--panel-red-text)">Could not load the language pack: {error}</Text></Box>;
  if (!pack) return <Box p={6}><Text color="var(--muted-text)">Loading…</Text></Box>;
  return <TrainerView pack={pack} />;
}

function TrainerView({ pack }: { pack: LanguagePack }) {
  const speaker = useSpeaker(pack.audio, `${pack.storage.local}.pack`);
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [view, setView] = useState<'learn' | 'reference'>('learn');
  const [levelId, setLevelIdState] = useState<string>(() => {
    try { return localStorage.getItem(`${pack.storage.local}.level`) || pack.levels[0].id; } catch { return pack.levels[0].id; }
  });
  const [running, setRunning] = useState<Running | null>(null);
  const level = pack.levels.find((l) => l.id === levelId) || pack.levels[0];
  const perUnit = pack.lessonsPerUnit ?? 3;

  const setLevel = (id: string) => {
    setLevelIdState(id);
    try { localStorage.setItem(`${pack.storage.local}.level`, id); } catch { /* empty */ }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(pack.storage.local);
      if (raw) setProgress({ ...EMPTY_PROGRESS, ...JSON.parse(raw) });
    } catch { /* empty */ }
    privateJsonStore.get<Progress>(pack.storage.collection, pack.storage.key)
      .then((p) => setProgress({ ...EMPTY_PROGRESS, ...p }))
      .catch(() => { });
  }, [pack]);

  const ctx = useMemo(() => makeCtx(progress, speaker.canListen, speaker.pack), [progress, speaker.canListen, speaker.pack]);

  const save = (p: Progress) => {
    try { localStorage.setItem(pack.storage.local, JSON.stringify(p)); } catch { /* empty */ }
    privateJsonStore.put(pack.storage.collection, pack.storage.key, p).catch(() => { });
  };

  const run = (r: Omit<Running, 'id'>) => {
    if (r.exercises.length) setRunning({ ...r, id: Date.now() });
  };

  const finish = (r: Running, answers: Answer[], confused: [string, string][]) => {
    const stats = { ...progress.stats };
    for (const a of answers) {
      const s = stats[a.key] || { ok: 0, bad: 0 };
      stats[a.key] = a.ok ? { ...s, ok: s.ok + 1 } : { ...s, bad: s.bad + 1 };
    }
    const confusions = { ...progress.confusions };
    for (const [a, b] of confused) {
      if (a !== b) confusions[confusionKey(a, b)] = (confusions[confusionKey(a, b)] || 0) + 1;
    }
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86_400_000);
    const right = answers.filter((a) => a.ok).length;
    const next: Progress = {
      stats,
      srs: schedule(progress.srs, answers),
      confusions,
      lessons: r.unitId ? { ...progress.lessons, [r.unitId]: (progress.lessons[r.unitId] || 0) + 1 } : progress.lessons,
      xp: progress.xp + 10 + right,
      streak: progress.lastDay === dayStr(today) ? progress.streak
        : progress.lastDay === dayStr(yesterday) ? progress.streak + 1 : 1,
      lastDay: dayStr(today),
      bestQuiz: r.quizId && answers.length
        ? { ...progress.bestQuiz, [r.quizId]: Math.max(progress.bestQuiz[r.quizId] || 0, Math.round((right / answers.length) * 100)) }
        : progress.bestQuiz,
    };
    setProgress(next);
    save(next);
    setRunning(null);
  };

  const confusedPairs = topConfusions(progress, (k) => level.owns(k) && !!pack.describe(k));
  const due = dueCount(progress, level.owns);
  const Reference = level.reference?.Component;

  return (
    <TrainerContext.Provider value={{ pack, speak: speaker.speak }}>
      <Box h="100%" display="flex" flexDirection="column" bg="var(--card-bg)" overflowY="auto">
        <style>{`${STROKE_KEYFRAMES}\n@keyframes lt-blink { 50% { opacity: 0; } }`}</style>

        {running ? (
          <Lesson
            key={running.id}
            title={running.title}
            exercises={running.exercises}
            exam={running.exam}
            onExit={() => setRunning(null)}
            onFinish={(a, c) => finish(running, a, c)}
          />
        ) : (
          <>
            <Flex px={4} py={3} borderBottom="1px solid" borderColor="var(--border-color)" align="center" gap={3} wrap="wrap">
              <Heading size="lg" color="var(--heading-color)" flex={1}>
                {pack.name} <span style={{ fontFamily: pack.font, color: 'var(--muted-text)', fontWeight: 400 }}>{pack.nativeName}</span>
              </Heading>
              <HStack gap={2}>
                <Badge variant="subtle" colorPalette="orange"><Flame size={12} /> {progress.streak} day{progress.streak === 1 ? '' : 's'}</Badge>
                <Badge variant="subtle" colorPalette="yellow"><Star size={12} /> {progress.xp} XP</Badge>
                <Badge variant="subtle" colorPalette="green">{level.badge(ctx)}</Badge>
              </HStack>
              <HStack gap={1} color="var(--muted-text)" title="Sound pack">
                <Volume2 size={16} />
                <select
                  value={speaker.pack.id}
                  onChange={(e) => { speaker.setPack(e.target.value); speaker.speak(pack.audio.preview); }}
                  style={{
                    background: 'var(--input-bg)', color: 'var(--heading-color)', border: '1px solid var(--border-color)',
                    borderRadius: 6, padding: '4px 6px', fontSize: 13,
                  }}
                >
                  {speaker.packs.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </HStack>
              <HStack gap={1}>
                <Button size="sm" variant={view === 'learn' ? 'solid' : 'ghost'} onClick={() => setView('learn')}>Learn</Button>
                {level.reference && (
                  <Button size="sm" variant={view === 'reference' ? 'solid' : 'ghost'} onClick={() => setView('reference')}>{level.reference.label}</Button>
                )}
              </HStack>
            </Flex>

            <Flex px={4} pt={3} justify="center">
              <HStack gap={0} p={1} borderRadius="full" bg="var(--surface-muted)" border="1px solid" borderColor="var(--border-color)" wrap="wrap">
                {pack.levels.map((l, i) => (
                  <Button key={l.id} size="sm" borderRadius="full" variant={level.id === l.id ? 'solid' : 'ghost'}
                    colorPalette={level.id === l.id ? 'blue' : 'gray'} onClick={() => setLevel(l.id)}>
                    {i + 1} · {l.title}
                  </Button>
                ))}
              </HStack>
            </Flex>

            {!speaker.canListen && (
              <Box mx={4} mt={3} p={3} borderRadius="md" bg="var(--panel-orange-bg)" border="1px solid" borderColor="var(--panel-orange-border)">
                <Text fontSize="sm" color="var(--panel-orange-text)">
                  No {pack.name} speech voice found in this browser, so listening exercises are skipped. Pick a sound pack instead.
                </Text>
              </Box>
            )}

            <Box px={4} py={4} maxW={view === 'learn' ? '640px' : '1100px'} w="100%" mx="auto">
              {view === 'reference' && Reference ? <Reference ctx={ctx} /> : (
                <VStack align="stretch" gap={4}>
                  <Box p={4} borderRadius="xl" border="2px solid" borderBottomWidth="4px" borderColor="var(--panel-purple-border)" bg="var(--panel-purple-bg)">
                    <HStack gap={3} mb={3}>
                      <GraduationCap size={28} color="var(--panel-purple-text)" />
                      <Box flex={1}>
                        <Text fontWeight={700} color="var(--heading-color)">Big quiz</Text>
                        <Text fontSize="sm" color="var(--muted-text)">{level.quizBlurb}</Text>
                      </Box>
                    </HStack>
                    <Flex gap={2} wrap="wrap">
                      {level.quizzes.map((q, i) => {
                        const n = q.size(ctx);
                        const best = progress.bestQuiz[q.id];
                        return (
                          <Button key={q.id} size="sm" colorPalette="purple" variant={i === 0 ? 'solid' : 'outline'} disabled={!n}
                            onClick={() => run({ title: `Quiz: ${q.title}`, exercises: q.build(ctx), exam: true, quizId: q.id })}>
                            {q.title} ({n} {q.sizeLabel})
                            {best != null && <Badge size="sm" variant="subtle" colorPalette="purple">best {best}%</Badge>}
                          </Button>
                        );
                      })}
                    </Flex>
                  </Box>

                  {level.review && level.review.available(ctx) && (
                    <Flex p={3} gap={3} align="center" borderRadius="lg" bg="var(--surface-muted)" border="1px solid" borderColor="var(--border-color)">
                      <Box flex={1}>
                        <Text fontSize="sm" fontWeight={600} color={due ? 'var(--panel-purple-text)' : 'var(--muted-text)'}>
                          {due ? `${due} due for review` : 'Nothing due right now'}
                        </Text>
                        <Text fontSize="sm" color="var(--muted-text)">{level.review.blurb}</Text>
                      </Box>
                      <Button size="sm" colorPalette="purple" variant={due ? 'solid' : 'outline'} onClick={() => run({ title: 'Review', exercises: level.review!.build(ctx) })}>
                        <RotateCcw size={14} /> Review
                      </Button>
                    </Flex>
                  )}

                  {confusedPairs.length > 0 && (
                    <Box p={3} borderRadius="lg" bg="var(--panel-orange-bg)" border="1px solid" borderColor="var(--panel-orange-border)">
                      <Flex align="center" gap={3} mb={2}>
                        <Text flex={1} fontSize="sm" fontWeight={600} color="var(--panel-orange-text)">
                          Often confused: these now come up more often, and against each other.
                        </Text>
                        {pack.drill && (
                          <Button size="sm" colorPalette="orange"
                            onClick={() => run({ title: 'Confusion drill', exercises: pack.drill!(Array.from(new Set(confusedPairs.flatMap(([a, b]) => [a, b]))), ctx) })}>
                            <Shuffle size={14} /> Drill
                          </Button>
                        )}
                      </Flex>
                      <Grid templateColumns="repeat(auto-fill, minmax(260px, 1fr))" gap={2}>
                        {confusedPairs.map(([a, b, n]) => (
                          <HStack key={`${a}|${b}`} gap={2} align="stretch">
                            <Box flex={1}><DescribedItem d={pack.describe(a)!} tone="plain" /></Box>
                            <VStack gap={0} justify="center"><Text fontSize="xs" color="var(--muted-text)">vs</Text><Text fontSize="10px" color="var(--muted-text)">×{n}</Text></VStack>
                            <Box flex={1}><DescribedItem d={pack.describe(b)!} tone="plain" /></Box>
                          </HStack>
                        ))}
                      </Grid>
                    </Box>
                  )}

                  {level.units.map((u, i) => (
                    <UnitCard
                      key={u.id}
                      title={u.count ? `${u.title} · ${u.count(ctx)}` : u.title}
                      preview={u.preview}
                      done={progress.lessons[u.id] || 0}
                      index={i}
                      small={u.small}
                      perUnit={perUnit}
                      onStart={() => run({ title: u.title, exercises: u.build(ctx), unitId: u.id })}
                      onQuiz={u.quiz ? () => run({ title: `Quiz: ${u.title}`, exercises: u.quiz!.build(ctx), exam: true, quizId: u.quiz!.id }) : undefined}
                    />
                  ))}
                  {level.footnote && <Text fontSize="xs" color="var(--muted-text)">{level.footnote}</Text>}
                </VStack>
              )}
            </Box>
          </>
        )}
      </Box>
    </TrainerContext.Provider>
  );
}
