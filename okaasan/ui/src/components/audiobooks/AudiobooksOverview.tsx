import React, { useEffect, useState } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Image } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { Headphones, Clock, BookOpen, Play } from 'lucide-react';
import { recipeAPI, resolveMediaUrl } from '../../services/api';

interface AudiobookSummary {
  id: number;
  title: string;
  author: string;
  narrator: string;
  cover_path: string | null;
  duration_seconds: number;
  progress_seconds: number;
  progress_percent: number;
  chapter_count: number;
  added_at: string;
}

interface OverviewData {
  continue_listening: AudiobookSummary[];
  recently_added: AudiobookSummary[];
  stats: {
    total_books: number;
    in_progress: number;
    completed: number;
    total_listen_time_seconds: number;
  };
}

function formatDuration(seconds: number): string {
  if (!seconds) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function resolveCover(coverPath: string | null | undefined): string | undefined {
  return resolveMediaUrl(coverPath);
}

const AudiobooksOverview: React.FC = () => {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    recipeAPI.request<OverviewData>('/audiobooks/overview')
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
    return <Text color="var(--muted-text)">Failed to load audiobooks data.</Text>;
  }

  const { stats } = data;

  return (
    <VStack gap={8} align="stretch" p={4}>
      <HStack>
        <Headphones size={24} color="var(--icon-color)" />
        <Heading size="lg" color="var(--heading-color)">Audiobooks</Heading>
      </HStack>

      <Grid templateColumns="repeat(auto-fit, minmax(140px, 1fr))" gap={4}>
        <StatCard icon={<BookOpen size={18} />} label="Total Books" value={stats.total_books} />
        <StatCard icon={<Headphones size={18} />} label="In Progress" value={stats.in_progress} />
        <StatCard icon={<Clock size={18} />} label="Completed" value={stats.completed} />
        <StatCard
          icon={<Clock size={18} />}
          label="Listen Time"
          value={formatDuration(stats.total_listen_time_seconds)}
        />
      </Grid>

      {data.continue_listening.length > 0 && (
        <Box>
          <HStack mb={4} justify="space-between">
            <Heading size="md" color="var(--heading-color)">Continue Listening</Heading>
            <Text
              fontSize="sm"
              color="var(--icon-color)"
              cursor="pointer"
              onClick={() => navigate('/audiobooks-library')}
            >
              View All
            </Text>
          </HStack>
          <Grid templateColumns="repeat(auto-fill, minmax(200px, 1fr))" gap={4}>
            {data.continue_listening.map((book) => (
              <ContinueCard key={book.id} book={book} onClick={() => navigate(`/audiobooks-detail/${book.id}`)} />
            ))}
          </Grid>
        </Box>
      )}

      {data.recently_added.length > 0 && (
        <Box>
          <HStack mb={4} justify="space-between">
            <Heading size="md" color="var(--heading-color)">Recently Added</Heading>
            <Text
              fontSize="sm"
              color="var(--icon-color)"
              cursor="pointer"
              onClick={() => navigate('/audiobooks-library')}
            >
              View All
            </Text>
          </HStack>
          <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
            {data.recently_added.map((book) => (
              <BookCard key={book.id} book={book} onClick={() => navigate(`/audiobooks-detail/${book.id}`)} />
            ))}
          </Grid>
        </Box>
      )}

      {data.continue_listening.length === 0 && data.recently_added.length === 0 && (
        <Flex justify="center" py={12} direction="column" align="center" gap={3}>
          <Headphones size={48} color="var(--muted-text)" />
          <Text color="var(--muted-text)">
            No audiobooks yet. Configure folders in Settings to get started.
          </Text>
        </Flex>
      )}
    </VStack>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: number | string }> = ({ icon, label, value }) => (
  <Box
    p={4}
    bg="var(--card-bg)"
    border="1px solid"
    borderColor="var(--border-color)"
    borderRadius="lg"
  >
    <HStack gap={2} mb={1} color="var(--muted-text)">
      {icon}
      <Text fontSize="xs">{label}</Text>
    </HStack>
    <Text fontSize="xl" fontWeight="bold">{value}</Text>
  </Box>
);

const ContinueCard: React.FC<{ book: AudiobookSummary; onClick: () => void }> = ({ book, onClick }) => {
  const cover = resolveCover(book.cover_path);

  return (
    <Box
      borderRadius="lg"
      overflow="hidden"
      border="1px solid"
      borderColor="var(--border-color)"
      bg="var(--card-bg)"
      cursor="pointer"
      onClick={onClick}
      transition="transform 0.2s, box-shadow 0.2s"
      _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
    >
      <Flex>
        {cover ? (
          <Image src={cover} alt={book.title} w="80px" h="120px" objectFit="cover" flexShrink={0} />
        ) : (
          <Box
            w="80px"
            h="120px"
            bg="var(--surface-muted)"
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexShrink={0}
          >
            <Headphones size={28} color="var(--muted-text)" />
          </Box>
        )}
        <Box p={3} flex={1} minW={0}>
          <Text fontSize="sm" fontWeight="semibold" lineClamp={2}>{book.title}</Text>
          <Text fontSize="xs" color="var(--muted-text)" lineClamp={1}>{book.author}</Text>
          <Box mt={2}>
            <Flex justify="space-between" mb={1}>
              <Text fontSize="2xs" color="var(--muted-text)">{Math.round(book.progress_percent)}%</Text>
              <Text fontSize="2xs" color="var(--muted-text)">
                {formatDuration(book.duration_seconds - book.progress_seconds)} left
              </Text>
            </Flex>
            <Box
              w="100%"
              h="4px"
              bg="var(--surface-muted)"
              borderRadius="full"
              overflow="hidden"
            >
              <Box
                h="100%"
                w={`${book.progress_percent}%`}
                bg="var(--icon-color)"
                borderRadius="full"
                transition="width 0.3s"
              />
            </Box>
          </Box>
        </Box>
      </Flex>
    </Box>
  );
};

const BookCard: React.FC<{ book: AudiobookSummary; onClick: () => void }> = ({ book, onClick }) => {
  const cover = resolveCover(book.cover_path);

  return (
    <Box
      borderRadius="lg"
      overflow="hidden"
      border="1px solid"
      borderColor="var(--border-color)"
      bg="var(--card-bg)"
      cursor="pointer"
      onClick={onClick}
      transition="transform 0.2s, box-shadow 0.2s"
      _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
    >
      {cover ? (
        <Image src={cover} alt={book.title} w="100%" h="220px" objectFit="cover" loading="lazy" />
      ) : (
        <Box
          w="100%"
          h="220px"
          bg="var(--surface-muted)"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Headphones size={48} color="var(--muted-text)" />
        </Box>
      )}
      <Box p={3}>
        <Text fontSize="sm" fontWeight="semibold" lineClamp={2}>{book.title}</Text>
        <Text fontSize="xs" color="var(--muted-text)" lineClamp={1}>{book.author}</Text>
        <HStack gap={2} mt={1}>
          <Badge colorPalette="gray" fontSize="2xs">{formatDuration(book.duration_seconds)}</Badge>
          {book.chapter_count > 0 && (
            <Text fontSize="xs" color="var(--muted-text)">{book.chapter_count} ch</Text>
          )}
        </HStack>
      </Box>
    </Box>
  );
};

export default AudiobooksOverview;
