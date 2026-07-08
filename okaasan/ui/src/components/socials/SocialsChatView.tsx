import React, { useMemo } from 'react';
import { Box, VStack, HStack, Text, Badge, Flex } from '@chakra-ui/react';
import { Users } from 'lucide-react';
import { SocialsMedia, SocialsMediaGallery } from './SocialsMedia';
import {
  SocialMessage,
  SocialMessageThread,
  formatSocialDate,
  socialsMediaUrl,
  isImageUri,
} from './socialsUtils';

interface SocialsChatViewProps {
  platform: string;
  data: SocialMessageThread;
}

function messageMediaUris(msg: SocialMessage): string[] {
  const uris: string[] = [];
  for (const key of ['photos', 'videos', 'gifs'] as const) {
    for (const m of msg[key] || []) {
      if (m?.uri) uris.push(m.uri);
    }
  }
  return uris;
}

const ChatBubble: React.FC<{
  platform: string;
  msg: SocialMessage;
  selfName?: string;
}> = ({ platform, msg, selfName }) => {
  const isSelf = selfName && msg.sender_name === selfName;
  const mediaUris = messageMediaUris(msg);
  const hasText = Boolean(msg.content?.trim());
  const shareLink = msg.share?.link;

  return (
    <Flex justify={isSelf ? 'flex-end' : 'flex-start'} w="100%">
      <Box
        maxW="85%"
        px={3}
        py={2}
        borderRadius="lg"
        bg={isSelf ? 'var(--panel-blue-bg)' : 'var(--card-bg)'}
        border="1px solid"
        borderColor={isSelf ? 'var(--panel-blue-border)' : 'var(--border-color)'}
      >
        <Text fontSize="xs" fontWeight="semibold" color="var(--icon-color)" mb={1}>
          {msg.sender_name || 'Unknown'}
        </Text>

        {hasText && (
          <Text fontSize="sm" color="var(--heading-color)" whiteSpace="pre-wrap" wordBreak="break-word">
            {msg.content}
          </Text>
        )}

        {shareLink && (
          <Box mt={hasText ? 2 : 0}>
            <a href={shareLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--icon-color)', fontSize: '0.85rem' }}>
              {msg.share?.share_text || shareLink}
            </a>
          </Box>
        )}

        {mediaUris.length > 0 && (
          <VStack align="stretch" gap={2} mt={hasText || shareLink ? 2 : 0}>
            {mediaUris.map((uri) => (
              <Box key={uri} maxW="280px">
                {isImageUri(uri) ? (
                  <img
                    src={socialsMediaUrl(platform, uri)}
                    alt=""
                    style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }}
                  />
                ) : (
                  <SocialsMedia platform={platform} uri={uri} maxH="200px" />
                )}
              </Box>
            ))}
          </VStack>
        )}

        {msg.reactions && msg.reactions.length > 0 && (
          <HStack mt={2} gap={1} flexWrap="wrap">
            {msg.reactions.map((r, i) => (
              <Badge key={i} size="sm" variant="subtle">{r.reaction || '❤️'}</Badge>
            ))}
          </HStack>
        )}

        {msg.timestamp_ms && (
          <Text fontSize="2xs" color="var(--empty-text)" mt={1} textAlign="right">
            {formatSocialDate(msg.timestamp_ms)}
          </Text>
        )}
      </Box>
    </Flex>
  );
};

const SocialsChatView: React.FC<SocialsChatViewProps> = ({ platform, data }) => {
  const participants = data.participants || [];
  const names = participants.map((p) => p.name).filter(Boolean);
  const selfName = names[0];

  const messages = useMemo(
    () => [...(data.messages || [])].sort((a, b) => (a.timestamp_ms || 0) - (b.timestamp_ms || 0)),
    [data.messages],
  );

  return (
    <VStack align="stretch" gap={4}>
      <Box
        p={4}
        borderRadius="lg"
        bg="var(--card-bg)"
        border="1px solid"
        borderColor="var(--border-color)"
      >
        <HStack mb={2}>
          <Users size={18} color="var(--icon-color)" />
          <Text fontWeight="semibold" color="var(--heading-color)">
            {data.title || names.slice(0, 3).join(', ') || 'Conversation'}
          </Text>
          <Badge variant="subtle">{messages.length} messages</Badge>
        </HStack>
        {names.length > 0 && (
          <Text fontSize="sm" color="var(--muted-text)">
            {names.join(', ')}
          </Text>
        )}
      </Box>

      <VStack align="stretch" gap={3} px={1}>
        {messages.map((msg, i) => (
          <ChatBubble key={i} platform={platform} msg={msg} selfName={selfName} />
        ))}
      </VStack>
    </VStack>
  );
};

export default SocialsChatView;
