import React from 'react';
import { Box, HStack, VStack, Text, Badge, Flex } from '@chakra-ui/react';
import { ChevronRight, MessageCircle, FileText, Image as ImageIcon, Play } from 'lucide-react';
import {
  SocialDumpItem,
  formatSocialDate,
  isImageUri,
  isVideoUri,
  itemTypeLabel,
  socialsMediaUrl,
} from './socialsUtils';

interface SocialsItemCardProps {
  platform: string;
  item: SocialDumpItem;
  onClick: () => void;
}

const TYPE_ICONS = {
  chat: MessageCircle,
  post: FileText,
  media: ImageIcon,
  record: FileText,
};

const SocialsItemCard: React.FC<SocialsItemCardProps> = ({ platform, item, onClick }) => {
  const type = item.item_type || 'record';
  const Icon = TYPE_ICONS[type] || FileText;
  const thumb = item.thumbnail_uri;
  const showThumb = thumb && isImageUri(thumb);
  const isVideo = thumb && isVideoUri(thumb);

  return (
    <Box
      p={3}
      borderRadius="md"
      border="1px solid"
      borderColor="var(--border-color)"
      bg="var(--card-bg)"
      cursor="pointer"
      _hover={{ bg: 'var(--hover-bg)' }}
      onClick={onClick}
    >
      <HStack align="start" gap={3}>
        {showThumb ? (
          <Box
            w="72px"
            h="72px"
            flexShrink={0}
            borderRadius="md"
            overflow="hidden"
            border="1px solid"
            borderColor="var(--border-color)"
            bg="var(--surface-muted)"
          >
            <img
              src={socialsMediaUrl(platform, thumb!)}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </Box>
        ) : isVideo && thumb ? (
          <Flex
            w="72px"
            h="72px"
            flexShrink={0}
            borderRadius="md"
            bg="var(--surface-muted)"
            border="1px solid"
            borderColor="var(--border-color)"
            align="center"
            justify="center"
            color="var(--icon-color)"
            position="relative"
            overflow="hidden"
          >
            <video
              src={socialsMediaUrl(platform, thumb)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              muted
            />
            <Flex position="absolute" inset={0} align="center" justify="center" bg="rgba(0,0,0,0.35)">
              <Play size={22} color="white" fill="white" />
            </Flex>
          </Flex>
        ) : (
          <Flex
            w="72px"
            h="72px"
            flexShrink={0}
            borderRadius="md"
            bg="var(--surface-muted)"
            border="1px solid"
            borderColor="var(--border-color)"
            align="center"
            justify="center"
            color="var(--icon-color)"
          >
            <Icon size={28} strokeWidth={1.5} />
          </Flex>
        )}

        <VStack align="start" gap={1} flex={1} minW={0}>
          <HStack gap={2} flexWrap="wrap">
            <Badge size="sm" variant="subtle">{itemTypeLabel(type)}</Badge>
            {type === 'chat' && item.media_count != null && item.media_count > 0 && (
              <Badge size="sm" variant="outline">{item.media_count} msgs</Badge>
            )}
            {item.media_count != null && item.media_count > 0 && type !== 'chat' && (
              <Badge size="sm" variant="outline">{item.media_count} media</Badge>
            )}
          </HStack>
          <Text fontSize="sm" color="var(--heading-color)" lineClamp={2}>
            {item.preview || '(no preview)'}
          </Text>
          <HStack gap={2} flexWrap="wrap">
            {item.date && (
              <Text fontSize="xs" color="var(--muted-text)">{formatSocialDate(item.date)}</Text>
            )}
            <Text fontSize="xs" color="var(--empty-text)">{item.file}</Text>
          </HStack>
        </VStack>

        <ChevronRight size={16} color="var(--muted-text)" flexShrink={0} mt={2} />
      </HStack>
    </Box>
  );
};

export default SocialsItemCard;
