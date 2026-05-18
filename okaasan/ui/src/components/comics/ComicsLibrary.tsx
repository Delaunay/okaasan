import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Image, Input } from '@chakra-ui/react';
import { Layers, BookOpen, Search } from 'lucide-react';
import { recipeAPI, resolveMediaUrl } from '../../services/api';

interface ComicSeries {
  id: number;
  title: string;
  cover_url: string | null;
  issue_count: number;
  comic_type: string;
  author: string | null;
  publisher: string | null;
  year: number | null;
  read_count: number;
}

interface LibraryResponse {
  series: ComicSeries[];
}

type TypeFilter = 'all' | 'comics' | 'manga';

function resolveCover(coverUrl: string | null | undefined): string | undefined {
  return resolveMediaUrl(coverUrl);
}

const ComicsLibrary: React.FC = () => {
  const [allSeries, setAllSeries] = useState<ComicSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await recipeAPI.request<LibraryResponse>('/comics/library');
      setAllSeries(data.series);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const comicsCount = useMemo(() => allSeries.filter(s => s.comic_type !== 'manga').length, [allSeries]);
  const mangaCount = useMemo(() => allSeries.filter(s => s.comic_type === 'manga').length, [allSeries]);

  const filtered = useMemo(() => {
    let result = allSeries;
    if (typeFilter === 'comics') result = result.filter(s => s.comic_type !== 'manga');
    else if (typeFilter === 'manga') result = result.filter(s => s.comic_type === 'manga');
    if (debounced) {
      const q = debounced.toLowerCase();
      result = result.filter(s =>
        s.title.toLowerCase().includes(q) ||
        (s.author && s.author.toLowerCase().includes(q)) ||
        (s.publisher && s.publisher.toLowerCase().includes(q))
      );
    }
    return result;
  }, [allSeries, debounced, typeFilter]);

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
        <Layers size={24} />
        <Heading size="lg" color="var(--heading-color)">Library</Heading>
        <Badge colorPalette="blue" ml={2}>{allSeries.length} series</Badge>
      </HStack>

      <HStack gap={3} flexWrap="wrap">
        <Box position="relative" maxW="300px" flex={1}>
          <Box position="absolute" left={3} top="50%" transform="translateY(-50%)" zIndex={1} color="var(--muted-text)">
            <Search size={14} />
          </Box>
          <Input
            placeholder="Search library..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            size="sm"
            pl={9}
          />
        </Box>
        <Box borderRight="1px solid" borderColor="var(--border-color)" h="24px" />
        <FilterChip label="All" count={allSeries.length} active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} icon={<Layers size={13} />} />
        <FilterChip label="Comics" count={comicsCount} active={typeFilter === 'comics'} onClick={() => setTypeFilter('comics')} icon={<BookOpen size={13} />} />
        <FilterChip label="Manga" count={mangaCount} active={typeFilter === 'manga'} onClick={() => setTypeFilter('manga')} icon={<BookOpen size={13} />} />
      </HStack>

      {filtered.length > 0 ? (
        <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
          {filtered.map(series => (
            <SeriesCard key={series.id} series={series} />
          ))}
        </Grid>
      ) : (
        <Flex justify="center" py={12}>
          <Text color="var(--muted-text)">
            {allSeries.length === 0
              ? 'No comics in library. Configure folders in Settings → Comics & Manga.'
              : 'No results match your search.'}
          </Text>
        </Flex>
      )}
    </VStack>
  );
};

const FilterChip: React.FC<{
  label: string; count: number; active: boolean; onClick: () => void; icon?: React.ReactNode;
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

const SeriesCard: React.FC<{ series: ComicSeries }> = ({ series }) => {
  const cover = resolveCover(series.cover_url);
  const progress = series.issue_count > 0 ? Math.round((series.read_count / series.issue_count) * 100) : 0;

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
          {series.year && <Text fontSize="xs" color="var(--muted-text)">{series.year}</Text>}
          <Badge colorPalette="gray" fontSize="2xs">
            {series.read_count}/{series.issue_count} issues
          </Badge>
          <Badge colorPalette={series.comic_type === 'manga' ? 'purple' : 'blue'} fontSize="2xs">
            {series.comic_type === 'manga' ? 'Manga' : 'Comic'}
          </Badge>
        </HStack>
        {progress > 0 && (
          <Box mt={2} h="3px" bg="var(--border-color)" borderRadius="full" overflow="hidden">
            <Box h="100%" w={`${progress}%`} bg="blue.500" borderRadius="full" />
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default ComicsLibrary;
