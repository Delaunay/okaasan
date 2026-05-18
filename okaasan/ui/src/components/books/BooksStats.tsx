import React, { useEffect, useState, useMemo } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner } from '@chakra-ui/react';
import { BarChart3, BookOpen, CheckCircle, FileText, Users } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import { VegaProvider } from '../../contexts/VegaContext';
import VegaPlot from '../health/VegaPlot';

interface BooksSummary {
  total_books: number;
  completed: number;
  pages_read: number;
}

interface GenreEntry {
  name: string;
  count: number;
}

interface AuthorEntry {
  name: string;
  count: number;
}

interface ReadingPaceEntry {
  month: string;
  books_completed: number;
}

interface StatsData {
  summary: BooksSummary;
  genres: GenreEntry[];
  authors: AuthorEntry[];
  reading_pace: ReadingPaceEntry[];
}

const BooksStats: React.FC = () => {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    recipeAPI.request<StatsData>('/books/stats')
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  if (!data) {
    return (
      <Flex justify="center" align="center" minH="200px" direction="column" gap={3}>
        <BarChart3 size={48} color="var(--muted-text)" />
        <Text color="var(--muted-text)">No book stats available yet.</Text>
      </Flex>
    );
  }

  const { summary } = data;

  return (
    <VStack gap={8} align="stretch" p={4}>
      <HStack>
        <BarChart3 size={24} color="var(--icon-color)" />
        <Heading size="lg" color="var(--heading-color)">Books Stats</Heading>
      </HStack>

      {/* Summary Cards */}
      <Grid templateColumns="repeat(auto-fit, minmax(140px, 1fr))" gap={4}>
        <StatCard icon={<BookOpen size={18} />} label="Total Books" value={summary.total_books.toLocaleString()} />
        <StatCard icon={<CheckCircle size={18} />} label="Completed" value={summary.completed.toLocaleString()} />
        <StatCard icon={<FileText size={18} />} label="Pages Read" value={summary.pages_read.toLocaleString()} />
      </Grid>

      {/* Charts & Lists */}
      {(data.genres.length > 0 || data.authors.length > 0 || data.reading_pace.length > 0) && (
        <VegaProvider>
          {/* Genres Pie Chart */}
          {data.genres.length > 0 && (
            <Box>
              <Heading size="md" color="var(--heading-color)" mb={3}>Genres</Heading>
              <GenresPieChart genres={data.genres} />
            </Box>
          )}

          {/* Reading Pace Bar Chart */}
          {data.reading_pace.length > 0 && (
            <Box>
              <Heading size="md" color="var(--heading-color)" mb={3}>Reading Pace</Heading>
              <ReadingPaceBarChart pace={data.reading_pace} />
            </Box>
          )}
        </VegaProvider>
      )}

      {/* Top Authors */}
      {data.authors.length > 0 && (
        <Box>
          <Heading size="md" color="var(--heading-color)" mb={3}>Top Authors</Heading>
          <VStack gap={1} align="stretch">
            {data.authors.map((author, i) => (
              <HStack
                key={author.name}
                p={2}
                bg="var(--card-bg)"
                border="1px solid"
                borderColor="var(--border-color)"
                borderRadius="md"
                gap={3}
              >
                <Text fontSize="xs" color="var(--muted-text)" w="24px" textAlign="right">{i + 1}</Text>
                <Box w="28px" h="28px" bg="var(--surface-muted)" borderRadius="full" display="flex" alignItems="center" justifyContent="center" flexShrink={0}>
                  <Users size={12} color="var(--muted-text)" />
                </Box>
                <Box flex={1} minW={0}>
                  <Text fontSize="sm" fontWeight="semibold" lineClamp={1}>{author.name}</Text>
                </Box>
                <Text fontSize="sm" color="var(--muted-text)" fontWeight="medium">
                  {author.count} {author.count === 1 ? 'book' : 'books'}
                </Text>
              </HStack>
            ))}
          </VStack>
        </Box>
      )}
    </VStack>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; subtitle?: string }> = ({ icon, label, value, subtitle }) => (
  <Box
    p={4}
    bg="var(--card-bg)"
    border="1px solid"
    borderColor="var(--border-color)"
    borderRadius="lg"
    textAlign="center"
  >
    <Flex justify="center" mb={2} color="var(--icon-color)">{icon}</Flex>
    <Text fontSize="2xl" fontWeight="bold">{value}</Text>
    <Text fontSize="sm" color="var(--muted-text)">{label}</Text>
    {subtitle && <Text fontSize="2xs" color="var(--muted-text)">{subtitle}</Text>}
  </Box>
);

const GenresPieChart: React.FC<{ genres: GenreEntry[] }> = ({ genres }) => {
  const spec = useMemo(() => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container',
    height: 300,
    data: { values: genres },
    mark: { type: 'arc', innerRadius: 50, tooltip: true },
    encoding: {
      theta: { field: 'count', type: 'quantitative', stack: true },
      color: {
        field: 'name',
        type: 'nominal',
        legend: { title: 'Genre' },
        scale: { scheme: 'tableau20' },
      },
      tooltip: [
        { field: 'name', type: 'nominal', title: 'Genre' },
        { field: 'count', type: 'quantitative', title: 'Count' },
      ],
    },
  }), [genres]);

  return <VegaPlot spec={spec} height="360px" />;
};

const ReadingPaceBarChart: React.FC<{ pace: ReadingPaceEntry[] }> = ({ pace }) => {
  const spec = useMemo(() => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container',
    height: 300,
    data: { values: pace },
    mark: { type: 'bar', tooltip: true, cornerRadiusEnd: 4 },
    encoding: {
      x: { field: 'month', type: 'nominal', axis: { title: 'Month', labelAngle: -45 }, sort: null },
      y: { field: 'books_completed', type: 'quantitative', axis: { title: 'Books Completed' } },
      color: { value: 'var(--icon-color)' },
      tooltip: [
        { field: 'month', type: 'nominal', title: 'Month' },
        { field: 'books_completed', type: 'quantitative', title: 'Books Completed' },
      ],
    },
  }), [pace]);

  return <VegaPlot spec={spec} height="360px" />;
};

export default BooksStats;
