import React, { useState } from 'react';
import { Box, VStack, Text, Button } from '@chakra-ui/react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import SocialsChatView from './SocialsChatView';
import SocialsPostView from './SocialsPostView';
import SocialsRecordView from './SocialsRecordView';
import {
  SocialItemType,
  SocialMessageThread,
  classifySocialData,
  itemTypeLabel,
} from './socialsUtils';

interface SocialsItemRendererProps {
  platform: string;
  data: unknown;
  date?: string | null;
  preview?: string;
  itemType?: SocialItemType;
  showRawToggle?: boolean;
}

const SocialsItemRenderer: React.FC<SocialsItemRendererProps> = ({
  platform,
  data,
  date,
  preview,
  itemType: itemTypeProp,
  showRawToggle = true,
}) => {
  const [showRaw, setShowRaw] = useState(false);
  const itemType: SocialItemType = itemTypeProp || classifySocialData(data);

  const record = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;

  let content: React.ReactNode;
  switch (itemType) {
    case 'chat':
      content = <SocialsChatView platform={platform} data={record as SocialMessageThread} />;
      break;
    case 'post':
    case 'media':
      content = <SocialsPostView platform={platform} data={record} date={date} />;
      break;
    default:
      content = <SocialsRecordView platform={platform} data={record} />;
  }

  return (
    <VStack align="stretch" gap={4}>
      {preview && itemType !== 'chat' && (
        <Text fontSize="md" color="var(--muted-text)" fontStyle="italic">
          {preview}
        </Text>
      )}

      <Text fontSize="xs" color="var(--empty-text)" textTransform="uppercase" letterSpacing="wider">
        {itemTypeLabel(itemType)}
      </Text>

      {content}

      {showRawToggle && (
        <Box>
          <Button
            size="xs"
            variant="ghost"
            color="var(--muted-text)"
            onClick={() => setShowRaw((v) => !v)}
          >
            {showRaw ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
          </Button>
          {showRaw && (
            <Box
              mt={2}
              p={4}
              borderRadius="lg"
              border="1px solid"
              borderColor="var(--border-color)"
              bg="var(--card-bg)"
              overflow="auto"
            >
              <Box
                as="pre"
                fontSize="xs"
                color="var(--heading-color)"
                whiteSpace="pre-wrap"
                wordBreak="break-word"
                fontFamily="mono"
              >
                {JSON.stringify(data, null, 2)}
              </Box>
            </Box>
          )}
        </Box>
      )}
    </VStack>
  );
};

export default SocialsItemRenderer;
