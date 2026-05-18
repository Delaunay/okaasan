import React, { useEffect, useState } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Image } from '@chakra-ui/react';
import { useNavigate, Link } from 'react-router-dom';
import { Layers, BookOpen, Clock, Library } from 'lucide-react';
import { recipeAPI, resolveMediaUrl } from '../../services/api';

interface ComicSeries {
  id: number;
  title: string;
  cover_url: string | null;
  issue_count: number;
  comic_type: string;
  last_read_issue?: number;
  read_progress?: number;
}

interface OverviewData {
  continue_reading: ComicSeries[];
  recently_added: ComicSeries[];
  stats: {
    total_series: number;
    total_issues: number;
    total_read: number;
  };
}

function resolveCover(coverUrl: string | null | undefined): string | undefined {
  return resolveMediaUrl(coverUrl);
}

const ComicsOverview: React.FC = () => {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    recipeAPI.request<OverviewData>('/comics/overview')
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
    return <Text color="var(--muted-text)">Failed to load comics data.</Text>;
  }

  const { stats } = data;

  return (
    <VStack gap={8} align="stretch" p={4}>
      <HStack>
        <Layers size={24} />
        <Heading size="lg" color="var(--heading-color)">Comics &amp; Manga</Heading>
      </HStack>

      <Grid templateColumns="repeat(auto-fit, minmax(140px, 1fr))" gap={4}>
        <StatCard icon={<Library size={18} />} label="Series" value={stats.total_series} />
        <StatCard icon={<Layers size={18} />} label="Issues" value={stats.total_issues} />
        <StatCard icon={<BookOpen size={18} />} label="Read" value={stats.total_read} />
      </Grid>

      {data.continue_reading.length > 0 && (
        <Box>
          <HStack mb={4} justify="space-between">
            <HStack>
              <Clock size={20} />
              <Heading size="md" color="var(--heading-color)">Continue Reading</Heading>
            </HStack>
            <Text
              fontSize="sm"
              color="var(--icon-color)"
              cursor="pointer"
              onClick={() => navigate('/comics-library')}
            >
              View All
            </Text>
          </HStack>
          <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
            {data.continue_reading.map((series) => (
              <ComicCard key={series.id} series={series} />
            ))}
          </Grid>
        </Box>
      )}

      <Box>
        <HStack mb={4} justify="space-between">
          <HStack>
            <Layers size={20} />
            <Heading size="md" color="var(--heading-color)">Recently Added</Heading>
          </HStack>
          <Text
            fontSize="sm"
            color="var(--icon-color)"
            cursor="pointer"
            onClick={() => navigate('/comics-library')}
          >
            View All
          </Text>
        </HStack>
        {data.recently_added.length > 0 ? (
          <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
            {data.recently_added.map((series) => (
              <ComicCard key={series.id} series={series} />
            ))}
          </Grid>
        ) : (
          <Text color="var(--muted-text)" fontSize="sm">
            No comics in library yet. Configure folders in Settings.
          </Text>
        )}
      </Box>
    </VStack>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: number }> = ({ icon, label, value }) => (
  <Box
    p={4}
    borderRadius="lg"
    border="1px solid"
    borderColor="var(--border-color)"
    bg="var(--card-bg)"
    textAlign="center"
  >
    <Flex justify="center" mb={2} color="var(--icon-color)">{icon}</Flex>
    <Text fontSize="2xl" fontWeight="bold">{value.toLocaleString()}</Text>
    <Text fontSize="xs" color="var(--muted-text)">{label}</Text>
  </Box>
);

const ComicCard: React.FC<{ series: ComicSeries }> = ({ series }) => {
  const cover = resolveCover(series.cover_url);

  return (
    <Box
      as={Link}
      to={`/comics-detail/${series.id}`}
      borderRadius="lg"
      overflow="hidden"
      border="1px solid"
      borderColor="var(--border-color)"
      bg="var(--card-bg)"
      transition="transform 0.2s, box-shadow 0.2s"
      _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      {cover ? (
        <Image src={cover} alt={series.title} w="100%" h="220px" objectFit="cover" loading="lazy" />
      ) : (
        <Box
          w="100%"
          h="220px"
          bg="var(--surface-muted)"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Layers size={48} color="var(--muted-text)" />
        </Box>
      )}
      <Box p={3}>
        <Text fontSize="sm" fontWeight="semibold" lineClamp={2}>{series.title}</Text>
        <HStack gap={2} mt={1} flexWrap="wrap">
          <Badge colorPalette="gray" fontSize="2xs">{series.issue_count} issues</Badge>
          <Badge colorPalette={series.comic_type === 'manga' ? 'purple' : 'blue'} fontSize="2xs">
            {series.comic_type === 'manga' ? 'Manga' : 'Comic'}
          </Badge>
        </HStack>
        {series.read_progress != null && series.read_progress > 0 && (
          <Box mt={2} h="3px" bg="var(--border-color)" borderRadius="full" overflow="hidden">
            <Box h="100%" w={`${series.read_progress}%`} bg="blue.500" borderRadius="full" />
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default ComicsOverview;
