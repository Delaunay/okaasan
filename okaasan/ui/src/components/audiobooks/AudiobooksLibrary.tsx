import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Image, Input, Button } from '@chakra-ui/react';
import { Headphones, Play, BookOpen } from 'lucide-react';
import { recipeAPI, resolveMediaUrl } from '../../services/api';
import AudiobooksPlayer from './AudiobooksPlayer';

interface Audiobook {
  id: number;
  title: string;
  author: string;
  narrator: string;
  cover_path: string | null;
  duration_seconds: number;
  progress_seconds: number;
  progress_percent: number;
  chapter_count: number;
  current_chapter: number;
  completed: boolean;
}

interface LibraryResponse {
  books: Audiobook[];
}

type StatusFilter = 'all' | 'in_progress' | 'completed';

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

const FilterChip: React.FC<{ label: string; count: number; active: boolean; onClick: () => void; icon?: React.ReactNode }> = ({
  label, count, active, onClick, icon,
}) => (
  <Box
    px={3}
    py={1.5}
    borderRadius="md"
    cursor="pointer"
    fontWeight={active ? 'bold' : 'normal'}
    bg={active ? 'var(--selected-bg)' : 'transparent'}
    borderWidth="1px"
    borderColor={active ? 'var(--panel-blue-border)' : 'var(--border-color)'}
    onClick={onClick}
    transition="all 0.2s"
    _hover={{ borderColor: 'var(--panel-blue-border)' }}
  >
    <HStack gap={1}>
      {icon}
      <Text fontSize="sm">{label}</Text>
      <Badge colorPalette="gray" fontSize="2xs">{count}</Badge>
    </HStack>
  </Box>
);

const AudiobooksLibrary: React.FC = () => {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Audiobook[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [playerBook, setPlayerBook] = useState<Audiobook | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await recipeAPI.request<LibraryResponse>('/audiobooks/library');
      setBooks(data.books);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const inProgressCount = useMemo(() => books.filter(b => b.progress_seconds > 0 && !b.completed).length, [books]);
  const completedCount = useMemo(() => books.filter(b => b.completed).length, [books]);

  const filtered = useMemo(() => {
    let result = books;
    if (statusFilter === 'in_progress') result = result.filter(b => b.progress_seconds > 0 && !b.completed);
    else if (statusFilter === 'completed') result = result.filter(b => b.completed);
    if (debounced) {
      const q = debounced.toLowerCase();
      result = result.filter(b =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.narrator.toLowerCase().includes(q)
      );
    }
    return result;
  }, [books, debounced, statusFilter]);

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  return (
    <VStack gap={6} align="stretch" p={4}>
      {playerBook && (
        <AudiobooksPlayer
          bookId={playerBook.id}
          onClose={() => { setPlayerBook(null); fetchData(); }}
        />
      )}

      <HStack>
        <Headphones size={24} />
        <Heading size="lg" color="var(--heading-color)">Library</Heading>
        <Badge colorPalette="blue" ml={2}>{books.length} books</Badge>
      </HStack>

      <HStack gap={3} flexWrap="wrap">
        <Input
          placeholder="Search by title, author, narrator..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          maxW="300px"
          size="sm"
        />
        <Box borderRight="1px solid" borderColor="var(--border-color)" h="24px" />
        <FilterChip label="All" count={books.length} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} icon={<BookOpen size={13} />} />
        <FilterChip label="In Progress" count={inProgressCount} active={statusFilter === 'in_progress'} onClick={() => setStatusFilter('in_progress')} icon={<Play size={13} />} />
        <FilterChip label="Completed" count={completedCount} active={statusFilter === 'completed'} onClick={() => setStatusFilter('completed')} icon={<Headphones size={13} />} />
      </HStack>

      <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
        {filtered.map(book => (
          <AudiobookCard
            key={book.id}
            book={book}
            onPlay={(e) => { e.stopPropagation(); setPlayerBook(book); }}
            onClick={() => navigate(`/audiobooks-detail/${book.id}`)}
          />
        ))}
      </Grid>

      {filtered.length === 0 && (
        <Flex justify="center" py={12}>
          <Text color="var(--muted-text)">
            {books.length === 0
              ? 'No audiobooks in library. Configure folders in Settings.'
              : 'No results match your search.'}
          </Text>
        </Flex>
      )}
    </VStack>
  );
};

const AudiobookCard: React.FC<{
  book: Audiobook;
  onPlay: (e: React.MouseEvent) => void;
  onClick: () => void;
}> = ({ book, onPlay, onClick }) => {
  const cover = resolveCover(book.cover_path);

  return (
    <Box
      borderRadius="lg"
      overflow="hidden"
      border="1px solid"
      borderColor="var(--border-color)"
      bg="var(--card-bg)"
      transition="transform 0.2s, box-shadow 0.2s"
      _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
      position="relative"
      cursor="pointer"
      onClick={onClick}
    >
      <Box
        position="absolute"
        top={1}
        right={1}
        zIndex={2}
        onClick={onPlay}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Button
          size="xs"
          variant="ghost"
          p={1}
          minW="auto"
          h="auto"
          borderRadius="full"
          bg="rgba(0,0,0,0.6)"
          color="white"
          _hover={{ bg: 'blue.500' }}
          title="Play"
        >
          <Play size={14} />
        </Button>
      </Box>

      {book.completed && (
        <Box position="absolute" top={1} left={1} zIndex={2}>
          <Badge colorPalette="green" fontSize="2xs" bg="rgba(0,0,0,0.6)" color="green.300">
            Completed
          </Badge>
        </Box>
      )}

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

      {book.progress_percent > 0 && !book.completed && (
        <Box
          position="absolute"
          bottom="auto"
          left={0}
          right={0}
          style={{ top: '220px', transform: 'translateY(-4px)' }}
        >
          <Box w="100%" h="4px" bg="var(--surface-muted)">
            <Box
              h="100%"
              w={`${book.progress_percent}%`}
              bg="var(--icon-color)"
              transition="width 0.3s"
            />
          </Box>
        </Box>
      )}

      <Box p={3}>
        <Text fontSize="sm" fontWeight="semibold" lineClamp={2}>{book.title}</Text>
        <Text fontSize="xs" color="var(--muted-text)" lineClamp={1}>{book.author}</Text>
        <HStack gap={2} mt={1} flexWrap="wrap">
          <Badge colorPalette="gray" fontSize="2xs">{formatDuration(book.duration_seconds)}</Badge>
          {book.narrator && (
            <Text fontSize="xs" color="var(--muted-text)" lineClamp={1}>{book.narrator}</Text>
          )}
        </HStack>
      </Box>
    </Box>
  );
};

export default AudiobooksLibrary;
