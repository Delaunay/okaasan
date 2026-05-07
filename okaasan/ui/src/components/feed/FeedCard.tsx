import { FC, useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, Text, HStack, Badge, VStack, Flex } from '@chakra-ui/react';
import {
  ChefHat, FileText, CheckCircle, CalendarDays,
  Package, Receipt, Bot, User, ChevronDown, ChevronUp, Blocks,
} from 'lucide-react';
import type { AuditEntry } from '../../services/type';

const ENTITY_ICONS: Record<string, typeof FileText> = {
  recipe: ChefHat,
  article: FileText,
  article_block: Blocks,
  task: CheckCircle,
  event: CalendarDays,
  product: Package,
  receipt: Receipt,
};

const ACTION_COLORS: Record<string, string> = {
  created: 'green',
  updated: 'blue',
  deleted: 'red',
};

function entityLink(entry: AuditEntry): string | null {
  switch (entry.entity_type) {
    case 'recipe':
      return `/recipes/${entry.entity_id}`;
    case 'article':
      return `/article?id=${entry.entity_id}`;
    case 'task':
      return `/tasks/${entry.entity_id}`;
    case 'event':
      return `/calendar`;
    default:
      return null;
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

interface ChangesDetailProps {
  changes: Record<string, { old?: any; new?: any }>;
}

const ChangesDetail: FC<ChangesDetailProps> = ({ changes }) => {
  const keys = Object.keys(changes).filter(
    (k) => !['_id', 'created_at', 'updated_at'].includes(k),
  );
  if (keys.length === 0) return null;

  return (
    <VStack align="stretch" gap={1} mt={2} pl={2} borderLeft="2px solid" borderColor="border.emphasized">
      {keys.slice(0, 8).map((key) => {
        const { old: oldVal, new: newVal } = changes[key];
        const display = (v: any) => {
          if (v === null || v === undefined) return '—';
          if (typeof v === 'object') return JSON.stringify(v).slice(0, 80);
          return String(v).slice(0, 80);
        };
        return (
          <Box key={key} fontSize="xs">
            <Text fontWeight="600" color="fg.muted" display="inline">
              {key}:{' '}
            </Text>
            {oldVal !== undefined && oldVal !== null && (
              <Text color="red.500" display="inline" textDecoration="line-through">
                {display(oldVal)}
              </Text>
            )}
            {oldVal !== undefined && oldVal !== null && newVal !== undefined && newVal !== null && ' → '}
            {newVal !== undefined && newVal !== null && (
              <Text color="green.500" display="inline">
                {display(newVal)}
              </Text>
            )}
          </Box>
        );
      })}
      {keys.length > 8 && (
        <Text fontSize="xs" color="fg.muted">
          +{keys.length - 8} more fields
        </Text>
      )}
    </VStack>
  );
};

interface FeedCardProps {
  entry: AuditEntry;
}

const FeedCard: FC<FeedCardProps> = ({ entry }) => {
  const [expanded, setExpanded] = useState(false);
  const Icon = ENTITY_ICONS[entry.entity_type] || FileText;
  const actionColor = ACTION_COLORS[entry.action] || 'gray';
  const link = entityLink(entry);
  const isAgent = entry.created_by && entry.created_by !== 'user';

  const titleContent = (
    <Text fontSize="sm" fontWeight="600" color="fg.emphasized" lineClamp={1}>
      {entry.title || 'Untitled'}
    </Text>
  );

  return (
    <Box
      p={3}
      borderRadius="md"
      border="1px solid"
      borderColor="border.emphasized"
      bg="bg.subtle"
      transition="all 0.15s"
      _hover={{ borderColor: 'orange.300' }}
    >
      <Flex justify="space-between" align="start" gap={3}>
        <HStack align="start" gap={3} flex={1} minW={0}>
          <Box
            p={2}
            borderRadius="md"
            bg={`${actionColor}.100`}
            _dark={{ bg: `${actionColor}.900` }}
            flexShrink={0}
            mt="1px"
          >
            <Icon size={16} />
          </Box>

          <VStack align="start" gap={0.5} flex={1} minW={0}>
            <HStack gap={2} flexWrap="wrap">
              <Badge
                size="sm"
                colorPalette={actionColor}
                variant="subtle"
              >
                {entry.action}
              </Badge>
              <Badge size="sm" variant="outline">
                {entry.entity_type.replace('_', ' ')}
              </Badge>
              {isAgent && (
                <HStack gap={1}>
                  <Bot size={12} />
                  <Text fontSize="xs" color="fg.muted">{entry.created_by}</Text>
                </HStack>
              )}
              {!isAgent && entry.created_by && (
                <HStack gap={1}>
                  <User size={12} />
                  <Text fontSize="xs" color="fg.muted">{entry.created_by}</Text>
                </HStack>
              )}
            </HStack>

            {link ? (
              <Link to={link} style={{ textDecoration: 'none', minWidth: 0 }}>
                <Box _hover={{ color: 'orange.500' }}>{titleContent}</Box>
              </Link>
            ) : (
              titleContent
            )}

            <Text fontSize="xs" color="fg.muted" lineClamp={1}>
              {entry.summary}
            </Text>
          </VStack>
        </HStack>

        <VStack align="end" gap={1} flexShrink={0}>
          <Text fontSize="xs" color="fg.muted" whiteSpace="nowrap">
            {timeAgo(entry.timestamp)}
          </Text>
          {entry.changes && Object.keys(entry.changes).length > 0 && (
            <Box
              cursor="pointer"
              onClick={() => setExpanded(!expanded)}
              color="fg.muted"
              _hover={{ color: 'orange.500' }}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </Box>
          )}
        </VStack>
      </Flex>

      {expanded && entry.changes && <ChangesDetail changes={entry.changes} />}
    </Box>
  );
};

export default FeedCard;
