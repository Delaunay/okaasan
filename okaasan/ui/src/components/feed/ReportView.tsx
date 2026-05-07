import { FC, useEffect, useState, useCallback } from 'react';
import { Box, Text, VStack, HStack, Button, Heading, Flex } from '@chakra-ui/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import type { FeedReport, ReportSection } from '../../services/type';
import FeedCard from './FeedCard';

type Period = 'week' | 'month' | 'year';

function shiftDate(iso: string, period: Period, direction: number): string {
  const d = new Date(iso + 'T00:00:00');
  if (period === 'week') d.setDate(d.getDate() + direction * 7);
  else if (period === 'month') d.setMonth(d.getMonth() + direction);
  else d.setFullYear(d.getFullYear() + direction);
  return d.toISOString().slice(0, 10);
}

function formatRange(start: string, end: string, period: Period): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  e.setDate(e.getDate() - 1);

  if (period === 'week') {
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  if (period === 'month') {
    return s.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  return String(s.getFullYear());
}

const SECTION_LABELS: Record<string, string> = {
  recipe: 'Recipes',
  article: 'Articles',
  article_block: 'Article Blocks',
  task: 'Tasks',
  event: 'Events',
  product: 'Products',
  receipt: 'Receipts',
};

interface SectionCardProps {
  entityType: string;
  section: ReportSection;
}

const SectionCard: FC<SectionCardProps> = ({ entityType, section }) => {
  const [expanded, setExpanded] = useState(false);
  const total = section.created + section.updated + section.deleted;
  const label = SECTION_LABELS[entityType] || entityType;

  return (
    <Box
      p={4}
      borderRadius="md"
      border="1px solid"
      borderColor="border.emphasized"
      bg="bg.subtle"
    >
      <Flex
        justify="space-between"
        align="center"
        cursor="pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <VStack align="start" gap={1}>
          <Text fontWeight="700" fontSize="md">
            {label}
          </Text>
          <HStack gap={3} fontSize="xs">
            {section.created > 0 && (
              <Text color="green.500">{section.created} created</Text>
            )}
            {section.updated > 0 && (
              <Text color="blue.500">{section.updated} updated</Text>
            )}
            {section.deleted > 0 && (
              <Text color="red.500">{section.deleted} deleted</Text>
            )}
          </HStack>
        </VStack>
        <Text fontSize="2xl" fontWeight="700" color="orange.500">
          {total}
        </Text>
      </Flex>

      {expanded && section.items.length > 0 && (
        <VStack align="stretch" gap={2} mt={3} pt={3} borderTop="1px solid" borderColor="border.emphasized">
          {section.items.map((entry) => (
            <FeedCard key={entry.id} entry={entry} />
          ))}
        </VStack>
      )}
    </Box>
  );
};

const ReportView: FC = () => {
  const [period, setPeriod] = useState<Period>('week');
  const [refDate, setRefDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<FeedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      const data = await recipeAPI.getFeedReport({ period, date: refDate });
      setReport(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch report:', err);
      setError('Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [period, refDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const navigate = (dir: number) => setRefDate(shiftDate(refDate, period, dir));

  return (
    <Box>
      <Flex gap={3} mb={4} align="center" flexWrap="wrap">
        <HStack gap={1}>
          {(['week', 'month', 'year'] as Period[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? 'solid' : 'outline'}
              colorPalette={period === p ? 'orange' : undefined}
              onClick={() => setPeriod(p)}
              textTransform="capitalize"
            >
              {p}
            </Button>
          ))}
        </HStack>

        <HStack gap={1}>
          <Button size="sm" variant="ghost" onClick={() => navigate(-1)}>
            <ChevronLeft size={16} />
          </Button>
          {report && (
            <Text fontSize="sm" fontWeight="600" minW="160px" textAlign="center">
              {formatRange(report.start, report.end, period)}
            </Text>
          )}
          <Button size="sm" variant="ghost" onClick={() => navigate(1)}>
            <ChevronRight size={16} />
          </Button>
        </HStack>

        <Button
          size="xs"
          variant="outline"
          onClick={() => setRefDate(new Date().toISOString().slice(0, 10))}
        >
          Today
        </Button>
      </Flex>

      {error && (
        <Box p={4} bg="bg.error.subtle" borderRadius="md" border="1px solid" borderColor="border.error" mb={4}>
          <Text color="fg.error">{error}</Text>
        </Box>
      )}

      {loading && (
        <Text fontSize="md" color="fg.muted" textAlign="center" py={8}>
          Loading report...
        </Text>
      )}

      {!loading && report && (
        <>
          <Box
            mb={4}
            p={4}
            borderRadius="md"
            bg="orange.50"
            _dark={{ bg: 'orange.950' }}
            textAlign="center"
          >
            <Text fontSize="3xl" fontWeight="700" color="orange.500">
              {report.total_changes}
            </Text>
            <Text fontSize="sm" color="fg.muted">
              total changes this {period}
            </Text>
          </Box>

          <VStack align="stretch" gap={3}>
            {Object.entries(report.sections).map(([entityType, section]) => (
              <SectionCard
                key={entityType}
                entityType={entityType}
                section={section}
              />
            ))}
          </VStack>

          {Object.keys(report.sections).length === 0 && (
            <Box textAlign="center" py={8}>
              <Text fontSize="md" color="fg.muted">
                No activity during this period
              </Text>
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

export default ReportView;
