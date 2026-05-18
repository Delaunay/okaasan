import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Box, HStack, VStack, Text, Button, Flex } from '@chakra-ui/react';
import { X, Play, Pause, SkipForward, ToggleLeft, ToggleRight } from 'lucide-react';
import { recipeAPI } from '../../services/api';

export interface EpisodeFile {
  id: number;
  season: number | null;
  episode: number | null;
  title?: string | null;
  file_path?: string | null;
}

interface VideoPlayerModalProps {
  title: string;
  files: EpisodeFile[];
  onClose: () => void;
}

const AUTO_NEXT_KEY = 'video-player-auto-next';

function epLabel(f: EpisodeFile): string {
  if (f.season != null && f.episode != null) {
    return `S${String(f.season).padStart(2, '0')}E${String(f.episode).padStart(2, '0')}`;
  }
  if (f.file_path) {
    return f.file_path.split('/').pop() || `File #${f.id}`;
  }
  return `File #${f.id}`;
}

const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({ title, files, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [autoNext, setAutoNext] = useState(() => localStorage.getItem(AUTO_NEXT_KEY) === 'true');

  const killVlc = useCallback(() => {
    // Stop the video element first to sever the HTTP connection
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    // Synchronous XHR — blocks until the server confirms the kill
    const apiBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiBase}/shows/library/stream/stop`, false);
    try { xhr.send(); } catch (_) { /* ignore network errors */ }
  }, []);

  const currentFile = files[currentIndex] || null;
  const streamUrl = currentFile && playing ? `/api/shows/library/stream/${currentFile.id}` : '';

  const toggleAutoNext = useCallback(() => {
    setAutoNext(prev => {
      const next = !prev;
      localStorage.setItem(AUTO_NEXT_KEY, String(next));
      return next;
    });
  }, []);

  const selectEpisode = useCallback((index: number) => {
    setPlaying(false);
    setCurrentIndex(index);
  }, []);

  const handlePlay = useCallback(() => {
    setPlaying(true);
  }, []);

  const handleClose = useCallback(() => {
    killVlc();
    onClose();
  }, [killVlc, onClose]);

  const handleNext = useCallback(() => {
    if (currentIndex < files.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setPlaying(true);
    }
  }, [currentIndex, files.length]);

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  // Auto-next on video end
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleEnded = () => {
      if (autoNext && currentIndex < files.length - 1) {
        handleNext();
      }
    };
    video.addEventListener('ended', handleEnded);
    return () => video.removeEventListener('ended', handleEnded);
  }, [autoNext, currentIndex, files.length, handleNext]);

  // Prevent body scroll; kill VLC on unmount
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      killVlc();
    };
  }, [killVlc]);

  // When streamUrl changes, load it into the video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (streamUrl) {
      video.src = streamUrl;
      video.load();
      video.play().catch(() => {});
    } else {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }, [streamUrl]);

  return (
    <Box
      position="fixed"
      top={0}
      left={0}
      right={0}
      bottom={0}
      bg="rgba(0, 0, 0, 0.95)"
      zIndex={9999}
      display="flex"
      flexDirection="column"
    >
      {/* Header */}
      <Flex px={4} py={3} justify="space-between" align="center" flexShrink={0}>
        <Box>
          <Text color="white" fontWeight="bold" fontSize="md">{title}</Text>
          {currentFile && (
            <Text color="whiteAlpha.700" fontSize="sm">{epLabel(currentFile)}</Text>
          )}
        </Box>
        <HStack gap={3}>
          <HStack gap={1} cursor="pointer" onClick={toggleAutoNext} opacity={0.8} _hover={{ opacity: 1 }}>
            {autoNext ? <ToggleRight size={20} color="white" /> : <ToggleLeft size={20} color="gray" />}
            <Text fontSize="xs" color={autoNext ? 'white' : 'gray'}>Auto-Next</Text>
          </HStack>
          {currentIndex < files.length - 1 && (
            <Button size="sm" variant="ghost" color="white" _hover={{ bg: 'whiteAlpha.200' }} onClick={handleNext}>
              <SkipForward size={16} />
              <Text ml={1} fontSize="sm">Next</Text>
            </Button>
          )}
          <Button size="sm" variant="ghost" color="white" _hover={{ bg: 'whiteAlpha.200' }} onClick={handleClose}>
            <X size={20} />
          </Button>
        </HStack>
      </Flex>

      {/* Body: Video + Episode list */}
      <Flex flex={1} overflow="hidden" px={4} pb={4} gap={4}>
        {/* Video area */}
        <Box flex={1} display="flex" alignItems="center" justifyContent="center" position="relative">
          <video
            ref={videoRef}
            controls
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '8px' }}
          />
          {!playing && (
            <Box
              position="absolute"
              inset={0}
              display="flex"
              alignItems="center"
              justifyContent="center"
              cursor="pointer"
              onClick={handlePlay}
              borderRadius="8px"
              bg="rgba(0,0,0,0.4)"
              _hover={{ bg: 'rgba(0,0,0,0.2)' }}
              transition="background 0.2s"
            >
              <Box bg="blue.500" borderRadius="full" p={4}>
                <Play size={48} color="white" fill="white" />
              </Box>
            </Box>
          )}
        </Box>

        {/* Episode sidebar */}
        {files.length > 1 && (
          <Box
            w="280px"
            flexShrink={0}
            overflowY="auto"
            borderRadius="md"
            bg="rgba(255,255,255,0.05)"
            p={2}
          >
            <Text color="whiteAlpha.600" fontSize="xs" fontWeight="semibold" mb={2} px={2}>
              {files.length} Episodes
            </Text>
            <VStack gap={1} align="stretch">
              {files.map((f, i) => (
                <HStack
                  key={f.id}
                  px={3}
                  py={2}
                  borderRadius="md"
                  bg={i === currentIndex ? 'whiteAlpha.200' : 'transparent'}
                  _hover={{ bg: 'whiteAlpha.100' }}
                  cursor="pointer"
                  onClick={() => selectEpisode(i)}
                  gap={2}
                >
                  {i === currentIndex && playing ? (
                    <Pause size={14} color="white" />
                  ) : (
                    <Play size={14} color={i === currentIndex ? 'white' : 'gray'} />
                  )}
                  <Text
                    fontSize="sm"
                    color={i === currentIndex ? 'white' : 'whiteAlpha.700'}
                    lineClamp={1}
                  >
                    {epLabel(f)}
                  </Text>
                </HStack>
              ))}
            </VStack>
          </Box>
        )}
      </Flex>
    </Box>
  );
};

export default VideoPlayerModal;
