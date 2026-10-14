import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Badge, Button, Flex, Grid, Heading, HStack, Input, Text, VStack,
} from '@chakra-ui/react';
import { CheckCircle2, Circle, Save } from 'lucide-react';
import { jsonStore, isStaticMode } from '../../services/jsonstore';

// Plan distilled from the Tiffy Cooks blogging guide
// (https://tiffycooks.com/tiffycooks-blogging-guide/ and the articles it links).
// Phase week ranges are a schedule derived from her numbers (100-day challenge,
// "<1 hour" setup, 1 post/week, "minimum 6 months" per platform, 4 months
// juggling job + blog), not dates she prescribes.

const COLLECTION = 'blog-plan';
const KEY = 'progress';

interface Step {
  id: string;
  text: string;
  /** Target week, relative to the plan start. */
  week: number;
  detail?: string;
}

interface Phase {
  id: string;
  label: string;
  start: number;
  weeks: number;
  color: string;
  bg: string;
  border: string;
  steps: Step[];
}

const PHASES: Phase[] = [
  {
    id: 'prove',
    label: 'Prove it',
    start: 0,
    weeks: 15,
    color: 'var(--panel-green-text)',
    bg: 'var(--panel-green-bg)',
    border: 'var(--panel-green-border)',
    steps: [
      { id: 'niche', week: 0, text: 'Pick the niche you already practise', detail: 'Hers came from 11 years of cooking for herself' },
      { id: 'notebook', week: 0, text: 'Start an ideas notebook' },
      { id: 'challenge', week: 0, text: 'Start a 100-day challenge on a private Instagram', detail: 'One high-quality post per day' },
      { id: 'challenge-mid', week: 7, text: 'Day 50 check: still motivated?' },
      { id: 'challenge-end', week: 14, text: 'Finish day 100', detail: 'Go on only if it energised you rather than drained you' },
    ],
  },
  {
    id: 'setup',
    label: 'Set up the blog',
    start: 15,
    weeks: 1,
    color: 'var(--panel-blue-text)',
    bg: 'var(--panel-blue-bg)',
    border: 'var(--panel-blue-border)',
    steps: [
      { id: 'host', week: 15, text: 'Buy hosting', detail: 'Bluehost Choice Plus (~$4/month, free domain year 1, SSL), or SiteGround / DreamHost' },
      { id: 'domain', week: 15, text: 'Register a short, memorable .com domain' },
      { id: 'wordpress', week: 15, text: 'Install self-hosted WordPress (wordpress.org)', detail: 'Self-hosting is required for Mediavine / AdThrive ads' },
      { id: 'theme', week: 15, text: 'Install a theme', detail: '17th Avenue (she uses MIA Professional), an Etsy theme, or a free one' },
      { id: 'plugins', week: 15, text: 'Install plugins: Yoast (SEO), WP Recipe Maker' },
      { id: 'first-post', week: 15, text: 'Publish the first post' },
    ],
  },
  {
    id: 'publish',
    label: 'Publish weekly',
    start: 15,
    weeks: 26,
    color: 'var(--panel-teal-text)',
    bg: 'var(--panel-teal-bg)',
    border: 'var(--panel-teal-border)',
    steps: [
      { id: 'cadence', week: 16, text: 'Publish at least one post per week', detail: 'Plan 3–4 hours per post' },
      { id: 'calendar', week: 16, text: 'Map content one month in advance' },
      { id: 'sunday', week: 16, text: 'Plan every Sunday night', detail: 'What goes live, what to film, what to test' },
      { id: 'buffer', week: 20, text: 'Build a 1.5-week filming buffer' },
      { id: 'pbp', week: 20, text: 'Take a course (Food Blogger Pro)' },
      { id: 'six-months', week: 41, text: 'Six-month review before judging results' },
    ],
  },
  {
    id: 'distribute',
    label: 'Distribute',
    start: 17,
    weeks: 24,
    color: 'var(--panel-purple-text)',
    bg: 'var(--panel-purple-bg)',
    border: 'var(--panel-purple-border)',
    steps: [
      { id: 'one-platform', week: 17, text: 'Pick one short-video platform and commit to it', detail: 'Her first TikTok got 40K views overnight' },
      { id: 'series', week: 17, text: 'Run a 21-day themed series', detail: 'e.g. dinner ideas, street food, 15-minute meals' },
      { id: 'three-week', week: 20, text: 'Post recipes at least 3× per week' },
      { id: 'captions', week: 17, text: 'Caption and edit videos', detail: 'MixCaptions, InShot' },
      { id: 'pinterest', week: 24, text: 'Schedule Pinterest with Tailwind' },
      { id: 'engage', week: 17, text: 'Reply to comments and DMs after each post' },
    ],
  },
  {
    id: 'monetize',
    label: 'Monetize',
    start: 28,
    weeks: 24,
    color: 'var(--panel-orange-text)',
    bg: 'var(--panel-orange-bg)',
    border: 'var(--panel-orange-border)',
    steps: [
      { id: 'ads', week: 28, text: 'Apply to an ad network', detail: 'AdSense first, then Mediavine / AdThrive' },
      { id: 'media-kit', week: 30, text: 'Make a media kit in Canva for brand deals' },
      { id: 'affiliate', week: 32, text: 'Add affiliate links to recommended gear' },
      { id: 'ebook', week: 40, text: 'Sell an e-cookbook through WooCommerce' },
      { id: 'merch', week: 48, text: 'Add merchandise' },
    ],
  },
  {
    id: 'scale',
    label: 'Go full-time',
    start: 41,
    weeks: 17,
    color: 'var(--panel-red-text)',
    bg: 'var(--panel-red-bg)',
    border: 'var(--panel-red-border)',
    steps: [
      { id: 'juggle', week: 41, text: 'Run the job and the blog side by side', detail: 'She did four months' },
      { id: 'stable', week: 52, text: 'Leave when the blog is the most stable income' },
      { id: 'schedule', week: 52, text: 'Switch to the weekly rhythm below' },
      { id: 'contractor', week: 54, text: 'Hire a part-time contractor for technical work', detail: '~$65/hour' },
      { id: 'upgrade-host', week: 56, text: 'Move to SiteGround when traffic grows' },
    ],
  },
];

