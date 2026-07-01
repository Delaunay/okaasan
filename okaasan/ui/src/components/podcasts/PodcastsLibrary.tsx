import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Image, Badge, Input, Button } from '@chakra-ui/react';
import { Podcast, Search, Plus, Minus, Rss } from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface PodcastSubscription {
  id: number;
  title: string;
  author: string | null;
  image: string | null;
  description: string | null;
  feed_url: string;
  episode_count: number;
  unplayed_count: number;
}

interface SearchResult {
  id: number;
  title: string;
  author: string | null;
  image: string | null;
  description: string | null;
  feed_url: string;
  subscribed: boolean;
}

const PodcastsLibrary: React.FC = () => {
  const [subscriptions, setSubscriptions] = useState<PodcastSubscription[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await recipeAPI.request<{ podcasts: PodcastSubscription[] }>('/podcasts/subscriptions');
      setSubscriptions(data.podcasts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSubscriptions(); }, [fetchSubscriptions]);

  const handleSearch = (value: string) => {
    setSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (!value.trim()) {
      setIsSearchMode(false);
      setSearchResults([]);
      return;
    }

    setIsSearchMode(true);
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await recipeAPI.request<{ results: SearchResult[] }>(
          `/podcasts/search?q=${encodeURIComponent(value)}`
        );
        setSearchResults(data.results);
      } catch (e) {
        console.error(e);
      } finally {
        setSearching(false);
      }
    }, 500);
  };

  const handleSubscribe = async (result: SearchResult) => {
    try {
      await recipeAPI.request('/podcasts/subscribe', {
        method: 'POST',
        body: JSON.stringify({ feed_url: result.feed_url, title: result.title, author: result.author, image: result.image }),
      });
      setSearchResults(prev => prev.map(r => r.feed_url === result.feed_url ? { ...r, subscribed: true } : r));
      fetchSubscriptions();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnsubscribe = async (podcastId: number) => {
    try {
      await recipeAPI.request(`/podcasts/unsubscribe/${podcastId}`, { method: 'DELETE' });
      setSubscriptions(prev => prev.filter(p => p.id !== podcastId));
    } catch (e) {
      console.error(e);
    }
  };

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
        <Podcast size={24} />
        <Heading size="lg" color="var(--heading-color)">Podcast Library</Heading>
        <Badge colorPalette="blue" ml={2}>{subscriptions.length} subscriptions</Badge>
      </HStack>

      <HStack>
        <Box position="relative" flex={1}>
          <Box position="absolute" left={3} top="50%" transform="translateY(-50%)" color="var(--muted-text)">
            <Search size={16} />
          </Box>
          <Input
            pl={10}
            placeholder="Search for podcasts to discover and subscribe..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            bg="var(--input-bg)"
          />
        </Box>
      </HStack>

      {isSearchMode ? (
        <Box>
          <HStack mb={3}>
            <Search size={18} />
            <Heading size="md" color="var(--heading-color)">Search Results</Heading>
            {searching && <Spinner size="sm" ml={2} />}
          </HStack>
          {searchResults.length > 0 ? (
            <Grid templateColumns="repeat(auto-fill, minmax(300px, 1fr))" gap={4}>
              {searchResults.map((result) => (
                <SearchResultCard
                  key={result.feed_url}
                  result={result}
                  onSubscribe={() => handleSubscribe(result)}
                />
              ))}
            </Grid>
          ) : !searching ? (
            <Text color="var(--muted-text)">No results found. Try a different search term.</Text>
          ) : null}
        </Box>
      ) : (
        <Box>
          {subscriptions.length > 0 ? (
            <Grid templateColumns="repeat(auto-fill, minmax(180px, 1fr))" gap={4}>
              {subscriptions.map((podcast) => (
                <PodcastCard
                  key={podcast.id}
                  podcast={podcast}
                  onUnsubscribe={() => handleUnsubscribe(podcast.id)}
                />
              ))}
            </Grid>
          ) : (
            <Flex justify="center" py={12}>
              <VStack gap={3}>
                <Rss size={48} color="var(--muted-text)" />
                <Text color="var(--muted-text)">
                  No subscriptions yet. Search above to find podcasts.
                </Text>
              </VStack>
            </Flex>
          )}
        </Box>
      )}
    </VStack>
  );
};

