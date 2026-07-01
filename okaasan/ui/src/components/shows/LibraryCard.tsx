import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, Text, HStack, Badge, Image, Button } from '@chakra-ui/react';
import { Film, Tv, Play, Heart, CheckCircle } from 'lucide-react';
import { resolveMediaUrl } from '../../services/api';

export interface LibraryFile {
  id: number;
  media_id: number | null;
  media_type: string;
  tmdb_id: number | null;
  title: string | null;
  db_title: string | null;
  season: number | null;
  episode: number | null;
  file_path: string;
  file_size: number | null;
  container: string | null;
  matched: boolean;
  poster_path: string | null;
  year: number | null;
}

export interface GroupedMedia {
  key: string;
  title: string;
  media_type: string;
  tmdb_id: number | null;
  media_id: number | null;
  matched: boolean;
  poster_path: string | null;
  year: number | null;
  files: LibraryFile[];
}

function resolvePoster(posterPath: string | null | undefined): string | undefined {
  return resolveMediaUrl(posterPath);
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

const LibraryCard: React.FC<{
  group: GroupedMedia;
  watchedSet?: Set<string>;
  isMovieWatched?: boolean;
  isFavorite: boolean;
  onPlay: () => void;
  onToggleFavorite: () => void;
  onMarkWatched: () => void;
  getNextUnwatched: () => LibraryFile;
}> = ({ group, watchedSet, isMovieWatched, isFavorite, onPlay, onToggleFavorite, onMarkWatched, getNextUnwatched }) => {
  const [hovered, setHovered] = useState(false);
  const episodeCount = group.files.length;
  const totalSize = group.files.reduce((sum, f) => sum + (f.file_size || 0), 0);
  const poster = resolvePoster(group.poster_path);
  const isShow = group.media_type !== 'movie';

  const watchedCount = isShow && watchedSet
    ? group.files.filter(f => f.season != null && f.episode != null && watchedSet.has(`${f.season}-${f.episode}`)).length
    : 0;
  const fullyWatched = isShow
    ? watchedCount > 0 && watchedCount >= episodeCount
    : !!isMovieWatched;

  const detailHref = group.tmdb_id
    ? `/shows/detail/${group.media_type === 'movie' ? 'movie' : 'tv'}/${group.tmdb_id}`
    : undefined;

  const nextFile = isShow && !fullyWatched ? getNextUnwatched() : null;
  const nextLabel = nextFile && nextFile.season != null && nextFile.episode != null
    ? `S${String(nextFile.season).padStart(2, '0')}E${String(nextFile.episode).padStart(2, '0')}`
    : null;

  return (
    <Box
      borderRadius="lg"
      overflow="hidden"
      border="1px solid"
      borderColor="var(--border-color)"
      bg="var(--card-bg)"
      transition="transform 0.2s, box-shadow 0.2s"
      _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
      position="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Heart/Favorite — top left */}
      {group.matched && (
        <Button
          position="absolute"
          top={1}
          left={1}
          zIndex={10}
          size="xs"
          variant="ghost"
          p={1}
          minW="auto"
          h="auto"
          borderRadius="full"
          bg={isFavorite ? 'rgba(239,68,68,0.8)' : 'rgba(0,0,0,0.6)'}
          color="white"
          _hover={{ bg: isFavorite ? 'red.600' : 'red.500' }}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavorite(); }}
          opacity={isFavorite || hovered ? 1 : 0}
          transition="opacity 0.2s"
          style={{ pointerEvents: 'auto' }}
        >
          <Heart size={14} fill={isFavorite ? 'white' : 'none'} />
        </Button>
      )}

      {/* Watched — top right */}
      {group.matched && (
        <Button
          position="absolute"
          top={1}
          right={1}
          zIndex={10}
          size="xs"
          variant="ghost"
          p={1}
          minW="auto"
          h="auto"
          borderRadius="full"
          bg={fullyWatched ? 'rgba(34,197,94,0.85)' : 'rgba(0,0,0,0.6)'}
          color="white"
          _hover={{ bg: fullyWatched ? 'green.600' : 'green.500' }}
          title={fullyWatched ? 'Fully watched' : 'Mark as watched'}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMarkWatched(); }}
          opacity={fullyWatched || hovered ? 1 : 0}
          transition="opacity 0.2s"
          style={{ pointerEvents: 'auto' }}
        >
          <CheckCircle size={14} />
        </Button>
      )}

      {/* Play button — center, visible on hover */}
      {hovered && (
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          h="220px"
          zIndex={5}
          display="flex"
          alignItems="center"
          justifyContent="center"
          bg="rgba(0,0,0,0.3)"
          style={{ pointerEvents: 'none' }}
        >
          <Box
            bg="blue.500"
            borderRadius="full"
            p={3}
            cursor="pointer"
            _hover={{ bg: 'blue.400' }}
            transition="background 0.2s"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPlay(); }}
            style={{ pointerEvents: 'auto' }}
          >
            <Play size={28} color="white" fill="white" />
          </Box>
        </Box>
      )}

      {/* Unmatched badge — top left */}
      {!group.matched && (
        <Box position="absolute" top={1} left={1} zIndex={2}>
          <Badge colorPalette="orange" fontSize="2xs" bg="rgba(0,0,0,0.6)" color="orange.300">
            Unmatched
          </Badge>
        </Box>
      )}

      <Box as={detailHref ? Link : 'div'} {...(detailHref ? { to: detailHref } : {})} style={{ textDecoration: 'none', color: 'inherit' }}>
        {poster ? (
          <Image src={poster} alt={group.title} w="100%" h="220px" objectFit="cover" loading="lazy" />
        ) : (
          <Box
            w="100%"
            h="220px"
            bg="var(--surface-muted)"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            {isShow ? <Tv size={48} color="var(--muted-text)" /> : <Film size={48} color="var(--muted-text)" />}
          </Box>
        )}

        <Box p={3}>
          <Text fontSize="sm" fontWeight="semibold" lineClamp={2}>{group.title}</Text>
          <HStack gap={2} mt={1} flexWrap="wrap">
            {group.year && <Text fontSize="xs" color="var(--muted-text)">{group.year}</Text>}
            {isShow && (
              <Badge colorPalette={fullyWatched ? 'green' : 'gray'} fontSize="2xs">
                {fullyWatched ? `✓ ${episodeCount} eps` : `${watchedCount}/${episodeCount} eps`}
              </Badge>
            )}
            <Text fontSize="xs" color="var(--muted-text)">{formatSize(totalSize)}</Text>
          </HStack>
          {isShow && nextLabel && (
            <Text fontSize="xs" color="blue.400" mt={1}>Next: {nextLabel}</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default LibraryCard;
