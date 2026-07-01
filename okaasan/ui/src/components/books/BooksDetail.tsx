import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Flex, Heading, Text, VStack, HStack, Spinner, Badge, Button } from '@chakra-ui/react';
import { BookOpen, ArrowLeft, Play, CheckCircle } from 'lucide-react';
import { recipeAPI, resolveMediaUrl } from '../../services/api';
import BooksReader from './BooksReader';

interface BookDetail {
  id: number;
  title: string;
  author: string;
  cover_path: string | null;
  format: string;
  page_count: number | null;
  genre: string | null;
  language: string | null;
  description: string | null;
  file_id: number | null;
  added_at: string | null;
  progress: number;
  current_page: number;
  status: string;
}

function resolveCover(coverPath: string | null | undefined): string | undefined {
  return resolveMediaUrl(coverPath);
}

const BooksDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<BookDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [readerOpen, setReaderOpen] = useState(false);

  const fetchBook = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await recipeAPI.request<BookDetail>(`/books/${id}`);
      setBook(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchBook(); }, [fetchBook]);

  const handleReaderClose = useCallback(() => {
    setReaderOpen(false);
    fetchBook();
  }, [fetchBook]);

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  if (!book) {
    return (
      <VStack p={4} gap={4}>
        <Text color="var(--muted-text)">Book not found.</Text>
        <Button size="sm" variant="ghost" onClick={() => navigate('/books/library')}>
          <ArrowLeft size={16} /> Back to Library
        </Button>
      </VStack>
    );
  }

  const cover = resolveCover(book.cover_path);
  const progressPct = book.page_count && book.page_count > 0
    ? Math.round((book.current_page / book.page_count) * 100)
    : book.progress;
  const isReading = book.status === 'reading' && book.current_page > 0;
  const isCompleted = book.status === 'completed';

  return (
    <>
      <Box maxW="4xl" mx="auto" p={6}>
        <VStack align="stretch" gap={6}>
          <HStack>
            <Button size="sm" variant="ghost" onClick={() => navigate(-1)}>
              <ArrowLeft size={16} />
            </Button>
            <BookOpen size={24} color="var(--icon-color)" />
            <Heading size="lg" color="var(--heading-color)" lineClamp={1}>{book.title}</Heading>
          </HStack>

          <Flex gap={6} direction={{ base: 'column', md: 'row' }}>
            {/* Cover */}
            <Box flexShrink={0}>
              {cover ? (
                <Box
                  w={{ base: '100%', md: '220px' }}
                  h={{ base: '300px', md: '330px' }}
                  borderRadius="lg"
                  overflow="hidden"
                  bgImage={`url(${cover})`}
                  bgSize="cover"
                  bgPosition="center"
                  border="1px solid"
                  borderColor="var(--border-color)"
                />
              ) : (
                <Flex
                  w={{ base: '100%', md: '220px' }}
                  h={{ base: '300px', md: '330px' }}
                  borderRadius="lg"
                  bg="var(--surface-muted)"
                  border="1px solid"
                  borderColor="var(--border-color)"
                  align="center"
                  justify="center"
                >
                  <BookOpen size={64} color="var(--muted-text)" />
                </Flex>
              )}
            </Box>

            {/* Info */}
            <VStack align="stretch" flex={1} gap={4}>
              <Box>
                <Text fontSize="xl" fontWeight="bold">{book.title}</Text>
                <Text fontSize="md" color="var(--muted-text)" mt={1}>by {book.author}</Text>
              </Box>

              <HStack gap={2} flexWrap="wrap">
                <Badge colorPalette={book.format.toLowerCase() === 'epub' ? 'purple' : 'orange'}>
                  {book.format}
                </Badge>
                {book.genre && <Badge colorPalette="teal">{book.genre}</Badge>}
                {book.language && <Badge colorPalette="gray">{book.language}</Badge>}
                {isCompleted && (
                  <Badge colorPalette="green">
                    <HStack gap={1}><CheckCircle size={12} /><Text>Completed</Text></HStack>
                  </Badge>
                )}
              </HStack>

              {book.page_count && (
                <Text fontSize="sm" color="var(--muted-text)">{book.page_count} pages</Text>
              )}

              {/* Reading progress */}
              <Box
                p={4}
                bg="var(--card-bg)"
                border="1px solid"
                borderColor="var(--border-color)"
                borderRadius="lg"
              >
                <HStack justify="space-between" mb={2}>
                  <Text fontSize="sm" fontWeight="semibold">Reading Progress</Text>
                  <Text fontSize="sm" fontWeight="bold">{progressPct}%</Text>
                </HStack>
                <Box w="100%" h="8px" bg="var(--surface-muted)" borderRadius="full" overflow="hidden">
                  <Box
                    h="100%"
                    w={`${progressPct}%`}
                    bg="blue.500"
                    borderRadius="full"
                    transition="width 0.3s"
                  />
                </Box>
                {book.page_count && (
                  <Text fontSize="xs" color="var(--muted-text)" mt={2}>
                    Page {book.current_page} of {book.page_count}
                  </Text>
                )}
              </Box>

              {/* Read button */}
              {book.file_id && (
                <Button
                  colorPalette="blue"
                  size="lg"
                  onClick={() => setReaderOpen(true)}
                >
                  <Play size={18} />
                  <Text ml={2}>{isReading ? 'Continue Reading' : 'Start Reading'}</Text>
                </Button>
              )}

              {/* Description */}
              {book.description && (
                <Box>
                  <Heading size="sm" mb={2} color="var(--heading-color)">Description</Heading>
                  <Text fontSize="sm" color="var(--muted-text)" lineHeight="tall" whiteSpace="pre-wrap">
                    {book.description}
                  </Text>
                </Box>
              )}

              {book.added_at && (
                <Text fontSize="xs" color="var(--muted-text)">
                  Added {new Date(book.added_at).toLocaleDateString()}
                </Text>
              )}
            </VStack>
          </Flex>
        </VStack>
      </Box>

      {readerOpen && book.file_id && (
        <BooksReader
          bookId={book.id}
          fileId={book.file_id}
          title={book.title}
          format={book.format}
          currentPage={book.current_page}
          totalPages={book.page_count}
          onClose={handleReaderClose}
        />
      )}
    </>
  );
};

export default BooksDetail;
