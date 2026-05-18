import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Flex, Heading, Text, VStack, HStack, Spinner, Badge, Image, Button } from '@chakra-ui/react';
import { Headphones, Play, ArrowLeft, Clock, BookOpen, User } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import AudiobooksPlayer from './AudiobooksPlayer';

interface Chapter {
  id: number;
  index: number;
  title: string;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
}

interface AudiobookDetail {
  id: number;
  title: string;
  author: string;
  narrator: string;
  description: string;
  cover_path: string | null;
  duration_seconds: number;
  progress_seconds: number;
  progress_percent: number;
  current_chapter: number;
  completed: boolean;
  chapters: Chapter[];
  file_path: string;
  added_at: string;
}

function formatDuration(seconds: number): string {
  if (!seconds) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function resolveCover(coverPath: string | null | undefined): string | undefined {
  if (!coverPath) return undefined;
  if (coverPath.startsWith('uploads/')) return `/api/${coverPath}`;
  if (coverPath.startsWith('/uploads/')) return `/api${coverPath}`;
  if (coverPath.startsWith('http')) return coverPath;
  return `/api/${coverPath}`;
}

const AudiobooksDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<AudiobookDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPlayer, setShowPlayer] = useState(false);
  const [startChapter, setStartChapter] = useState<number | undefined>(undefined);

  const fetchBook = () => {
    if (!id) return;
    setLoading(true);
    recipeAPI.request<AudiobookDetail>(`/audiobooks/${id}`)
      .then(setBook)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchBook(); }, [id]);

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  if (!book) {
    return <Text color="var(--muted-text)">Audiobook not found.</Text>;
  }

  const cover = resolveCover(book.cover_path);
  const currentChapterData = book.chapters.find(c => c.index === book.current_chapter);

  const handlePlayFromChapter = (chapterIndex: number) => {
    setStartChapter(chapterIndex);
    setShowPlayer(true);
  };

  return (
    <VStack gap={6} align="stretch" p={4}>
      {showPlayer && (
        <AudiobooksPlayer
          bookId={book.id}
          initialChapter={startChapter}
          onClose={() => { setShowPlayer(false); setStartChapter(undefined); fetchBook(); }}
        />
      )}

      <HStack>
        <Button size="sm" variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
        </Button>
        <Headphones size={24} color="var(--icon-color)" />
        <Heading size="lg" color="var(--heading-color)" lineClamp={1}>{book.title}</Heading>
      </HStack>

      <Flex gap={6} direction={{ base: 'column', md: 'row' }}>
        <Box flexShrink={0}>
          {cover ? (
            <Image
              src={cover}
              alt={book.title}
              w={{ base: '100%', md: '250px' }}
              maxH="350px"
              objectFit="cover"
              borderRadius="lg"
              boxShadow="lg"
            />
          ) : (
            <Box
              w={{ base: '100%', md: '250px' }}
              h="350px"
              bg="var(--surface-muted)"
              display="flex"
              alignItems="center"
              justifyContent="center"
              borderRadius="lg"
            >
              <Headphones size={64} color="var(--muted-text)" />
            </Box>
          )}
        </Box>

        <VStack align="stretch" gap={4} flex={1}>
          <Box>
            <HStack gap={2} mb={1}>
              <User size={14} color="var(--muted-text)" />
              <Text fontSize="sm" color="var(--muted-text)">Author</Text>
            </HStack>
            <Text fontWeight="semibold">{book.author}</Text>
          </Box>

          {book.narrator && (
            <Box>
              <HStack gap={2} mb={1}>
                <Headphones size={14} color="var(--muted-text)" />
                <Text fontSize="sm" color="var(--muted-text)">Narrator</Text>
              </HStack>
              <Text fontWeight="semibold">{book.narrator}</Text>
            </Box>
          )}

          <HStack gap={4} flexWrap="wrap">
            <HStack gap={1}>
              <Clock size={14} color="var(--muted-text)" />
              <Text fontSize="sm">{formatDuration(book.duration_seconds)}</Text>
            </HStack>
            <HStack gap={1}>
              <BookOpen size={14} color="var(--muted-text)" />
              <Text fontSize="sm">{book.chapters.length} chapters</Text>
            </HStack>
            {book.completed ? (
              <Badge colorPalette="green">Completed</Badge>
            ) : book.progress_percent > 0 ? (
              <Badge colorPalette="blue">{Math.round(book.progress_percent)}% complete</Badge>
            ) : null}
          </HStack>

          {book.progress_percent > 0 && !book.completed && (
            <Box>
              <Flex justify="space-between" mb={1}>
                <Text fontSize="xs" color="var(--muted-text)">
                  {currentChapterData ? `Chapter: ${currentChapterData.title}` : ''}
                </Text>
                <Text fontSize="xs" color="var(--muted-text)">
                  {formatDuration(book.duration_seconds - book.progress_seconds)} remaining
                </Text>
              </Flex>
              <Box w="100%" h="6px" bg="var(--surface-muted)" borderRadius="full" overflow="hidden">
                <Box
                  h="100%"
                  w={`${book.progress_percent}%`}
                  bg="var(--icon-color)"
                  borderRadius="full"
                  transition="width 0.3s"
                />
              </Box>
            </Box>
          )}

          <Button
            colorPalette="blue"
            onClick={() => setShowPlayer(true)}
            size="lg"
          >
            <Play size={18} />
            <Text ml={2}>{book.progress_seconds > 0 ? 'Continue Listening' : 'Start Listening'}</Text>
          </Button>

          {book.description && (
            <Box
              p={4}
              bg="var(--card-bg)"
              border="1px solid"
              borderColor="var(--border-color)"
              borderRadius="lg"
            >
              <Text fontSize="sm" color="var(--muted-text)" whiteSpace="pre-wrap">
                {book.description}
              </Text>
            </Box>
          )}
        </VStack>
      </Flex>

      {book.chapters.length > 0 && (
        <Box>
          <HStack mb={3}>
            <BookOpen size={20} />
            <Heading size="md" color="var(--heading-color)">Chapters</Heading>
            <Badge colorPalette="gray">{book.chapters.length}</Badge>
          </HStack>
          <VStack align="stretch" gap={1}>
            {book.chapters.map((chapter) => {
              const isCurrentChapter = chapter.index === book.current_chapter && book.progress_seconds > 0;
              const isPlayed = book.progress_seconds >= chapter.end_seconds;

              return (
                <HStack
                  key={chapter.id}
                  p={3}
                  bg={isCurrentChapter ? 'var(--selected-bg)' : 'var(--card-bg)'}
                  border="1px solid"
                  borderColor={isCurrentChapter ? 'var(--panel-blue-border)' : 'var(--border-color)'}
                  borderRadius="md"
                  transition="all 0.2s"
                  _hover={{ borderColor: 'var(--panel-blue-border)' }}
                >
                  <Button
                    size="xs"
                    variant="ghost"
                    p={1}
                    minW="auto"
                    h="auto"
                    borderRadius="full"
                    onClick={() => handlePlayFromChapter(chapter.index)}
                    title={`Play ${chapter.title}`}
                  >
                    <Play size={14} />
                  </Button>
                  <Box flex={1} minW={0}>
                    <Text
                      fontSize="sm"
                      fontWeight={isCurrentChapter ? 'bold' : 'normal'}
                      lineClamp={1}
                      color={isPlayed ? 'var(--muted-text)' : undefined}
                    >
                      {chapter.title}
                    </Text>
                  </Box>
                  <Text fontSize="xs" color="var(--muted-text)" flexShrink={0}>
                    {formatTimestamp(chapter.start_seconds)}
                  </Text>
                  <Badge colorPalette="gray" fontSize="2xs" flexShrink={0}>
                    {formatDuration(chapter.duration_seconds)}
                  </Badge>
                  {isCurrentChapter && (
                    <Badge colorPalette="blue" fontSize="2xs" flexShrink={0}>Playing</Badge>
                  )}
                </HStack>
              );
            })}
          </VStack>
        </Box>
      )}
    </VStack>
  );
};

export default AudiobooksDetail;