const ALL_STEPS = PHASES.flatMap((p) => p.steps.map((s) => ({ ...s, phase: p })));
const TOTAL_WEEKS = Math.max(...PHASES.map((p) => p.start + p.weeks));

const HER_TIMELINE: { when: string; what: string; tag?: string }[] = [
  { when: 'University', what: 'Moves to a town with no Asian food; learns to cook from YouTube and food blogs' },
  { when: '~11 years', what: 'Keeps cooking; starts and abandons at least 5 blogs' },
  { when: '3 years', what: 'Sales consultant at a large tech company: email, discipline, branding, negotiation' },
  { when: 'Pre-launch', what: '100-day challenge on a private Instagram account' },
  { when: 'May 2020', what: 'TiffyCooks blog live', tag: 'launch' },
  { when: 'Sep 3, 2020', what: 'First TikTok recipe: 40K views overnight; 21-day themed series, 3 recipes/week', tag: 'launch' },
  { when: '+4 months', what: 'Quits the corporate job after juggling both', tag: 'full-time' },
  { when: 'Dec 2020', what: 'Five figures per month ($17–22K gross)', tag: 'income' },
  { when: 'Oct 2021', what: '$45–55K per month gross', tag: 'income' },
];

const INCOME_MIX = [
  { label: 'Website ads', pct: 50, color: 'var(--panel-orange-text)' },
  { label: 'Brand deals', pct: 35, color: 'var(--panel-blue-text)' },
  { label: 'Merchandise', pct: 10, color: 'var(--panel-purple-text)' },
  { label: 'Affiliate', pct: 5, color: 'var(--panel-teal-text)' },
];

const WEEK: { day: string; work: string; half?: boolean; off?: boolean }[] = [
  { day: 'Mon', work: 'Admin + meetings' },
  { day: 'Tue', work: 'Filming + blogging' },
  { day: 'Wed', work: 'Admin + recipe testing' },
  { day: 'Thu', work: 'Filming + blogging' },
  { day: 'Fri', work: 'Meetings', half: true },
  { day: 'Sat', work: 'Filming', half: true },
  { day: 'Sun', work: 'Off · plan the week at night', off: true },
];

const FILMING_DAY: [string, string][] = [
  ['10–11', 'Calls, email'],
  ['11–12', 'Post on IG + TikTok, reply'],
  ['12:30–1', 'Set up station'],
  ['1–4', 'Film'],
  ['4–5', 'Clean up'],
  ['5–6', 'IG post + engagement'],
  ['8–10', 'Edit, brand deliverables'],
  ['10–12', 'Blog posts, newsletter'],
];

interface Progress {
  start: string;
  done: string[];
}

function addWeeks(iso: string, weeks: number): Date {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}

function currentWeek(start: string): number {
  const ms = Date.now() - new Date(`${start}T00:00:00`).getTime();
  return Math.floor(ms / (7 * 24 * 3600 * 1000));
}

