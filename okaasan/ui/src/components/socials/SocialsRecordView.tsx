import React from 'react';
import { Box, VStack, HStack, Text, Grid } from '@chakra-ui/react';
import { SocialsMediaGallery } from './SocialsMedia';
import { extractMediaUris, formatSocialDate } from './socialsUtils';

interface SocialsRecordViewProps {
  platform: string;
  data: Record<string, unknown>;
}

const SocialsRecordView: React.FC<SocialsRecordViewProps> = ({ platform, data }) => {
  const mediaUris = extractMediaUris(data);
  const labelValues = (data.label_values as {
    label?: string;
    value?: string;
    timestamp_value?: number;
    media?: { uri?: string }[];
  }[]) || [];

  const scalarFields = Object.entries(data).filter(([key, val]) => {
    if (['label_values', 'media', 'attachments', 'messages', 'participants', 'data'].includes(key)) return false;
    return typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean';
  });

  return (
    <VStack align="stretch" gap={4}>
      {mediaUris.length > 0 && (
        <SocialsMediaGallery platform={platform} uris={mediaUris} />
      )}

      {labelValues.length > 0 && (
        <Box
          p={4}
          borderRadius="lg"
          bg="var(--card-bg)"
          border="1px solid"
          borderColor="var(--border-color)"
        >
          <VStack align="stretch" gap={3}>
            {labelValues.map((lv, i) => (
              <Box key={i}>
                <HStack align="start" gap={3}>
                  <Text fontSize="sm" fontWeight="semibold" color="var(--muted-text)" minW="140px" flexShrink={0}>
                    {lv.label || '—'}
                  </Text>
                  <VStack align="start" gap={2} flex={1}>
                    {lv.value && (
                      <Text fontSize="sm" color="var(--heading-color)">{lv.value}</Text>
                    )}
                    {lv.timestamp_value && (
                      <Text fontSize="xs" color="var(--empty-text)">
                        {formatSocialDate(lv.timestamp_value)}
                      </Text>
                    )}
                    {lv.media && lv.media.length > 0 && (
                      <SocialsMediaGallery
                        platform={platform}
                        uris={lv.media.map((m) => m.uri).filter(Boolean) as string[]}
                        columns={2}
                      />
                    )}
                  </VStack>
                </HStack>
              </Box>
            ))}
          </VStack>
        </Box>
      )}

      {scalarFields.length > 0 && (
        <Grid templateColumns="repeat(auto-fill, minmax(200px, 1fr))" gap={3}>
          {scalarFields.map(([key, val]) => (
            <Box
              key={key}
              p={3}
              borderRadius="md"
              bg="var(--surface-muted)"
              border="1px solid"
              borderColor="var(--border-color)"
            >
              <Text fontSize="xs" color="var(--muted-text)" textTransform="capitalize" mb={1}>
                {key.replace(/_/g, ' ')}
              </Text>
              <Text fontSize="sm" color="var(--heading-color)" wordBreak="break-word">
                {String(val)}
              </Text>
            </Box>
          ))}
        </Grid>
      )}
    </VStack>
  );
};

export default SocialsRecordView;
