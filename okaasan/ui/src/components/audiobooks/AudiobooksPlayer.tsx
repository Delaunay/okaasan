import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Box, Flex, Heading, Text, VStack, HStack, Spinner, Image, Button } from '@chakra-ui/react';
import { X, Play, Pause, SkipBack, SkipForward, Moon, ChevronDown, Headphones } from 'lucide-react';
import { recipeAPI, resolveMediaUrl } from '../../services/api';

interface Chapter {
  id: number;
  index: number;
  title: string;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
}

interface PlayerData {
  id: number;
  title: string;
  author: string;
  narrator: string;
  cover_path: string | null;
  duration_seconds: number;
  progress_seconds: number;
  current_chapter: number;
  chapters: Chapter[];
  stream_url: string;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const SLEEP_OPTIONS = [
  { label: 'Off', minutes: 0 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '60 min', minutes: 60 },
  { label: '90 min', minutes: 90 },
];

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function resolveCover(coverPath: string | null | undefined): string | undefined {
  return resolveMediaUrl(coverPath);
}

interface AudiobooksPlayerProps {
  bookId: number;
  initialChapter?: number;
  onClose: () => void;
}

const AudiobooksPlayer: React.FC<AudiobooksPlayerProps> = ({ bookId, initialChapter, onClose }) => {
  const [data, setData] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showChapterMenu, setShowChapterMenu] = useState(false);
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [sleepRemaining, setSleepRemaining] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    recipeAPI.request<PlayerData>(`/audiobooks/${bookId}/player`)
      .then(d => {
        setData(d);
        setDuration(d.duration_seconds);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [bookId]);

  useEffect(() => {
    if (!data) return;
    const audio = new Audio(`/api${data.stream_url}`);
    audioRef.current = audio;

    const startPosition = initialChapter !== undefined
      ? data.chapters.find(c => c.index === initialChapter)?.start_seconds ?? data.progress_seconds
      : data.progress_seconds;

    audio.currentTime = startPosition;
    setCurrentTime(startPosition);

    audio.addEventListener('timeupdate', () => setCurrentTime(audio.currentTime));
    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration || data.duration_seconds);
      audio.currentTime = startPosition;
    });
    audio.addEventListener('ended', () => setPlaying(false));