// ── Gantt ──────────────────────────────────────────────────

const LABEL_W = 110;
const ROW_H = 22;
const MIN_CHART_W = 560;

const Gantt: React.FC<{
  start: string;
  done: Set<string>;
  selected: string;
  onSelect: (id: string) => void;
}> = ({ start, done, selected, onSelect }) => {
  // Drawn in real pixels (no viewBox scaling) so text stays small on wide screens.
  const boxRef = useRef<HTMLDivElement>(null);
  const [chartW, setChartW] = useState(760);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setChartW(Math.max(MIN_CHART_W, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const plotW = chartW - LABEL_W - 10;
  const x = (w: number) => LABEL_W + (w / TOTAL_WEEKS) * plotW;
  const height = PHASES.length * ROW_H + 26;
  const now = currentWeek(start);
  const ticks = Array.from({ length: Math.floor(TOTAL_WEEKS / 4) + 1 }, (_, i) => i * 4);

  return (
    <Box border="1px solid" borderColor="var(--border-color)" borderRadius="lg" bg="var(--surface-muted)" p={2} overflowX="auto">
      <Box ref={boxRef} w="100%" />
      <svg width={chartW} height={height} style={{ display: 'block' }}>
        {ticks.map((w) => (
          <g key={w}>
            <line x1={x(w)} x2={x(w)} y1={0} y2={height - 18} stroke="var(--border-color)" strokeWidth={1} />
            <text x={x(w)} y={height - 6} textAnchor="middle" fontSize="9" fill="var(--muted-text)">
              {w % 8 === 0 ? fmtDate(addWeeks(start, w)) : ''}
            </text>
          </g>
        ))}
        {PHASES.map((p, i) => {
          const y = i * ROW_H + 2;
          const n = p.steps.length;
          const k = p.steps.filter((s) => done.has(s.id)).length;
          const isSel = selected === p.id;
          const w = Math.max(x(p.start + p.weeks) - x(p.start), 6);
          return (
            <g key={p.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(p.id)}>
              <text x={4} y={y + ROW_H / 2} fontSize="11" fontWeight={isSel ? '700' : '600'} fill={p.color} dominantBaseline="middle">
                {p.label}
              </text>
              <rect x={x(p.start)} y={y + 5} width={w} height={ROW_H - 10} rx={3} fill={p.bg} stroke={isSel ? p.color : p.border} strokeWidth={isSel ? 2 : 1} />
              <rect x={x(p.start)} y={y + 5} width={w * (k / n)} height={ROW_H - 10} rx={3} fill={p.color} opacity={0.35} />
              {p.steps.map((s) => (
                <circle
                  key={s.id}
                  cx={x(s.week) + (s.week === p.start ? 5 : 0)}
                  cy={y + ROW_H / 2}
                  r={2.5}
                  fill={done.has(s.id) ? p.color : 'var(--card-bg)'}
                  stroke={p.color}
                  strokeWidth={1.2}
                >
                  <title>{`${s.text} · ${fmtDate(addWeeks(start, s.week))}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {now >= 0 && now <= TOTAL_WEEKS && (
          <g>
            <line x1={x(now)} x2={x(now)} y1={0} y2={height - 18} stroke="var(--panel-red-text)" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={x(now) + 3} y={10} fontSize="9" fontWeight="700" fill="var(--panel-red-text)">today</text>
          </g>
        )}
      </svg>
    </Box>
  );
};

// ── Page ───────────────────────────────────────────────────

const BlogPlan: React.FC = () => {
  const [progress, setProgress] = useState<Progress>({ start: new Date().toISOString().slice(0, 10), done: [] });
  const [selected, setSelected] = useState(PHASES[0].id);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    jsonStore.get<Progress>(COLLECTION, KEY)
      .then((p) => setProgress((prev) => ({ start: p.start || prev.start, done: p.done || [] })))
      .catch(() => { });
  }, []);

  const done = useMemo(() => new Set(progress.done), [progress.done]);
  const phase = PHASES.find((p) => p.id === selected) || PHASES[0];
  const now = currentWeek(progress.start);

  const toggle = (id: string) => {
    if (isStaticMode) return;
    setProgress((p) => ({ ...p, done: done.has(id) ? p.done.filter((d) => d !== id) : [...p.done, id] }));
    setDirty(true);
  };

  const save = async () => {
    try {
      await jsonStore.put(COLLECTION, KEY, progress);
      setDirty(false);
      setStatus('Saved');
    } catch {
      setStatus('Save failed');
    }
    setTimeout(() => setStatus(null), 2000);
  };

  const upcoming = ALL_STEPS
    .filter((s) => !done.has(s.id))
    .sort((a, b) => a.week - b.week)
    .slice(0, 5);

  return (
    <Box h="100%" display="flex" flexDirection="column" bg="var(--card-bg)">
      <Flex px={4} py={3} borderBottom="1px solid" borderColor="var(--border-color)" align="center" gap={3} wrap="wrap">
        <Heading size="lg" color="var(--heading-color)" flex={1}>Blog Plan</Heading>
        <Badge variant="subtle" colorPalette="green">{done.size}/{ALL_STEPS.length} steps</Badge>
        <HStack gap={2}>
          <Text fontSize="xs" color="var(--muted-text)">Start</Text>
          <Input
            size="sm"
            type="date"
            w="150px"
            value={progress.start}
            disabled={isStaticMode}
            onChange={(e) => { setProgress((p) => ({ ...p, start: e.target.value })); setDirty(true); }}
            bg="var(--input-bg)"
            borderColor="var(--border-color)"
          />
        </HStack>
        {!isStaticMode && (
          <Button size="sm" colorPalette="blue" onClick={save} disabled={!dirty}>
            <Save size={14} /> Save
          </Button>
        )}
        {status && <Text fontSize="sm" color={status === 'Saved' ? 'green.500' : 'red.400'}>{status}</Text>}
        {dirty && !status && <Text fontSize="xs" color="orange.400">unsaved changes</Text>}
      </Flex>

      <Box flex={1} overflow="auto" p={4}>
        <VStack align="stretch" gap={5}>
          <Gantt start={progress.start} done={done} selected={phase.id} onSelect={setSelected} />

          <Flex direction={{ base: 'column', lg: 'row' }} gap={5} align="stretch">
            {/* Phase steps */}
            <Box flex={{ lg: '1 1 60%' }} minW={0} p={5} borderRadius="xl" border="1px solid" borderColor={phase.border} bg={phase.bg}>
              <HStack justify="space-between" mb={1} flexWrap="wrap">
                <Heading size="md" color={phase.color}>{phase.label}</Heading>
                <Text fontSize="xs" color="var(--muted-text)">
                  {fmtDate(addWeeks(progress.start, phase.start))} → {fmtDate(addWeeks(progress.start, phase.start + phase.weeks))}
                </Text>
              </HStack>
              <Flex gap={1} mb={4} flexWrap="wrap">
                {PHASES.map((p) => (
                  <Button
                    key={p.id}
                    size="xs"
                    variant={p.id === phase.id ? 'solid' : 'outline'}
                    colorPalette={p.id === phase.id ? 'blue' : undefined}
                    onClick={() => setSelected(p.id)}
                  >
                    {p.label} {p.steps.filter((s) => done.has(s.id)).length}/{p.steps.length}
                  </Button>
                ))}
              </Flex>
              <VStack align="stretch" gap={2}>
                {phase.steps.map((s) => {
                  const isDone = done.has(s.id);
                  const late = !isDone && now > s.week;
                  return (
                    <HStack
                      key={s.id}
                      align="flex-start"
                      gap={3}
                      p={2}
                      borderRadius="md"
                      bg="var(--card-bg)"
                      border="1px solid"
                      borderColor="var(--border-color)"
                      cursor={isStaticMode ? 'default' : 'pointer'}
                      onClick={() => toggle(s.id)}
                    >
                      <Box pt="2px" color={isDone ? phase.color : 'var(--empty-text)'} flexShrink={0}>
                        {isDone ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                      </Box>
                      <Box flex="1" minW={0}>
                        <Text
                          fontSize="sm"
                          fontWeight="500"
                          color={isDone ? 'var(--muted-text)' : 'var(--heading-color)'}
                          textDecoration={isDone ? 'line-through' : undefined}
                        >
                          {s.text}
                        </Text>
                        {s.detail && <Text fontSize="xs" color="var(--muted-text)">{s.detail}</Text>}
                      </Box>
                      <Text fontSize="2xs" fontFamily="mono" color={late ? 'var(--panel-red-text)' : 'var(--muted-text)'} whiteSpace="nowrap">
                        {fmtDate(addWeeks(progress.start, s.week))}
                      </Text>
                    </HStack>
                  );
                })}
              </VStack>
            </Box>

            {/* Next up */}
            <Box flex={{ lg: '1 1 40%' }} minW={0} p={4} borderRadius="lg" border="1px solid" borderColor="var(--border-color)">
              <Heading size="sm" color="var(--heading-color)" mb={3}>Next up</Heading>
              <VStack align="stretch" gap={2}>
                {upcoming.map((s) => (
                  <HStack key={s.id} gap={2} cursor="pointer" onClick={() => setSelected(s.phase.id)} align="flex-start">
                    <Box w="8px" h="8px" mt="6px" borderRadius="full" bg={s.phase.color} flexShrink={0} />
                    <Text fontSize="sm" flex="1" color="var(--heading-color)">{s.text}</Text>
                    <Text fontSize="2xs" fontFamily="mono" color={now > s.week ? 'var(--panel-red-text)' : 'var(--muted-text)'} whiteSpace="nowrap">
                      {fmtDate(addWeeks(progress.start, s.week))}
                    </Text>
                  </HStack>
                ))}
                {upcoming.length === 0 && <Text fontSize="sm" color="var(--empty-text)">All done.</Text>}
              </VStack>

              <Heading size="sm" color="var(--heading-color)" mt={6} mb={2}>Income mix · Oct 2021</Heading>
              <Flex h="14px" borderRadius="full" overflow="hidden">
                {INCOME_MIX.map((m) => <Box key={m.label} w={`${m.pct}%`} bg={m.color} />)}
              </Flex>
              <Flex gap={3} mt={2} flexWrap="wrap">
                {INCOME_MIX.map((m) => (
                  <HStack key={m.label} gap={1}>
                    <Box w="8px" h="8px" borderRadius="full" bg={m.color} />
                    <Text fontSize="2xs" color="var(--muted-text)">{m.label} {m.pct}%</Text>
                  </HStack>
                ))}
              </Flex>
            </Box>
          </Flex>

          <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={5}>
            {/* Her timeline */}
            <Box p={4} borderRadius="lg" border="1px solid" borderColor="var(--border-color)">
              <Heading size="sm" color="var(--heading-color)" mb={4}>Tiffy Cooks timeline</Heading>
              <VStack align="stretch" gap={0}>
                {HER_TIMELINE.map((t, i) => {
                  const color = t.tag === 'income'
                    ? 'var(--panel-orange-text)'
                    : t.tag === 'full-time'
                      ? 'var(--panel-red-text)'
                      : t.tag === 'launch'
                        ? 'var(--panel-purple-text)'
                        : 'var(--muted-text)';
                  return (
                    <HStack key={i} align="stretch" gap={3}>
                      <Text fontSize="xs" fontFamily="mono" color="var(--muted-text)" w="84px" textAlign="right" pt="1px" flexShrink={0}>
                        {t.when}
                      </Text>
                      <Flex direction="column" align="center" flexShrink={0}>
                        <Box w="10px" h="10px" mt="4px" borderRadius="full" bg={color} />
                        {i < HER_TIMELINE.length - 1 && <Box w="2px" flex="1" bg="var(--border-color)" />}
                      </Flex>
                      <Text fontSize="sm" color="var(--heading-color)" pb={3}>{t.what}</Text>
                    </HStack>
                  );
                })}
              </VStack>
            </Box>

            {/* Weekly rhythm */}
            <Box p={4} borderRadius="lg" border="1px solid" borderColor="var(--border-color)">
              <Heading size="sm" color="var(--heading-color)" mb={3}>Full-time week</Heading>
              <Grid templateColumns="repeat(7, 1fr)" gap={1} mb={5}>
                {WEEK.map((d) => (
                  <Box
                    key={d.day}
                    p={2}
                    borderRadius="md"
                    border="1px solid"
                    borderColor="var(--border-color)"
                    bg={d.off ? 'var(--surface-muted)' : 'var(--card-bg)'}
                    minH="88px"
                  >
                    <Text fontSize="xs" fontWeight="700" color="var(--heading-color)">{d.day}</Text>
                    <Text fontSize="2xs" color={d.off ? 'var(--empty-text)' : 'var(--heading-color)'} mt={1}>{d.work}</Text>
                    {d.half && <Badge size="xs" variant="subtle" mt={1}>½ day</Badge>}
                  </Box>
                ))}
              </Grid>
              <Heading size="xs" color="var(--muted-text)" mb={2}>Filming day</Heading>
              <VStack align="stretch" gap={1}>
                {FILMING_DAY.map(([time, task]) => (
                  <HStack key={time} gap={3}>
                    <Text fontSize="xs" fontFamily="mono" color="var(--muted-text)" w="64px">{time}</Text>
                    <Text fontSize="sm" color="var(--heading-color)">{task}</Text>
                  </HStack>
                ))}
              </VStack>
            </Box>
          </Grid>
        </VStack>
      </Box>
    </Box>
  );
};

export default BlogPlan;
