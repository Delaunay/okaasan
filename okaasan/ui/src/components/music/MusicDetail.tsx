import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Flex, Heading, Text, VStack, HStack, Spinner, Badge, Button } from '@chakra-ui/react';
import { ArrowLeft, Disc3, Play, Plus, ListMusic } from 'lucide-react';
import { recipeAPI, resolveMediaUrl } from '../../services/api';
import { useMusicPlayer, type MusicTrack } from './MusicPlayerContext';

interface AlbumDetail {
  id: number;
  name: string;
  artist: string;
  year: number | null;
  cover_path: string | null;
  tracks: MusicTrack[];
}

function resolveCover(coverPath: string | null | undefined): string | undefined {
  return resolveMediaUrl(coverPath);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatTotalDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const MusicDetail: React.FC = () => {
  const { albumId } = useParams<{ albumId: string }>();
  const navigate = useNavigate();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { play, addToQueue, playAlbum, currentTrack, isPlaying } = useMusicPlayer();

  useEffect(() => {
    if (!albumId) return;
    recipeAPI.request<AlbumDetail>(`/music/albums/${albumId}`)
      .then(setAlbum)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [albumId]);

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  if (!album) {
    return (
      <VStack p={4} gap={4}>
        <Button size="sm" variant="ghost" onClick={() => navigate('/music-library')}>
          <ArrowLeft size={16} />
          <Text ml={1}>Back to Library</Text>
        </Button>
        <Text color="var(--muted-text)">Album not found.</Text>
      </VStack>
    );
  }

  const cover = resolveCover(album.cover_path);
  const totalDuration = album.tracks.reduce((sum, t) => sum + t.duration, 0);

  return (
    <VStack gap={6} align="stretch" p={4}>
      <Button size="sm" variant="ghost" onClick={() => navigate('/music-library')} alignSelf="flex-start">
        <ArrowLeft size={16} />
        <Text ml={1}>Back to Library</Text>
      </Button>

      {/* Album Header */}
      <Flex gap={6} direction={{ base: 'column', md: 'row' }} align={{ base: 'center', md: 'flex-start' }}>
        {cover ? (
          <Box
            as="img" src={cover} alt={album.name}
            w={{ base: '200px', md: '240px' }} h={{ base: '200px', md: '240px' }}
            objectFit="cover" borderRadius="lg"
            boxShadow="lg" flexShrink={0}
          />
        ) : (
          <Box
            w={{ base: '200px', md: '240px' }} h={{ base: '200px', md: '240px' }}
            bg="var(--surface-muted)" display="flex" alignItems="center"
            justifyContent="center" borderRadius="lg" flexShrink={0}
          >
            <Disc3 size={80} color="var(--muted-text)" />
          </Box>
        )}

        <VStack align={{ base: 'center', md: 'flex-start' }} gap={3} flex={1}>
          <Heading size="xl" color="var(--heading-color)">{album.name}</Heading>
          <Text fontSize="lg" color="var(--muted-text)">{album.artist}</Text>
          <HStack gap={2} flexWrap="wrap">
            {album.year && <Badge colorPalette="blue">{album.year}</Badge>}
            <Badge colorPalette="gray">{album.tracks.length} tracks</Badge>
            <Badge colorPalette="gray">{formatTotalDuration(totalDuration)}</Badge>
          </HStack>
          <HStack gap={2} mt={2}>
            <Button size="sm" colorPalette="blue" onClick={() => playAlbum(album.tracks)}>
              <Play size={14} />
              <Text ml={1}>Play All</Text>
            </Button>
            <Button
              size="sm" variant="outline"
              onClick={() => album.tracks.forEach(t => addToQueue(t))}
            >
              <Plus size={14} />
              <Text ml={1}>Queue All</Text>
            </Button>
          </HStack>
        </VStack>
      </Flex>

      {/* Track List */}
      <Box>
        <HStack mb={3}>
          <ListMusic size={20} />
          <Heading size="md" color="var(--heading-color)">Tracks</Heading>
        </HStack>
        <VStack align="stretch" gap={1}>
          {album.tracks.map((track, idx) => {
            const isCurrentTrack = currentTrack?.id === track.id;
            return (
              <HStack
                key={track.id}
                p={3}
                borderRadius="md"
                bg={isCurrentTrack ? 'var(--selected-bg)' : 'var(--card-bg)'}
                border="1px solid"
                borderColor={isCurrentTrack ? 'var(--panel-blue-border)' : 'var(--border-color)'}
                _hover={{ bg: 'var(--hover-bg)' }}
                gap={3}
                cursor="pointer"
                onClick={() => playAlbum(album.tracks, idx)}
              >
                <Text fontSize="sm" color="var(--muted-text)" w="30px" textAlign="right">
                  {track.track_number ?? idx + 1}
                </Text>
                <Button
                  size="xs" variant="ghost" p={1} minW="auto" h="auto"
                  borderRadius="full"
                  onClick={(e) => { e.stopPropagation(); play(track); }}
                >
                  <Play size={14} />
                </Button>
                <Box flex={1} minW={0}>
                  <Text
                    fontSize="sm"
                    fontWeight={isCurrentTrack ? 'bold' : 'medium'}
                    color={isCurrentTrack ? 'var(--icon-color)' : undefined}
                    lineClamp={1}
                  >
                    {track.title}
                  </Text>
                  {track.artist !== album.artist && (
                    <Text fontSize="xs" color="var(--muted-text)">{track.artist}</Text>
                  )}
                </Box>
                <Text fontSize="xs" color="var(--muted-text)">{formatDuration(track.duration)}</Text>
                <Button
                  size="xs" variant="ghost" p={1} minW="auto" h="auto"
                  borderRadius="full"
                  onClick={(e) => { e.stopPropagation(); addToQueue(track); }}
                  title="Add to queue"
                >
                  <Plus size={14} />
                </Button>
              </HStack>
            );
          })}
        </VStack>
      </Box>
    </VStack>
  );
};

export default MusicDetail;
