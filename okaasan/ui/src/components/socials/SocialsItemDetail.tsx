import React, { useEffect, useState } from 'react';
import {
  Box, VStack, HStack, Heading, Text, Spinner, Button, Badge,
} from '@chakra-ui/react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import SocialsItemRenderer from './SocialsItemRenderer';
import { SocialDumpItem, itemTypeLabel } from './socialsUtils';

const SocialsItemDetail: React.FC = () => {
  const { platform = '', itemId = '' } = useParams<{ platform: string; itemId: string }>();
  const [searchParams] = useSearchParams();
  const category = searchParams.get('category') || '';
  const navigate = useNavigate();

  const [item, setItem] = useState<SocialDumpItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!platform || !itemId || !category) return;
    setLoading(true);
    recipeAPI.getSocialsItem(platform, itemId, category)
      .then(setItem)
      .catch((e) => setError(e.message || 'Failed to load item'))
      .finally(() => setLoading(false));
  }, [platform, itemId, category]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={12}>
        <Spinner size="lg" />
      </Box>
    );
  }

  if (error || !item) {
    return (
      <VStack gap={4} align="stretch" p={4}>
        <Button size="sm" variant="ghost" alignSelf="start" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Back
        </Button>
        <Text color="red.400">{error || 'Item not found'}</Text>
      </VStack>
    );
  }

  const typeLabel = itemTypeLabel(item.item_type || 'record');

  return (
    <VStack gap={6} align="stretch" p={4} maxW="5xl" mx="auto" w="100%">
      <HStack flexWrap="wrap" gap={2}>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate(`/socials/${platform}?category=${encodeURIComponent(category)}`)}
        >
          <ArrowLeft size={16} /> Back
        </Button>
        <Badge variant="subtle">{typeLabel}</Badge>
        {item.file && <Badge variant="outline">{item.file}</Badge>}
      </HStack>

      {item.item_type !== 'chat' && (
        <Heading size="md" color="var(--heading-color)">
          {item.preview || 'Item detail'}
        </Heading>
      )}

      <Box
        p={3}
        borderRadius="md"
        bg="var(--panel-blue-bg)"
        border="1px solid"
        borderColor="var(--panel-blue-border)"
      >
        <Text fontSize="sm" color="var(--panel-blue-text)">
          Publish to Okaasan — coming soon.
        </Text>
      </Box>

      <SocialsItemRenderer
        platform={platform}
        data={item.data}
        date={item.date}
        preview={item.preview}
        itemType={item.item_type}
      />
    </VStack>
  );
};

export default SocialsItemDetail;
