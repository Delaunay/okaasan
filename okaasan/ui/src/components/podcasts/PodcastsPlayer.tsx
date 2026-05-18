import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Box, Flex, Heading, Text, VStack, HStack, Image, Button, Badge } from '@chakra-ui/react';
import { X, Play, Pause, SkipBack, SkipForward, Check, Podcast } from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface PodcastEpisode {
  id: number;
  podcast_id: number;
  podcast_title: string;
  podcast_image: string | null;
  title: string;
  description: string;
  audio_url: string;
  duration: number | null;
  published_at: string;
  played: boolean;
  play_position: number;
}

interface PodcastsPlayerProps {
  episode: PodcastEpisode;
  onClose: () => void;
  onMarkPlayed: () => void;
}

type PlaybackSpeed = 1 | 1.5 | 2;

const PodcastsPlayer: React.FC<PodcastsPlayerProps> = ({ episode, onClose, onMarkPlayed }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(episode.play_position || 0);
  const [duration, setDuration] = useState(episode.duration || 0);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [isSeeking, setIsSeeking] = useState(false);
  const saveInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const seekBarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const audio = new Audio(episode.audio_url);
    audioRef.current = audio;

    audio.currentTime = episode.play_position || 0;

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
    });

    audio.addEventListener('timeupdate', () => {
      if (!isSeeking) {
        setCurrentTime(audio.currentTime);
      }
    });

    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      handleMarkPlayed();
    });

    audio.play().then(() => setIsPlaying(true)).catch(() => {});

    saveInterval.current = setInterval(() => {
      if (audio && !audio.paused) {
        savePosition(audio.currentTime);
      }
    }, 10000);

    return () => {
      if (saveInterval.current) clearInterval(saveInterval.current);
      if (audio) {
        savePosition(audio.currentTime);
        audio.pause();
        audio.src = '';
      }
    };
  }, [episode.id]);

  const savePosition = async (position: number) => {
    try {
      await recipeAPI.request(`/podcasts/episodes/${episode.id}/position`, {
        method: 'POST',
        body: JSON.stringify({ position: Math.floor(position) }),
      });
    } catch (e) {
      // silently fail
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const skip = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds));
    setCurrentTime(audio.currentTime);
  };

  const cycleSpeed = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const next: PlaybackSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    audio.playbackRate = next;
  };

  const handleMarkPlayed = async () => {
    try {
      await recipeAPI.request(`/podcasts/episodes/${episode.id}/played`, { method: 'POST' });
      onMarkPlayed();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const bar = seekBarRef.current;
    if (!audio || !bar) return;

    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = ratio * (duration || audio.duration);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <Box
      position="fixed"
      top={0}
      left={0}
      right={0}
      bottom={0}
      zIndex={9999}
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        bg="blackAlpha.700"
        onClick={onClose}
      />

      <Box
        position="relative"
        bg="var(--card-bg-raised)"
        borderRadius="xl"
        border="1px solid"
        borderColor="var(--border-color)"
        p={6}
        maxW="500px"
        w="90%"
        boxShadow="2xl"
      >
        <Button
          position="absolute"
          top={3}
          right={3}
          size="sm"
          variant="ghost"
          onClick={onClose}
          p={1}
          minW="auto"
          h="auto"
        >
          <X size={18} />
        </Button>

        <VStack gap={5}>
          {episode.podcast_image ? (
            <Image
              src={episode.podcast_image}
              alt={episode.podcast_title}
              w="160px"
              h="160px"
              borderRadius="lg"
              objectFit="cover"
            />
          ) : (
            <Box
              w="160px"
              h="160px"
              borderRadius="lg"
              bg="var(--surface-muted)"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <Podcast size={64} color="var(--muted-text)" />
            </Box>
          )}

          <VStack gap={1} textAlign="center">
            <Heading size="md" lineClamp={2}>{episode.title}</Heading>
            <Text fontSize="sm" color="var(--muted-text)">{episode.podcast_title}</Text>
          </VStack>

          {/* Seek bar */}
          <Box w="100%">
            <Box
              ref={seekBarRef}
              w="100%"
              h="6px"
              bg="var(--border-color)"
              borderRadius="full"
              cursor="pointer"
              position="relative"
              onClick={handleSeek}
            >
              <Box
                h="100%"
                w={`${progress}%`}
                bg="blue.400"
                borderRadius="full"
                transition="width 0.1s linear"
              />
              <Box
                position="absolute"
                top="50%"
                left={`${progress}%`}
                transform="translate(-50%, -50%)"
                w="14px"
                h="14px"
                borderRadius="full"
                bg="blue.400"
                boxShadow="sm"
              />
            </Box>
            <HStack justify="space-between" mt={1}>
              <Text fontSize="xs" color="var(--muted-text)">{formatTime(currentTime)}</Text>
              <Text fontSize="xs" color="var(--muted-text)">{formatTime(duration)}</Text>
            </HStack>
          </Box>

          {/* Controls */}
          <HStack gap={4} justify="center">
            <Button
              variant="ghost"
              onClick={() => skip(-15)}
              p={2}
              borderRadius="full"
              title="Back 15s"
            >
              <SkipBack size={20} />
            </Button>

            <Button
              onClick={togglePlay}
              p={3}
              borderRadius="full"
              colorPalette="blue"
              size="lg"
            >
              {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </Button>

            <Button
              variant="ghost"
              onClick={() => skip(15)}
              p={2}
              borderRadius="full"
              title="Forward 15s"
            >
              <SkipForward size={20} />
            </Button>
          </HStack>

          {/* Speed + Mark played */}
          <HStack gap={3} justify="center">
            <Button
              size="sm"
              variant="outline"
              onClick={cycleSpeed}
              borderRadius="full"
              fontWeight="bold"
              fontSize="xs"
            >
              {speed}x
            </Button>

            {!episode.played && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleMarkPlayed}
                borderRadius="full"
              >
                <Check size={14} />
                <Text ml={1}>Mark Played</Text>
              </Button>
            )}

            {episode.played && (
              <Badge colorPalette="green">Played</Badge>
            )}
          </HStack>
        </VStack>
      </Box>
    </Box>
  );
};

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default PodcastsPlayer;
