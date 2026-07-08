import React, { useState } from 'react';
import { Box, Grid, Text, Flex } from '@chakra-ui/react';
import { Film } from 'lucide-react';
import { isImageUri, isVideoUri, socialsMediaUrl } from './socialsUtils';

interface SocialsMediaProps {
  platform: string;
  uri: string;
  maxH?: string;
  rounded?: string;
}

export const SocialsMedia: React.FC<SocialsMediaProps> = ({
  platform,
  uri,
  maxH = '320px',
  rounded = 'md',
}) => {
  const [failed, setFailed] = useState(false);
  const src = socialsMediaUrl(platform, uri);

  if (failed) {
    return (
      <Box
        p={3}
        borderRadius={rounded}
        bg="var(--surface-muted)"
        border="1px solid"
        borderColor="var(--border-color)"
      >
        <Text fontSize="xs" color="var(--muted-text)" fontFamily="mono">{uri}</Text>
      </Box>
    );
  }

  if (isVideoUri(uri)) {
    return (
      <Box position="relative" borderRadius={rounded} overflow="hidden" bg="black">
        <video
          src={src}
          controls
          style={{ maxHeight: maxH, width: '100%', display: 'block' }}
          onError={() => setFailed(true)}
        />
      </Box>
    );
  }

  if (isImageUri(uri)) {
    return (
      <Box borderRadius={rounded} overflow="hidden" border="1px solid" borderColor="var(--border-color)">
        <img
          src={src}
          alt=""
          style={{ maxHeight: maxH, width: '100%', objectFit: 'contain', display: 'block', background: 'var(--surface-muted)' }}
          onError={() => setFailed(true)}
        />
      </Box>
    );
  }

  return (
    <Flex
      p={3}
      borderRadius={rounded}
      bg="var(--surface-muted)"
      border="1px solid"
      borderColor="var(--border-color)"
      align="center"
      gap={2}
    >
      <Film size={16} color="var(--muted-text)" />
      <Text fontSize="xs" color="var(--muted-text)" fontFamily="mono" lineClamp={1}>{uri}</Text>
    </Flex>
  );
};

interface SocialsMediaGalleryProps {
  platform: string;
  uris: string[];
  columns?: number;
}

export const SocialsMediaGallery: React.FC<SocialsMediaGalleryProps> = ({
  platform,
  uris,
  columns = 2,
}) => {
  if (!uris.length) return null;
  return (
    <Grid templateColumns={`repeat(auto-fill, minmax(${columns === 1 ? '200px' : '140px'}, 1fr))`} gap={3}>
      {uris.map((uri) => (
        <SocialsMedia key={uri} platform={platform} uri={uri} maxH="240px" />
      ))}
    </Grid>
  );
};
