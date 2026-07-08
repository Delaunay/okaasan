import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Flex, VStack, HStack, Heading, Text, Spinner, Input, Button, Badge,
} from '@chakra-ui/react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Search, Instagram, Facebook, Linkedin } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import SocialsItemCard from './SocialsItemCard';
import { SocialDumpItem } from './socialsUtils';

interface Category {
  path: string;
  file_count: number;
  item_count?: number;
  label: string;
}

interface DumpItem extends SocialDumpItem {}

const PLATFORM_META: Record<string, { name: string; icon: React.ReactNode }> = {
  instagram: { name: 'Instagram', icon: <Instagram size={20} /> },
  facebook: { name: 'Facebook', icon: <Facebook size={20} /> },
  linkedin: { name: 'LinkedIn', icon: <Linkedin size={20} /> },
};

const SocialsPlatform: React.FC = () => {
  const { platform = '' } = useParams<{ platform: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get('category') || '';
  const navigate = useNavigate();

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<DumpItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = PLATFORM_META[platform];

  useEffect(() => {
    if (!platform || !meta) return;
    setLoadingCats(true);
    setError(null);
    recipeAPI.getSocialsCategories(platform)
      .then((data) => {
        setCategories(data.categories);
        if (!category && data.categories.length > 0) {
          setSearchParams({ category: data.categories[0].path }, { replace: true });
        }
      })
      .catch((e) => setError(e.message || 'Failed to load categories'))
      .finally(() => setLoadingCats(false));
  }, [platform, meta, category, setSearchParams]);

  const loadItems = useCallback(() => {
    if (!platform || !category) return;
    setLoadingItems(true);
    recipeAPI.getSocialsItems(platform, category, page, 50, search || undefined)
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
      })
      .catch((e) => setError(e.message || 'Failed to load items'))
      .finally(() => setLoadingItems(false));
  }, [platform, category, page, search]);

  useEffect(() => {
    setPage(1);
  }, [category, search]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  if (!meta) {
    return (
      <Box p={4}>
        <Text color="var(--muted-text)">Unknown platform.</Text>
      </Box>
    );
  }

  if (loadingCats) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  if (error && categories.length === 0) {
    return (
      <VStack gap={4} align="stretch" p={4}>
        <Button size="sm" variant="ghost" alignSelf="start" onClick={() => navigate('/socials')}>
          <ArrowLeft size={16} /> Back
        </Button>
        <Text color="red.400">{error}</Text>
        <Text fontSize="sm" color="var(--muted-text)">
          Configure the dump path in Settings → Socials.
        </Text>
      </VStack>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <Flex gap={0} align="stretch" minH="calc(100vh - 120px)">
      {/* Category sidebar */}
      <Box
        w={{ base: '100%', md: '260px' }}
        flexShrink={0}
        borderRight="1px solid"
        borderColor="var(--border-color)"
        bg="var(--card-bg)"
        display={{ base: category ? 'none' : 'block', md: 'block' }}
        overflowY="auto"
        p={3}
      >
        <HStack mb={4}>
          <Button size="xs" variant="ghost" onClick={() => navigate('/socials')}>
            <ArrowLeft size={14} />
          </Button>
          <HStack color="var(--icon-color)">
            {meta.icon}
            <Heading size="sm" color="var(--heading-color)">{meta.name}</Heading>
          </HStack>
        </HStack>

        <VStack align="stretch" gap={1}>
          {categories.map((cat) => (
            <Box
              key={cat.path}
              px={3}
              py={2}
              borderRadius="md"
              cursor="pointer"
              bg={category === cat.path ? 'var(--selected-bg)' : undefined}
              _hover={{ bg: 'var(--hover-bg)' }}
              onClick={() => setSearchParams({ category: cat.path })}
            >
              <HStack justify="space-between">
                <Text fontSize="sm" color="var(--heading-color)" lineClamp={1}>
                  {cat.label}
                </Text>
                <Badge size="sm" variant="subtle">
                  {(cat.item_count ?? cat.file_count).toLocaleString()}
                </Badge>
              </HStack>
              <Text fontSize="xs" color="var(--empty-text)" lineClamp={1}>{cat.path}</Text>
            </Box>
          ))}
        </VStack>
      </Box>

      {/* Items panel */}
      <Box flex={1} p={4} overflowY="auto" display={{ base: category ? 'block' : 'none', md: 'block' }}>
        {category ? (
          <VStack align="stretch" gap={4}>
            <HStack justify="space-between" flexWrap="wrap" gap={2}>
              <HStack>
                <Button
                  size="xs"
                  variant="ghost"
                  display={{ base: 'inline-flex', md: 'none' }}
                  onClick={() => setSearchParams({})}
                >
                  <ArrowLeft size={14} /> Categories
                </Button>
                <Heading size="md" color="var(--heading-color)">
                  {categories.find((c) => c.path === category)?.label || category}
                </Heading>
                <Badge variant="subtle">{total} items</Badge>
              </HStack>
              <HStack>
                <Input
                  size="sm"
                  placeholder="Search..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setSearch(searchInput)}
                  bg="var(--input-bg)"
                  borderColor="var(--border-color)"
                  maxW="200px"
                />
                <Button size="sm" variant="outline" onClick={() => setSearch(searchInput)}>
                  <Search size={14} />
                </Button>
              </HStack>
            </HStack>

            {loadingItems ? (
              <Flex justify="center" py={8}><Spinner /></Flex>
            ) : items.length === 0 ? (
              <Text color="var(--muted-text)" py={8} textAlign="center">No items in this category.</Text>
            ) : (
              <VStack align="stretch" gap={2}>
                {items.map((item) => (
                  <SocialsItemCard
                    key={item.id}
                    platform={platform}
                    item={item}
                    onClick={() => navigate(
                      `/socials/${platform}/item/${item.id}?category=${encodeURIComponent(category)}`
                    )}
                  />
                ))}
              </VStack>
            )}

            {totalPages > 1 && (
              <HStack justify="center" gap={2} pt={2}>
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Text fontSize="sm" color="var(--muted-text)">Page {page} of {totalPages}</Text>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </HStack>
            )}
          </VStack>
        ) : (
          <Text color="var(--muted-text)">Select a category to browse.</Text>
        )}
      </Box>
    </Flex>
  );
};

export default SocialsPlatform;
