import React, { useState } from 'react';
import { Box, Flex, Text, HStack, VStack, Button } from '@chakra-ui/react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, ListMusic, X, Music, Shuffle, ListPlus } from 'lucide-react';
import { useMusicPlayer } from './MusicPlayerContext';
import AddToPlaylistPopup from './AddToPlaylistPopup';

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function resolveCover(coverPath: string | null | undefined): string | undefined {
  if (!coverPath) return undefined;
  if (coverPath.startsWith('/uploads/') || coverPath.startsWith('uploads/')) {
    return `/api/${coverPath.replace(/^\//, '')}`;
  }
  if (coverPath.startsWith('/')) return `/api${coverPath}`;
  if (coverPath.startsWith('http')) return coverPath;
  return `/api/${coverPath}`;
}

const MusicPlayer: React.FC = () => {
  const {
    currentTrack, queue, isPlaying, progress, duration, volume, shuffle,
    pause, resume, next, prev, seek, setVolume, removeFromQueue, clearQueue,
    toggleShuffle,
  } = useMusicPlayer();
  const [showQueue, setShowQueue] = useState(false);
  const [showPlaylistAdd, setShowPlaylistAdd] = useState(false);

  if (!currentTrack) return null;

  const cover = resolveCover(currentTrack.cover_path);
  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <Box
      borderTop="1px solid var(--border-color)"
      bg="var(--card-bg)"
      p={2}
      position="relative"
    >
      {/* Queue Popup (expands upward) */}
      {showQueue && (
        <Box
          position="absolute"
          bottom="100%"
          left={0}
          right={0}
          maxH="250px"
          overflowY="auto"
          bg="var(--card-bg-raised)"
          border="1px solid"
          borderColor="var(--border-color)"
          borderBottom="none"
          borderRadius="md md 0 0"
          boxShadow="lg"
          zIndex={10}
        >
          <HStack px={2} py={1} borderBottom="1px solid" borderColor="var(--border-color)" justify="space-between">
            <Text fontSize="2xs" fontWeight="semibold" color="var(--muted-text)">Queue ({queue.length})</Text>
            {queue.length > 0 && (
              <Button size="xs" variant="ghost" onClick={clearQueue} p={0} h="auto" minW="auto">
                <Text fontSize="2xs">Clear</Text>
              </Button>
            )}
          </HStack>
          {queue.length === 0 ? (
            <Text fontSize="2xs" color="var(--muted-text)" p={3} textAlign="center">
              Queue is empty
            </Text>
          ) : (
            <VStack align="stretch" gap={0} p={1}>
              {queue.slice(0, 20).map((track, idx) => (
                <HStack
                  key={`${track.id}-${idx}`}
                  px={2} py={1}
                  _hover={{ bg: 'var(--hover-bg)' }}
                  borderRadius="sm"
                  gap={1}
                >
                  <Text fontSize="2xs" color="var(--muted-text)" w="14px" textAlign="right" flexShrink={0}>{idx + 1}</Text>
                  <Box flex={1} minW={0}>
                    <Text fontSize="2xs" fontWeight="medium" lineClamp={1}>{track.title}</Text>
                  </Box>
                  <Button size="xs" variant="ghost" p={0} minW="auto" h="auto" onClick={() => removeFromQueue(idx)}>
                    <X size={10} />
                  </Button>
                </HStack>
              ))}
              {queue.length > 20 && (
                <Text fontSize="2xs" color="var(--muted-text)" textAlign="center" py={1}>
                  +{queue.length - 20} more
                </Text>
              )}
            </VStack>
          )}
        </Box>
      )}

      {/* Progress bar */}
      <Box
        h="2px" bg="var(--surface-muted)" borderRadius="full" mb={2} cursor="pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          seek(pct * duration);
        }}
      >
        <Box h="100%" w={`${progressPct}%`} bg="var(--icon-color)" borderRadius="full" transition="width 0.3s linear" />
      </Box>

      {/* Track info row */}
      <HStack gap={2} mb={2}>
        {cover ? (
          <Box as="img" src={cover} w="32px" h="32px" borderRadius="sm" objectFit="cover" flexShrink={0} />
        ) : (
          <Box w="32px" h="32px" bg="var(--surface-muted)" borderRadius="sm" display="flex" alignItems="center" justifyContent="center" flexShrink={0}>
            <Music size={14} color="var(--muted-text)" />
          </Box>
        )}
        <Box flex={1} minW={0}>
          <Text fontSize="xs" fontWeight="semibold" lineClamp={1}>{currentTrack.title}</Text>
          <Text fontSize="2xs" color="var(--muted-text)" lineClamp={1}>{currentTrack.artist}</Text>
        </Box>
      </HStack>

      {/* Controls */}
      <HStack justify="center" gap={0}>
        <Button
          size="xs" variant="ghost" onClick={toggleShuffle} p={1} minW="auto"
          color={shuffle ? 'var(--icon-color)' : 'var(--muted-text)'}
          title={shuffle ? 'Shuffle on' : 'Shuffle off'}
        >
          <Shuffle size={12} />
        </Button>
        <Button size="xs" variant="ghost" onClick={prev} p={1} minW="auto">
          <SkipBack size={14} />
        </Button>
        <Button
          size="sm" variant="ghost" onClick={isPlaying ? pause : resume}
          p={1} minW="auto"
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </Button>
        <Button size="xs" variant="ghost" onClick={next} p={1} minW="auto" disabled={queue.length === 0}>
          <SkipForward size={14} />
        </Button>
        <Button
          size="xs" variant="ghost" onClick={() => setShowQueue(!showQueue)} p={1} minW="auto"
          position="relative"
        >
          <ListMusic size={12} />
          {queue.length > 0 && (
            <Box
              position="absolute" top="-2px" right="-2px"
              w="12px" h="12px" borderRadius="full"
              bg="blue.500" color="white" fontSize="2xs"
              display="flex" alignItems="center" justifyContent="center"
              lineHeight="1"
            >
              {queue.length > 9 ? '9+' : queue.length}
            </Box>
          )}
        </Button>
        <Button
          size="xs" variant="ghost" onClick={() => setShowPlaylistAdd(true)} p={1} minW="auto"
          title="Add to playlist"
        >
          <ListPlus size={12} />
        </Button>
      </HStack>

      {/* Time + Volume */}
      <HStack justify="space-between" mt={1}>
        <Text fontSize="2xs" color="var(--muted-text)">{formatTime(progress)} / {formatTime(duration)}</Text>
        <HStack gap={1}>
          <Button
            size="xs" variant="ghost" p={0} minW="auto" h="auto"
            onClick={() => setVolume(volume > 0 ? 0 : 0.7)}
          >
            {volume === 0 ? <VolumeX size={10} /> : <Volume2 size={10} />}
          </Button>
          <Box
            w="40px" h="3px" bg="var(--surface-muted)" borderRadius="full" cursor="pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              setVolume(pct);
            }}
          >
            <Box h="100%" w={`${volume * 100}%`} bg="var(--icon-color)" borderRadius="full" />
          </Box>
        </HStack>
      </HStack>

      {showPlaylistAdd && (
        <AddToPlaylistPopup trackId={currentTrack.id} onClose={() => setShowPlaylistAdd(false)} />
      )}
    </Box>
  );
};

export default MusicPlayer;