const PodcastCard: React.FC<{ podcast: PodcastSubscription; onUnsubscribe: () => void }> = ({ podcast, onUnsubscribe }) => (
  <Box
    borderRadius="lg"
    overflow="hidden"
    border="1px solid"
    borderColor="var(--border-color)"
    bg="var(--card-bg)"
    transition="transform 0.2s, box-shadow 0.2s"
    _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
    position="relative"
  >
    <Box
      position="absolute"
      top={1}
      right={1}
      zIndex={2}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
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
        _hover={{ bg: 'red.500' }}
        title="Unsubscribe"
        onClick={onUnsubscribe}
      >
        <Minus size={14} />
      </Button>
    </Box>

    <Link to={`/podcasts/detail/${podcast.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      {podcast.image ? (
        <Image src={podcast.image} alt={podcast.title} w="100%" h="180px" objectFit="cover" loading="lazy" />
      ) : (
        <Box
          w="100%"
          h="180px"
          bg="var(--surface-muted)"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Podcast size={48} color="var(--muted-text)" />
        </Box>
      )}

      <Box p={3}>
        <Text fontSize="sm" fontWeight="semibold" lineClamp={2}>{podcast.title}</Text>
        <HStack gap={2} mt={1} flexWrap="wrap">
          {podcast.author && <Text fontSize="xs" color="var(--muted-text)" lineClamp={1}>{podcast.author}</Text>}
        </HStack>
        <HStack gap={2} mt={1}>
          <Badge colorPalette="gray" fontSize="2xs">{podcast.episode_count} eps</Badge>
          {podcast.unplayed_count > 0 && (
            <Badge colorPalette="orange" fontSize="2xs">{podcast.unplayed_count} new</Badge>
          )}
        </HStack>
      </Box>
    </Link>
  </Box>
);

const SearchResultCard: React.FC<{ result: SearchResult; onSubscribe: () => void }> = ({ result, onSubscribe }) => (
  <Box
    borderRadius="lg"
    border="1px solid"
    borderColor="var(--border-color)"
    bg="var(--card-bg)"
    overflow="hidden"
    transition="all 0.2s"
    _hover={{ boxShadow: 'md' }}
  >
    <HStack gap={3} p={3} align="start">
      {result.image ? (
        <Image
          src={result.image}
          alt={result.title}
          w="80px"
          h="80px"
          borderRadius="md"
          objectFit="cover"
          flexShrink={0}
        />
      ) : (
        <Box
          w="80px"
          h="80px"
          borderRadius="md"
          bg="var(--surface-muted)"
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
        >
          <Podcast size={32} color="var(--muted-text)" />
        </Box>
      )}
      <VStack align="start" gap={1} flex={1} minW={0}>
        <Text fontSize="sm" fontWeight="semibold" lineClamp={2}>{result.title}</Text>
        {result.author && <Text fontSize="xs" color="var(--muted-text)">{result.author}</Text>}
        {result.description && (
          <Text fontSize="xs" color="var(--muted-text)" lineClamp={2}>{result.description}</Text>
        )}
        <Box pt={1}>
          {result.subscribed ? (
            <Badge colorPalette="green" fontSize="xs">Subscribed</Badge>
          ) : (
            <Button size="xs" colorPalette="blue" onClick={onSubscribe}>
              <Plus size={14} />
              Subscribe
            </Button>
          )}
        </Box>
      </VStack>
    </HStack>
  </Box>
);

export default PodcastsLibrary;
