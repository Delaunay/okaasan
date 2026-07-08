import React from 'react';
import { Box, VStack, Text, HStack, Badge, Link } from '@chakra-ui/react';
import { ExternalLink } from 'lucide-react';
import { SocialsMediaGallery } from './SocialsMedia';
import {
  extractExternalLinks,
  extractMediaUris,
  formatSocialDate,
} from './socialsUtils';

interface SocialsPostViewProps {
  platform: string;
  data: Record<string, unknown>;
  date?: string | null;
}

const SocialsPostView: React.FC<SocialsPostViewProps> = ({ platform, data, date }) => {
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const mediaUris = extractMediaUris(data);
  const links = extractExternalLinks(data);

  // Instagram captions sometimes live on media items
  const mediaCaptions = ((data.media as { title?: string }[]) || [])
    .map((m) => m.title?.trim())
    .filter(Boolean) as string[];
  const caption = title || mediaCaptions[0] || '';

  const labelValues = (data.label_values as { label?: string; value?: string; timestamp_value?: number }[]) || [];
  const usefulLabels = labelValues.filter(
    (lv) => lv.value && lv.label && !['Update time', 'Shared', 'Media'].includes(lv.label),
  );

  const timestamp = data.creation_timestamp || data.timestamp;

  return (
    <VStack align="stretch" gap={4}>
      {(caption || date) && (
        <Box>
          {caption && (
            <Text fontSize="lg" fontWeight="semibold" color="var(--heading-color)" mb={2} whiteSpace="pre-wrap">
              {caption}
            </Text>
          )}
          <HStack gap={2} flexWrap="wrap">
            {date && <Badge variant="subtle">{formatSocialDate(date)}</Badge>}
            {!date && timestamp != null && (
              <Badge variant="subtle">{formatSocialDate(timestamp as number)}</Badge>
            )}
            {mediaUris.length > 0 && (
              <Badge variant="outline">{mediaUris.length} media</Badge>
            )}
          </HStack>
        </Box>
      )}


      {mediaUris.length > 0 && (
        <SocialsMediaGallery platform={platform} uris={mediaUris} columns={mediaUris.length === 1 ? 1 : 2} />
      )}

      {links.length > 0 && (
        <VStack align="stretch" gap={2}>
          {links.map((url) => (
            <Link
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              color="var(--icon-color)"
              fontSize="sm"
              display="flex"
              alignItems="center"
              gap={1}
            >
              <ExternalLink size={14} />
              {url}
            </Link>
          ))}
        </VStack>
      )}

      {usefulLabels.length > 0 && (
        <Box
          p={4}
          borderRadius="lg"
          bg="var(--card-bg)"
          border="1px solid"
          borderColor="var(--border-color)"
        >
          <VStack align="stretch" gap={2}>
            {usefulLabels.map((lv, i) => (
              <HStack key={i} align="start" gap={3}>
                <Text fontSize="sm" color="var(--muted-text)" minW="120px" flexShrink={0}>
                  {lv.label}
                </Text>
                <Text fontSize="sm" color="var(--heading-color)" flex={1}>
                  {lv.value}
                </Text>
              </HStack>
            ))}
          </VStack>
        </Box>
      )}
    </VStack>
  );
};

export default SocialsPostView;