    return () => {
      saveProgress(audio.currentTime);
      audio.pause();
      audio.src = '';
    };
  }, [data]);

  useEffect(() => {
    if (!audioRef.current) return;
    saveIntervalRef.current = setInterval(() => {
      if (audioRef.current && playing) {
        saveProgress(audioRef.current.currentTime);
      }
    }, 30000);
    return () => { if (saveIntervalRef.current) clearInterval(saveIntervalRef.current); };
  }, [playing, bookId]);

  const saveProgress = useCallback(async (position: number) => {
    try {
      await recipeAPI.request(`/audiobooks/${bookId}/progress`, {
        method: 'POST',
        body: JSON.stringify({ position_seconds: position }),
      });
    } catch (e) {
      console.error('Failed to save progress:', e);
    }
  }, [bookId]);

  useEffect(() => {
    if (sleepTimerRef.current) {
      clearInterval(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }
    if (sleepMinutes > 0) {
      setSleepRemaining(sleepMinutes * 60);
      sleepTimerRef.current = setInterval(() => {
        setSleepRemaining(prev => {
          if (prev <= 1) {
            if (audioRef.current) {
              audioRef.current.pause();
              setPlaying(false);
              saveProgress(audioRef.current.currentTime);
            }
            setSleepMinutes(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setSleepRemaining(0);
    }
    return () => { if (sleepTimerRef.current) clearInterval(sleepTimerRef.current); };
  }, [sleepMinutes]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      saveProgress(audioRef.current.currentTime);
    } else {
      audioRef.current.play().catch(console.error);
    }
    setPlaying(!playing);
  };

  const skip = (seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, Math.min(audioRef.current.currentTime + seconds, duration));
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = ratio * duration;
  };

  const setPlaybackSpeed = (newSpeed: number) => {
    setSpeed(newSpeed);
    if (audioRef.current) audioRef.current.playbackRate = newSpeed;
    setShowSpeedMenu(false);
  };

  const jumpToChapter = (chapter: Chapter) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = chapter.start_seconds;
    setShowChapterMenu(false);
  };

  const handleClose = () => {
    if (audioRef.current) {
      saveProgress(audioRef.current.currentTime);
      audioRef.current.pause();
    }
    onClose();
  };

  const currentChapter = data?.chapters.find(c =>
    currentTime >= c.start_seconds && currentTime < c.end_seconds
  );

  if (loading) {
    return (
      <Box position="fixed" inset={0} bg="rgba(0,0,0,0.9)" zIndex={2000} display="flex" alignItems="center" justifyContent="center">
        <Spinner size="xl" color="white" />
      </Box>
    );
  }

  if (!data) return null;

  const cover = resolveCover(data.cover_path);
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <Box position="fixed" inset={0} bg="rgba(0,0,0,0.95)" zIndex={2000} overflow="auto">
      <Flex direction="column" h="100%" maxW="600px" mx="auto" p={6} position="relative">
        <Button
          position="absolute"
          top={4}
          right={4}
          variant="ghost"
          color="white"
          _hover={{ bg: 'whiteAlpha.200' }}
          onClick={handleClose}
          zIndex={1}
        >
          <X size={24} />
        </Button>

        <Flex direction="column" align="center" flex={1} justify="center" gap={6}>
          {cover ? (
            <Image
              src={cover}
              alt={data.title}
              w="280px"
              h="280px"
              objectFit="cover"
              borderRadius="xl"
              boxShadow="2xl"
            />
          ) : (
            <Box
              w="280px"
              h="280px"
              bg="whiteAlpha.100"
              display="flex"
              alignItems="center"
              justifyContent="center"
              borderRadius="xl"
            >
              <Headphones size={80} color="rgba(255,255,255,0.3)" />
            </Box>
          )}

          <VStack gap={1} textAlign="center">
            <Heading size="md" color="white" lineClamp={2}>{data.title}</Heading>
            <Text color="whiteAlpha.700" fontSize="sm">{data.author}</Text>
            {data.narrator && <Text color="whiteAlpha.500" fontSize="xs">Narrated by {data.narrator}</Text>}
          </VStack>

          {/* Chapter selector */}
          <Box position="relative" w="100%">
            <Button
              variant="ghost"
              color="whiteAlpha.700"
              w="100%"
              size="sm"
              _hover={{ bg: 'whiteAlpha.100' }}
              onClick={() => { setShowChapterMenu(!showChapterMenu); setShowSpeedMenu(false); setShowSleepMenu(false); }}
            >
              <Text fontSize="xs" lineClamp={1}>
                {currentChapter ? currentChapter.title : 'Select Chapter'}
              </Text>
              <ChevronDown size={14} />
            </Button>
            {showChapterMenu && (
              <Box
                position="absolute"
                bottom="100%"
                left={0}
                right={0}
                maxH="250px"
                overflowY="auto"
                bg="gray.800"
                borderRadius="lg"
                border="1px solid"
                borderColor="whiteAlpha.200"
                mb={1}
                zIndex={10}
              >
                {data.chapters.map(ch => (
                  <Box
                    key={ch.id}
                    px={3}
                    py={2}
                    cursor="pointer"
                    bg={currentChapter?.index === ch.index ? 'whiteAlpha.200' : 'transparent'}
                    _hover={{ bg: 'whiteAlpha.100' }}
                    onClick={() => jumpToChapter(ch)}
                  >
                    <HStack justify="space-between">
                      <Text fontSize="xs" color="white" lineClamp={1}>{ch.title}</Text>
                      <Text fontSize="2xs" color="whiteAlpha.500" flexShrink={0}>{formatTimestamp(ch.start_seconds)}</Text>
                    </HStack>
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          {/* Seek bar */}
          <Box w="100%">
            <Box
              w="100%"
              h="8px"
              bg="whiteAlpha.200"
              borderRadius="full"
              cursor="pointer"
              position="relative"
              onClick={seek}
            >
              {data.chapters.map(ch => {
                if (ch.index === 0) return null;
                const markerPos = (ch.start_seconds / duration) * 100;
                return (
                  <Box
                    key={ch.id}
                    position="absolute"
                    left={`${markerPos}%`}
                    top={0}
                    bottom={0}
                    w="2px"
                    bg="whiteAlpha.400"
                  />
                );
              })}
              <Box
                h="100%"
                w={`${progressPercent}%`}
                bg="blue.400"
                borderRadius="full"
                position="relative"
              >
                <Box
                  position="absolute"
                  right="-6px"
                  top="50%"
                  transform="translateY(-50%)"
                  w="12px"
                  h="12px"
                  bg="white"
                  borderRadius="full"
                  boxShadow="md"
                />
              </Box>
            </Box>
            <Flex justify="space-between" mt={1}>
              <Text fontSize="xs" color="whiteAlpha.500">{formatTimestamp(currentTime)}</Text>
              <Text fontSize="xs" color="whiteAlpha.500">{formatTimestamp(duration)}</Text>
            </Flex>
          </Box>

          {/* Main controls */}
          <HStack gap={6} justify="center">
            <Button
              variant="ghost"
              color="white"
              borderRadius="full"
              p={2}
              _hover={{ bg: 'whiteAlpha.200' }}
              onClick={() => skip(-15)}
              title="Skip back 15s"
            >
              <SkipBack size={28} />
              <Text fontSize="2xs" position="absolute" bottom="2px" color="whiteAlpha.700">15</Text>
            </Button>

            <Button
              variant="ghost"
              color="white"
              borderRadius="full"
              w="64px"
              h="64px"
              bg="blue.500"
              _hover={{ bg: 'blue.600' }}
              onClick={togglePlay}
            >
              {playing ? <Pause size={32} /> : <Play size={32} />}
            </Button>

            <Button
              variant="ghost"
              color="white"
              borderRadius="full"
              p={2}
              _hover={{ bg: 'whiteAlpha.200' }}
              onClick={() => skip(15)}
              title="Skip forward 15s"
            >
              <SkipForward size={28} />
              <Text fontSize="2xs" position="absolute" bottom="2px" color="whiteAlpha.700">15</Text>
            </Button>
          </HStack>

          {/* Secondary controls */}
          <HStack gap={4} justify="center">
            {/* Speed control */}
            <Box position="relative">
              <Button
                variant="ghost"
                color="whiteAlpha.700"
                size="sm"
                _hover={{ bg: 'whiteAlpha.100' }}
                onClick={() => { setShowSpeedMenu(!showSpeedMenu); setShowChapterMenu(false); setShowSleepMenu(false); }}
              >
                {speed}x
              </Button>
              {showSpeedMenu && (
                <Box
                  position="absolute"
                  bottom="100%"
                  left="50%"
                  transform="translateX(-50%)"
                  bg="gray.800"
                  borderRadius="lg"
                  border="1px solid"
                  borderColor="whiteAlpha.200"
                  mb={1}
                  zIndex={10}
                  minW="80px"
                >
                  {SPEED_OPTIONS.map(s => (
                    <Box
                      key={s}
                      px={3}
                      py={1.5}
                      cursor="pointer"
                      textAlign="center"
                      bg={speed === s ? 'whiteAlpha.200' : 'transparent'}
                      _hover={{ bg: 'whiteAlpha.100' }}
                      onClick={() => setPlaybackSpeed(s)}
                    >
                      <Text fontSize="sm" color="white">{s}x</Text>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>

            {/* Sleep timer */}
            <Box position="relative">
              <Button
                variant="ghost"
                color={sleepMinutes > 0 ? 'blue.300' : 'whiteAlpha.700'}
                size="sm"
                _hover={{ bg: 'whiteAlpha.100' }}
                onClick={() => { setShowSleepMenu(!showSleepMenu); setShowSpeedMenu(false); setShowChapterMenu(false); }}
              >
                <Moon size={16} />
                {sleepRemaining > 0 && (
                  <Text ml={1} fontSize="xs">{formatTimestamp(sleepRemaining)}</Text>
                )}
              </Button>
              {showSleepMenu && (
                <Box
                  position="absolute"
                  bottom="100%"
                  left="50%"
                  transform="translateX(-50%)"
                  bg="gray.800"
                  borderRadius="lg"
                  border="1px solid"
                  borderColor="whiteAlpha.200"
                  mb={1}
                  zIndex={10}
                  minW="100px"
                >
                  {SLEEP_OPTIONS.map(opt => (
                    <Box
                      key={opt.minutes}
                      px={3}
                      py={1.5}
                      cursor="pointer"
                      textAlign="center"
                      bg={sleepMinutes === opt.minutes ? 'whiteAlpha.200' : 'transparent'}
                      _hover={{ bg: 'whiteAlpha.100' }}
                      onClick={() => { setSleepMinutes(opt.minutes); setShowSleepMenu(false); }}
                    >
                      <Text fontSize="sm" color="white">{opt.label}</Text>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </HStack>
        </Flex>
      </Flex>
    </Box>
  );
};

export default AudiobooksPlayer;
