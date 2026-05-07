import { FC, useEffect, useState, useCallback } from 'react';
import { Box, Text, VStack, HStack, Button, Flex } from '@chakra-ui/react';
import { RefreshCw } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import type { AuditEntry } from '../../services/type';
import FeedCard from './FeedCard';

const ENTITY_TYPES = ['recipe', 'article', 'task', 'event', 'product', 'article_block'];
const ACTIONS = ['created', 'updated', 'deleted'];
const PAGE_SIZE = 20;

interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

const FilterChip: FC<FilterChipProps> = ({ label, active, onClick }) => (
  <Button
    size="xs"
    variant={active ? 'solid' : 'outline'}
    colorPalette={active ? 'orange' : undefined}
    onClick={onClick}
    borderRadius="full"
  >
    {label}
  </Button>
);

const ChangeFeed: FC = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [activeActions, setActiveActions] = useState<Set<string>>(new Set());

  const toggleFilter = (set: Set<string>, value: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  const fetchFeed = useCallback(async (offset = 0, append = false) => {
    try {
      if (!append) setLoading(true);
      else setLoadingMore(true);

      const data = await recipeAPI.getFeed({
        limit: PAGE_SIZE,
        offset,
        entity_type: activeTypes.size > 0 ? Array.from(activeTypes).join(',') : undefined,
        action: activeActions.size > 0 ? Array.from(activeActions).join(',') : undefined,
      });

      if (append) {
        setEntries((prev) => [...prev, ...data]);
      } else {
        setEntries(data);
      }
      setHasMore(data.length === PAGE_SIZE);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch feed:', err);
      setError('Failed to load feed');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [activeTypes, activeActions]);

  useEffect(() => {
    fetchFeed(0, false);
  }, [fetchFeed]);

  const loadMore = () => {
    if (!loadingMore && hasMore) {
      fetchFeed(entries.length, true);
    }
  };

  return (
    <Box>
      <Flex gap={2} flexWrap="wrap" mb={4} align="center">
        <Text fontSize="xs" fontWeight="600" color="fg.muted" mr={1}>
          Type:
        </Text>
        {ENTITY_TYPES.map((t) => (
          <FilterChip
            key={t}
            label={t.replace('_', ' ')}
            active={activeTypes.has(t)}
            onClick={() => toggleFilter(activeTypes, t, setActiveTypes)}
          />
        ))}
      </Flex>

      <Flex gap={2} flexWrap="wrap" mb={4} align="center">
        <Text fontSize="xs" fontWeight="600" color="fg.muted" mr={1}>
          Action:
        </Text>
        {ACTIONS.map((a) => (
          <FilterChip
            key={a}
            label={a}
            active={activeActions.has(a)}
            onClick={() => toggleFilter(activeActions, a, setActiveActions)}
          />
        ))}
        <Box flex={1} />
        <Button
          size="xs"
          variant="ghost"
          onClick={() => fetchFeed(0, false)}
          disabled={loading}
        >
          <RefreshCw size={14} />
        </Button>
      </Flex>

      {error && (
        <Box p={4} bg="bg.error.subtle" borderRadius="md" border="1px solid" borderColor="border.error" mb={4}>
          <Text color="fg.error">{error}</Text>
        </Box>
      )}

      {loading && entries.length === 0 && (
        <Text fontSize="md" color="fg.muted" textAlign="center" py={8}>
          Loading feed...
        </Text>
      )}

      {!loading && entries.length === 0 && !error && (
        <Box textAlign="center" py={8}>
          <Text fontSize="md" color="fg.muted">
            No activity recorded yet
          </Text>
          <Text fontSize="sm" color="fg.subtle" mt={2}>
            Changes to recipes, articles, tasks, and other content will appear here.
          </Text>
        </Box>
      )}

      <VStack align="stretch" gap={2}>
        {entries.map((entry) => (
          <FeedCard key={entry.id} entry={entry} />
        ))}
      </VStack>

      {hasMore && entries.length > 0 && (
        <HStack justify="center" mt={4}>
          <Button
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </Button>
        </HStack>
      )}
    </Box>
  );
};

export default ChangeFeed;
