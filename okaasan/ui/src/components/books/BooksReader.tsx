import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Flex, Text, HStack, Button } from '@chakra-ui/react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface BooksReaderProps {
  bookId: number;
  fileId: number;
  title: string;
  format: string;
  currentPage: number;
  totalPages: number | null;
  onClose: () => void;
}

const BooksReader: React.FC<BooksReaderProps> = ({
  bookId,
  fileId,
  title,
  format,
  currentPage,
  totalPages,
  onClose,
}) => {
  const [page, setPage] = useState(currentPage || 1);
  const [epubContent, setEpubContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const savedRef = useRef(false);
  const isPdf = format.toLowerCase() === 'pdf';

  const saveProgress = useCallback(async (pageNum: number) => {
    if (savedRef.current) return;
    savedRef.current = true;
    try {
      await recipeAPI.request(`/books/${bookId}/progress`, {
        method: 'POST',
        body: JSON.stringify({ current_page: pageNum }),
      });
    } catch (e) {
      console.error('Failed to save reading progress:', e);
    }
  }, [bookId]);

  const handleClose = useCallback(() => {
    saveProgress(page);
    onClose();
  }, [page, saveProgress, onClose]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleClose]);

  useEffect(() => {
    if (isPdf) return;
    setLoading(true);
    const fetchContent = async () => {
      try {
        const resp = await fetch(`/api/books/serve/${fileId}?page=${page}`);
        if (resp.ok) {
          const text = await resp.text();
          setEpubContent(text);
        }
      } catch (e) {
        console.error('Failed to load book content:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchContent();
  }, [fileId, page, isPdf]);

  const goToPage = useCallback((newPage: number) => {
    if (totalPages && newPage > totalPages) return;
    if (newPage < 1) return;
    savedRef.current = false;
    setPage(newPage);
  }, [totalPages]);

  useEffect(() => {
    const interval = setInterval(() => {
      savedRef.current = false;
      saveProgress(page);
    }, 30000);
    return () => clearInterval(interval);
  }, [page, saveProgress]);

  const pageLabel = totalPages
    ? `Page ${page} of ${totalPages}`
    : `Page ${page}`;

  return (
    <Box
      position="fixed"
      top={0}
      left={0}
      right={0}
      bottom={0}
      zIndex={2000}
      bg="var(--card-bg)"
      display="flex"
      flexDirection="column"
    >
      {/* Top bar */}
      <Flex
        px={4}
        py={2}
        borderBottom="1px solid"
        borderColor="var(--border-color)"
        bg="var(--card-bg-raised)"
        align="center"
        justify="space-between"
        flexShrink={0}
      >
        <HStack gap={3} minW={0} flex={1}>
          <Text fontSize="sm" fontWeight="semibold" lineClamp={1}>{title}</Text>
          <Text fontSize="xs" color="var(--muted-text)">{pageLabel}</Text>
        </HStack>
        <HStack gap={2}>
          {!isPdf && (
            <>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft size={16} />
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => goToPage(page + 1)}
                disabled={!!totalPages && page >= totalPages}
              >
                <ChevronRight size={16} />
              </Button>
            </>
          )}
          <Button size="xs" variant="ghost" onClick={handleClose}>
            <X size={16} />
          </Button>
        </HStack>
      </Flex>

      {/* Reader content */}
      <Box flex={1} overflow="hidden">
        {isPdf ? (
          <iframe
            src={`/api/books/serve/${fileId}`}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
            }}
            title={title}
          />
        ) : (
          <Box h="100%" overflow="auto" p={6} maxW="800px" mx="auto">
            {loading ? (
              <Flex justify="center" align="center" h="200px">
                <Text color="var(--muted-text)">Loading...</Text>
              </Flex>
            ) : epubContent ? (
              <Box
                className="book-content"
                fontSize="md"
                lineHeight="tall"
                dangerouslySetInnerHTML={{ __html: epubContent }}
                sx={{
                  'img': { maxWidth: '100%', height: 'auto' },
                  'p': { marginBottom: '1em' },
                  'h1, h2, h3, h4, h5, h6': { marginTop: '1.5em', marginBottom: '0.5em', fontWeight: 'bold' },
                  'h1': { fontSize: '1.8em' },
                  'h2': { fontSize: '1.5em' },
                  'h3': { fontSize: '1.3em' },
                  'blockquote': {
                    borderLeft: '3px solid var(--border-color)',
                    paddingLeft: '1em',
                    marginLeft: 0,
                    color: 'var(--muted-text)',
                    fontStyle: 'italic',
                  },
                }}
              />
            ) : (
              <iframe
                src={`/api/books/serve/${fileId}`}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }}
                title={title}
              />
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default BooksReader;
