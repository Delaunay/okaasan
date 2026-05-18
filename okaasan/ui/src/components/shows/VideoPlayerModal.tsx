import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Box, HStack, Text, Button, Flex } from '@chakra-ui/react';
import { X, SkipForward, ToggleLeft, ToggleRight } from 'lucide-react';

interface EpisodeFile {
  id: number;
  season: number | null;
  episode: number | null;
  title?: string;
}

interface VideoPlayerModalProps {
  streamUrl: string;
  title: string;
  episodeLabel?: string;
  onClose: () => void;
  onNext?: () => void;
  hasNext?: boolean;
}

const AUTO_NEXT_KEY = 'video-player-auto-next';

const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  streamUrl,
  title,
  episodeLabel,
  onClose,
  onNext,
  hasNext = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [autoNext, setAutoNext] = useState(() => {
    return localStorage.getItem(AUTO_NEXT_KEY) === 'true';
  });

  const toggleAutoNext = useCallback(() => {
    setAutoNext(prev => {
      const next = !prev;
      localStorage.setItem(AUTO_NEXT_KEY, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => {
      if (autoNext && hasNext && onNext) {
        onNext();
      }
    };
    video.addEventListener('ended', handleEnded);
    return () => video.removeEventListener('ended', handleEnded);
  }, [autoNext, hasNext, onNext]);

  // Prevent body scrolling while modal is open; stop video on unmount
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const video = videoRef.current;
    return () => {
      document.body.style.overflow = '';
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    };
  }, []);

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
      <Flex
        px={4}
        py={3}
        justify="space-between"
        align="center"
        flexShrink={0}
      >
        <Box>
          <Text color="white" fontWeight="bold" fontSize="md">{title}</Text>
          {episodeLabel && (
            <Text color="whiteAlpha.700" fontSize="sm">{episodeLabel}</Text>
          )}
        </Box>
        <HStack gap={3}>
          {/* Auto-next toggle */}
          <HStack
            gap={1}
            cursor="pointer"
            onClick={toggleAutoNext}
            opacity={0.8}
            _hover={{ opacity: 1 }}
          >
            {autoNext ? <ToggleRight size={20} color="white" /> : <ToggleLeft size={20} color="gray" />}
            <Text fontSize="xs" color={autoNext ? 'white' : 'gray'}> Auto-Next</Text>
          </HStack>
          {/* Next episode */}
          {hasNext && onNext && (
            <Button
              size="sm"
              variant="ghost"
              color="white"
              _hover={{ bg: 'whiteAlpha.200' }}
              onClick={onNext}
            >
              <SkipForward size={16} />
              <Text ml={1} fontSize="sm">Next</Text>
            </Button>
          )}
          {/* Close */}
          <Button
            size="sm"
            variant="ghost"
            color="white"
            _hover={{ bg: 'whiteAlpha.200' }}
            onClick={onClose}
          >
            <X size={20} />
          </Button>
        </HStack>
      </Flex>

      {/* Video */}
      <Box flex={1} display="flex" alignItems="center" justifyContent="center" px={4} pb={4}>
        <video
          ref={videoRef}
          src={streamUrl}
          controls
          autoPlay
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            borderRadius: '8px',
          }}
        />
      </Box>
    </Box>
  );
};

export default VideoPlayerModal;
