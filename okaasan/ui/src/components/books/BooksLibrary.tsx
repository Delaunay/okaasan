import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Input } from '@chakra-ui/react';
import { BookOpen, FileText, File } from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface Book {
  id: number;
  title: string;
  author: string;
  cover_path: string | null;
  format: string;
  page_count: number | null;
  genre: string | null;
  progress: number;
  current_page: number;
  status: string;
  added_at: string | null;
}

interface LibraryResponse {
  books: Book[];
}

type FormatFilter = 'all' | 'epub' | 'pdf';
type StatusFilter = 'all' | 'reading' | 'completed';

function resolveCover(coverPath: string | null | undefined): string | undefined {
  if (!coverPath) return undefined;
  if (coverPath.startsWith('uploads/')) return `/api/${coverPath}`;
  if (coverPath.startsWith('/uploads/')) return `/api${coverPath}`;
  if (coverPath.startsWith('http')) return coverPath;
  return undefined;
}

const BooksLibrary: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    recipeAPI.request<LibraryResponse>('/books/library')
      .then(data => setBooks(data.books))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const formatCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of books) {
      const fmt = b.format.toLowerCase();
      counts[fmt] = (counts[fmt] || 0) + 1;
    }
    return counts;
  }, [books]);

  const statusCounts = useMemo(() => {
    let reading = 0;
    let completed = 0;
    for (const b of books) {
      if (b.status === 'reading') reading++;
      else if (b.status === 'completed') completed++;
    }
    return { reading, completed };
  }, [books]);

  const filtered = useMemo(() => {
    let result = books;
    if (formatFilter !== 'all') {
      result = result.filter(b => b.format.toLowerCase() === formatFilter);
    }
    if (statusFilter === 'reading') {
      result = result.filter(b => b.status === 'reading');
    } else if (statusFilter === 'completed') {
      result = result.filter(b => b.status === 'completed');
    }
    if (debounced) {
      const q = debounced.toLowerCase();
      result = result.filter(b =>
        b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)
      );
    }
    return result;
  }, [books, debounced, formatFilter, statusFilter]);

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  return (
    <VStack gap={6} align="stretch" p={4}>
      <HStack>
        <BookOpen size={24} color="var(--icon-color)" />
        <Heading size="lg" color="var(--heading-color)">Library</Heading>
        <Badge colorPalette="blue" ml={2}>{books.length} books</Badge>
      </HStack>

      <HStack gap={3} flexWrap="wrap">
        <Input
          placeholder="Search by title or author..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          maxW="300px"
          size="sm"
        />
        <Box borderRight="1px solid" borderColor="var(--border-color)" h="24px" />
        <FilterChip label="All" count={books.length} active={formatFilter === 'all'} onClick={() => setFormatFilter('all')} icon={<BookOpen size={13} />} />
        <FilterChip label="ePub" count={formatCounts['epub'] || 0} active={formatFilter === 'epub'} onClick={() => setFormatFilter('epub')} icon={<FileText size={13} />} />
        <FilterChip label="PDF" count={formatCounts['pdf'] || 0} active={formatFilter === 'pdf'} onClick={() => setFormatFilter('pdf')} icon={<File size={13} />} />
        <Box borderRight="1px solid" borderColor="var(--border-color)" h="24px" />
        <FilterChip label="All" count={books.length} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
        <FilterChip label="Reading" count={statusCounts.reading} active={statusFilter === 'reading'} onClick={() => setStatusFilter('reading')} />
        <FilterChip label="Completed" count={statusCounts.completed} active={statusFilter === 'completed'} onClick={() => setStatusFilter('completed')} />
      </HStack>

      <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
        {filtered.map(book => (
          <LibraryBookCard key={book.id} book={book} />
        ))}
      </Grid>

      {filtered.length === 0 && (
        <Flex justify="center" py={12}>
          <Text color="var(--muted-text)">
            {books.length === 0
              ? 'No books in library. Configure folders in Settings → Books Library.'
              : 'No results match your search.'}
          </Text>
        </Flex>
      )}
    </VStack>
  );
};

const FilterChip: React.FC<{
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}> = ({ label, count, active, onClick, icon }) => (
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

const LibraryBookCard: React.FC<{ book: Book }> = ({ book }) => {
  const cover = resolveCover(book.cover_path);
  const progressPct = book.page_count && book.page_count > 0
    ? Math.round((book.current_page / book.page_count) * 100)
    : book.progress;

  return (
    <Box
      as={Link}
      to={`/books-detail/${book.id}`}
      borderRadius="lg"
      overflow="hidden"
      border="1px solid"
      borderColor="var(--border-color)"
      bg="var(--card-bg)"
      transition="transform 0.2s, box-shadow 0.2s"
      _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
      style={{ textDecoration: 'none', color: 'inherit' }}
      position="relative"
    >
      {book.status === 'reading' && progressPct > 0 && (
        <Box position="absolute" top={1} right={1} zIndex={2}>
          <Badge colorPalette="blue" fontSize="2xs" bg="rgba(0,0,0,0.6)" color="blue.300">
            {progressPct}%
          </Badge>
        </Box>
      )}

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

      {book.status === 'reading' && progressPct > 0 && (
        <Box w="100%" h="3px" bg="var(--surface-muted)">
          <Box h="100%" w={`${progressPct}%`} bg="blue.500" />
        </Box>
      )}

      <Box p={3}>
        <Text fontSize="sm" fontWeight="semibold" lineClamp={2}>{book.title}</Text>
        <Text fontSize="xs" color="var(--muted-text)" mt={1} lineClamp={1}>{book.author}</Text>
        <HStack gap={2} mt={2} flexWrap="wrap">
          <Badge colorPalette={book.format.toLowerCase() === 'epub' ? 'purple' : 'orange'} fontSize="2xs">
            {book.format}
          </Badge>
          {book.page_count && (
            <Text fontSize="xs" color="var(--muted-text)">{book.page_count}p</Text>
          )}
        </HStack>
      </Box>
    </Box>
  );
};

export default BooksLibrary;
