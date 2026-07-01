import React, { useEffect, useState } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge } from '@chakra-ui/react';
import { useNavigate, Link } from 'react-router-dom';
import { BookOpen, Clock, Library, TrendingUp } from 'lucide-react';
import { recipeAPI, resolveMediaUrl } from '../../services/api';

interface Book {
  id: number;
  title: string;
  author: string;
  cover_path: string | null;
  format: string;
  page_count: number | null;
  genre: string | null;
  language: string | null;
  description: string | null;
  file_id: number | null;
  added_at: string | null;
  progress: number;
  current_page: number;
  status: string;
}

interface OverviewData {
  currently_reading: Book[];
  recently_added: Book[];
  reading_list: Book[];
  stats: {
    total_books: number;
    reading: number;
    completed: number;
    formats: Record<string, number>;
  };
}

function resolveCover(coverPath: string | null | undefined): string | undefined {
  return resolveMediaUrl(coverPath);
}

const BooksOverview: React.FC = () => {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    recipeAPI.request<OverviewData>('/books/overview')
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
    return <Text color="var(--muted-text)">Failed to load books data.</Text>;
  }

  const stats = data.stats || { total_books: 0, reading: 0, completed: 0, formats: {} };

  return (
    <VStack gap={8} align="stretch" p={4}>
      <HStack>
        <BookOpen size={24} color="var(--icon-color)" />
        <Heading size="lg" color="var(--heading-color)">Books</Heading>
      </HStack>

      <Grid templateColumns="repeat(auto-fit, minmax(140px, 1fr))" gap={4}>
        <StatCard icon={<Library size={18} />} label="Total Books" value={stats.total_books} />
        <StatCard icon={<BookOpen size={18} />} label="Reading" value={stats.reading} />
        <StatCard icon={<TrendingUp size={18} />} label="Completed" value={stats.completed} />
      </Grid>

      {data.currently_reading.length > 0 && (
        <Box>
          <HStack mb={4} justify="space-between">
            <Heading size="md" color="var(--heading-color)">Currently Reading</Heading>
          </HStack>
          <Grid templateColumns="repeat(auto-fill, minmax(200px, 1fr))" gap={4}>
            {data.currently_reading.map(book => (
              <ReadingCard key={book.id} book={book} />
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
              onClick={() => navigate('/books/library')}
            >
              View All
            </Text>
          </HStack>
          <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
            {data.recently_added.map(book => (
              <BookCard key={book.id} book={book} />
            ))}
          </Grid>
        </Box>
      )}

      {data.reading_list.length > 0 && (
        <Box>
          <HStack mb={4}>
            <Heading size="md" color="var(--heading-color)">Reading List</Heading>
          </HStack>
          <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
            {data.reading_list.map(book => (
              <BookCard key={book.id} book={book} />
            ))}
          </Grid>
        </Box>
      )}

      {data.currently_reading.length === 0 && data.recently_added.length === 0 && data.reading_list.length === 0 && (
        <Flex justify="center" py={12}>
          <VStack gap={3}>
            <BookOpen size={48} color="var(--muted-text)" />
            <Text color="var(--muted-text)">
              No books in your library yet. Configure folders in Settings → Books Library.
            </Text>
          </VStack>
        </Flex>
      )}
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

const ReadingCard: React.FC<{ book: Book }> = ({ book }) => {
  const cover = resolveCover(book.cover_path);
  const progressPct = book.page_count && book.page_count > 0
    ? Math.round((book.current_page / book.page_count) * 100)
    : book.progress;

  return (
    <Box
      as={Link}
      to={`/books/detail/${book.id}`}
      borderRadius="lg"
      overflow="hidden"
      border="1px solid"
      borderColor="var(--border-color)"
      bg="var(--card-bg)"
      transition="transform 0.2s, box-shadow 0.2s"
      _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <HStack gap={0} align="stretch">
        {cover ? (
          <Box
            w="100px"
            minH="140px"
            flexShrink={0}
            bgImage={`url(${cover})`}
            bgSize="cover"
            bgPosition="center"
          />
        ) : (
          <Flex w="100px" minH="140px" flexShrink={0} bg="var(--surface-muted)" align="center" justify="center">
            <BookOpen size={32} color="var(--muted-text)" />
          </Flex>
        )}
        <Box p={3} flex={1} minW={0}>
          <Text fontSize="sm" fontWeight="semibold" lineClamp={2}>{book.title}</Text>
          <Text fontSize="xs" color="var(--muted-text)" mt={1}>{book.author}</Text>
          <Badge colorPalette="blue" fontSize="2xs" mt={2}>{book.format}</Badge>
          <Box mt={3}>
            <HStack justify="space-between" mb={1}>
              <Text fontSize="xs" color="var(--muted-text)">Progress</Text>
              <Text fontSize="xs" fontWeight="bold">{progressPct}%</Text>
            </HStack>
            <Box w="100%" h="4px" bg="var(--surface-muted)" borderRadius="full" overflow="hidden">
              <Box h="100%" w={`${progressPct}%`} bg="blue.500" borderRadius="full" transition="width 0.3s" />
            </Box>
            {book.page_count && (
              <Text fontSize="2xs" color="var(--muted-text)" mt={1}>
                Page {book.current_page} of {book.page_count}
              </Text>
            )}
          </Box>
        </Box>
      </HStack>
    </Box>
  );
};

const BookCard: React.FC<{ book: Book }> = ({ book }) => {
  const cover = resolveCover(book.cover_path);

  return (
    <Box
      as={Link}
      to={`/books/detail/${book.id}`}
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
        <Box
          w="100%"
          h="220px"
          bgImage={`url(${cover})`}
          bgSize="cover"
          bgPosition="center"
        />
      ) : (
        <Flex w="100%" h="220px" bg="var(--surface-muted)" align="center" justify="center">
          <BookOpen size={48} color="var(--muted-text)" />
        </Flex>
      )}
      <Box p={3}>
        <Text fontSize="sm" fontWeight="semibold" lineClamp={2}>{book.title}</Text>
        <Text fontSize="xs" color="var(--muted-text)" mt={1}>{book.author}</Text>
        <HStack gap={2} mt={2} flexWrap="wrap">
          <Badge colorPalette="gray" fontSize="2xs">{book.format}</Badge>
          {book.page_count && <Text fontSize="xs" color="var(--muted-text)">{book.page_count} pages</Text>}
        </HStack>
      </Box>
    </Box>
  );
};

export default BooksOverview;
