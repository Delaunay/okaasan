import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Box, Flex, VStack, HStack, Text, Heading, Spinner, Badge, Button, Image } from '@chakra-ui/react';
import { Newspaper, RefreshCw, ExternalLink, Clock, Layers, Tag } from 'lucide-react';

interface NewsArticle {
  id: number;
  source_id: number;
  source_name: string;
  title: string;
  description: string | null;
  url: string;
  image_url: string | null;
  published_at: string | null;
  categories: string[];
  is_grouped: boolean;
  source_count: number;
  sources: NewsArticle[];
}

interface NewsFeed {
  items: NewsArticle[];
  total: number;
}

interface NewsSourceInfo {
  id: number;
  name: string;
  feed_url: string;
  enabled: boolean;
  last_fetched_at: string | null;
}

const SOURCE_COLORS: Record<string, string> = {
  'BBC News': '#BB1919',
  'AP News': '#0066CC',
  'Al Jazeera': '#FA9000',
};

const CATEGORY_COLORS: Record<string, string> = {
  'News': '#3B82F6',
  'Sport': '#10B981',
  'Opinions': '#8B5CF6',
  'Features': '#F59E0B',
  'Show Types': '#6366F1',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

const NewsOverview: React.FC = () => {
  const [feed, setFeed] = useState<NewsFeed | null>(null);
  const [sources, setSources] = useState<NewsSourceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterSource, setFilterSource] = useState<number | null>(null);
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('news-hidden-categories');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  const fetchFeed = useCallback(() => {
    const params = new URLSearchParams();
    if (filterSource != null) params.set('source_id', String(filterSource));
    fetch(`/api/news/feed?${params}`)
      .then(r => r.json())
      .then(setFeed)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filterSource]);

  useEffect(() => {
    fetch('/api/news/sources')
      .then(r => r.json())
      .then(d => setSources(d.sources || []))
      .catch(console.error);
  }, []);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  const allCategories = useMemo(() => {
    if (!feed) return [];
    const cats = new Set<string>();
    for (const item of feed.items) {
      for (const c of (item.categories || [])) cats.add(c);
      for (const src of (item.sources || [])) {
        for (const c of (src.categories || [])) cats.add(c);
      }
    }
    return Array.from(cats).sort();
  }, [feed]);

  const toggleCategory = useCallback((cat: string) => {
    setHiddenCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      localStorage.setItem('news-hidden-categories', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/news/refresh', { method: 'POST' });
      await fetchFeed();
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (!feed) return [];
    if (hiddenCategories.size === 0) return feed.items;
    return feed.items.filter(item => {
      const cats = item.categories || [];
      if (cats.length === 0) return true;
      return !cats.every(c => hiddenCategories.has(c));
    });
  }, [feed, hiddenCategories]);

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="300px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  return (
    <Box maxW="4xl" mx="auto" p={6}>
      <VStack align="stretch" gap={5}>
        <HStack justify="space-between" flexWrap="wrap">
          <HStack>
            <Newspaper size={24} color="var(--icon-color)" />
            <Heading size="lg" color="var(--heading-color)">World News</Heading>
            {feed && <Badge colorPalette="gray" fontSize="xs">{filteredItems.length} stories</Badge>}
          </HStack>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? <Spinner size="xs" /> : <RefreshCw size={14} />}
            <Text ml={1}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
          </Button>
        </HStack>

        {sources.length > 0 && (
          <HStack gap={2} flexWrap="wrap">
            <Text fontSize="xs" color="var(--muted-text)" fontWeight="semibold">Sources:</Text>
            <Button
              size="xs"
              variant={filterSource === null ? 'solid' : 'outline'}
              onClick={() => setFilterSource(null)}
            >
              All
            </Button>
            {sources.map(s => (
              <Button
                key={s.id}
                size="xs"
                variant={filterSource === s.id ? 'solid' : 'outline'}
                onClick={() => setFilterSource(filterSource === s.id ? null : s.id)}
                style={filterSource === s.id ? { backgroundColor: SOURCE_COLORS[s.name] || undefined, color: '#fff' } : {}}
              >
                {s.name}
              </Button>
            ))}
          </HStack>
        )}

        {allCategories.length > 0 && (
          <HStack gap={2} flexWrap="wrap">
            <Tag size={14} color="var(--muted-text)" />
            <Text fontSize="xs" color="var(--muted-text)" fontWeight="semibold">Categories:</Text>
            {allCategories.map(cat => {
              const isHidden = hiddenCategories.has(cat);
              return (
                <Button
                  key={cat}
                  size="xs"
                  variant={isHidden ? 'outline' : 'solid'}
                  onClick={() => toggleCategory(cat)}
                  style={!isHidden ? { backgroundColor: CATEGORY_COLORS[cat] || '#6B7280', color: '#fff' } : { opacity: 0.5 }}
                >
                  {cat}
                </Button>
              );
            })}
          </HStack>
        )}

        {filteredItems.length === 0 ? (
          <Box p={8} textAlign="center">
            <Text color="var(--muted-text)">No articles yet. Click Refresh to fetch the latest news.</Text>
          </Box>
        ) : (
          <VStack align="stretch" gap={3}>
            {filteredItems.map((item) => (
              <NewsCard key={item.id} article={item} />
            ))}
          </VStack>
        )}
      </VStack>
    </Box>
  );
};

