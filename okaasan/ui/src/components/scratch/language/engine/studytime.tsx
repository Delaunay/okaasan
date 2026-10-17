// Study time per day (Progress.time): today, this week, and a bar per day for
// the last two weeks. Hovering or tapping a bar shows that day.
import { useState } from 'react';
import { Box, Flex, HStack, Text } from '@chakra-ui/react';
import { Clock } from 'lucide-react';
import { dayStr, formatDuration } from './util';

const DAYS = 14;
const BAR_H = 56;

export function StudyTime({ time }: { time: Record<string, number> }) {
  const [hover, setHover] = useState<number | null>(null);
  const now = new Date();
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (DAYS - 1 - i));
    return { date: d, seconds: time[dayStr(d)] || 0 };
  });
  const max = Math.max(...days.map((d) => d.seconds), 60);
  const today = days[DAYS - 1].seconds;
  // Week from Monday.
  const sinceMonday = (now.getDay() + 6) % 7;
  const week = days.slice(DAYS - 1 - sinceMonday).reduce((n, d) => n + d.seconds, 0);
  const total = Object.values(time).reduce((n, s) => n + s, 0);
  const shown = hover ?? DAYS - 1;
  const label = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <Box p={4} borderRadius="xl" border="1px solid" borderColor="var(--border-color)" bg="var(--surface-muted)">
      <Flex gap={4} align="end" wrap="wrap">
        <Box minW="140px">
          <HStack gap={1} color="var(--muted-text)" fontSize="xs" fontWeight={700} textTransform="uppercase" letterSpacing="wider">
            <Clock size={12} /><Text>Study time</Text>
          </HStack>
          <Text fontSize="3xl" fontWeight={700} lineHeight={1.1} color="var(--heading-color)">{formatDuration(today)}</Text>
          <Text fontSize="xs" color="var(--muted-text)">today</Text>
          <Text fontSize="xs" color="var(--muted-text)" mt={1}>
            {formatDuration(week)} this week · {formatDuration(total)} in all
          </Text>
        </Box>
        <Box flex={1} minW="220px">
          <Text fontSize="xs" color="var(--heading-color)" mb={1} textAlign="right">
            {label(days[shown].date)} · <b>{formatDuration(days[shown].seconds)}</b>
          </Text>
          <Flex h={`${BAR_H}px`} align="end" gap="2px" borderBottom="1px solid" borderColor="var(--border-color)" onMouseLeave={() => setHover(null)}>
            {days.map((d, i) => (
              <Flex key={i} flex={1} h="100%" align="end" cursor="pointer"
                onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}
                aria-label={`${label(d.date)}: ${formatDuration(d.seconds)}`}>
                <Box w="100%" h={d.seconds ? `${Math.max(3, (d.seconds / max) * BAR_H)}px` : 0}
                  borderRadius="4px 4px 0 0" bg="var(--panel-blue-text)"
                  opacity={shown === i ? 1 : 0.55} transition="opacity 0.1s" />
              </Flex>
            ))}
          </Flex>
          <Flex gap="2px" mt={1}>
            {days.map((d, i) => (
              <Text key={i} flex={1} textAlign="center" fontSize="10px" color={i === DAYS - 1 ? 'var(--heading-color)' : 'var(--muted-text)'} fontWeight={i === DAYS - 1 ? 700 : 400}>
                {d.date.toLocaleDateString(undefined, { weekday: 'narrow' })}
              </Text>
            ))}
          </Flex>
        </Box>
      </Flex>
    </Box>
  );
}