const NewsCard: React.FC<{ article: NewsArticle }> = ({ article }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Box
      p={4}
      bg="var(--card-bg)"
      border="1px solid"
      borderColor="var(--border-color)"
      borderRadius="lg"
      _hover={{ borderColor: 'var(--border-hover, var(--border-color))' }}
      transition="border-color 0.15s"
    >
      <Flex gap={4}>
        {article.image_url && (
          <Image
            src={article.image_url}
            alt=""
            w="120px"
            h="80px"
            objectFit="cover"
            borderRadius="md"
            flexShrink={0}
            display={{ base: 'none', md: 'block' }}
          />
        )}
        <VStack align="stretch" flex={1} gap={1}>
          <HStack gap={2} flexWrap="wrap">
            <Badge
              fontSize="xs"
              style={{ backgroundColor: SOURCE_COLORS[article.source_name] || '#666', color: '#fff' }}
            >
              {article.source_name}
            </Badge>
            {article.categories?.map(cat => (
              <Badge
                key={cat}
                fontSize="2xs"
                style={{ backgroundColor: CATEGORY_COLORS[cat] || '#6B7280', color: '#fff' }}
              >
                {cat}
              </Badge>
            ))}
            {article.is_grouped && (
              <Badge colorPalette="blue" fontSize="xs">
                <Layers size={10} style={{ display: 'inline', marginRight: 2 }} />
                {article.source_count} sources
              </Badge>
            )}
            {article.published_at && (
              <HStack gap={1}>
                <Clock size={11} color="var(--muted-text)" />
                <Text fontSize="xs" color="var(--muted-text)">{timeAgo(article.published_at)}</Text>
              </HStack>
            )}
          </HStack>

          <Text
            as="a"
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            fontWeight="semibold"
            fontSize="md"
            _hover={{ textDecoration: 'underline' }}
            lineClamp={2}
          >
            {article.title}
            <ExternalLink size={12} style={{ display: 'inline', marginLeft: 4, verticalAlign: 'middle', opacity: 0.5 }} />
          </Text>

          {article.description && (
            <Text fontSize="sm" color="var(--muted-text)" lineClamp={2}>
              {stripHtml(article.description)}
            </Text>
          )}

          {article.is_grouped && article.sources.length > 1 && (
            <>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setExpanded(!expanded)}
                alignSelf="flex-start"
                mt={1}
              >
                {expanded ? 'Hide sources' : `View from ${article.source_count} sources`}
              </Button>
              {expanded && (
                <VStack align="stretch" gap={1} mt={1} pl={3} borderLeft="2px solid" borderColor="var(--border-color)">
                  {article.sources.map((src, i) => (
                    <HStack key={i} gap={2}>
                      <Badge
                        fontSize="2xs"
                        style={{ backgroundColor: SOURCE_COLORS[src.source_name] || '#666', color: '#fff' }}
                      >
                        {src.source_name}
                      </Badge>
                      <Text
                        as="a"
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        fontSize="sm"
                        _hover={{ textDecoration: 'underline' }}
                        lineClamp={1}
                      >
                        {src.title}
                      </Text>
                    </HStack>
                  ))}
                </VStack>
              )}
            </>
          )}
        </VStack>
      </Flex>
    </Box>
  );
};

export default NewsOverview;
