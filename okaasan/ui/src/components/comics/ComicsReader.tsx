import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Box, Flex, HStack, Text, IconButton, Spinner } from '@chakra-ui/react';
import { X, ChevronLeft, ChevronRight, BookOpen, Columns2, ArrowRightLeft } from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface ComicsReaderProps {
  fileId: number;
  issueId: number;
  title: string;
  seriesTitle: string;
  startPage?: number;
  isManga?: boolean;
  onClose: () => void;
}

interface PageInfo {
  page_count: number;
}

const ComicsReader: React.FC<ComicsReaderProps> = ({
  fileId, issueId, title, seriesTitle, startPage = 0, isManga: initialManga = false, onClose,
}) => {
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(startPage);
  const [loading, setLoading] = useState(true);
  const [doubleSpread, setDoubleSpread] = useState(false);
  const [mangaMode, setMangaMode] = useState(initialManga);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    recipeAPI.request<PageInfo>(`/comics/read/${fileId}/info`)
      .then(info => {
        setPageCount(info.page_count);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [fileId]);

  const pageUrl = useCallback((pageNum: number) => {
    return `/api/comics/read/${fileId}/page/${pageNum}`;
  }, [fileId]);

  const goToPage = useCallback((page: number) => {
    if (page < 0 || page >= pageCount) return;
    setCurrentPage(page);
  }, [pageCount]);

  const step = doubleSpread ? 2 : 1;

  const goNext = useCallback(() => {
    const nextPage = currentPage + step;
    if (nextPage < pageCount) {
      setCurrentPage(nextPage);
    }
  }, [currentPage, step, pageCount]);

  const goPrev = useCallback(() => {
    const prevPage = currentPage - step;
    if (prevPage >= 0) {
      setCurrentPage(prevPage);
    }
  }, [currentPage, step]);

  const navForward = mangaMode ? goPrev : goNext;
  const navBackward = mangaMode ? goNext : goPrev;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        mangaMode ? goPrev() : goNext();
      } else if (e.key === 'ArrowLeft') {
        mangaMode ? goNext() : goPrev();
      } else if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, mangaMode]);

  const handleClose = useCallback(() => {
    recipeAPI.request(`/comics/${issueId}/progress`, {
      method: 'POST',
      body: JSON.stringify({ page: currentPage, total: pageCount }),
    }).catch(console.error);
    onClose();
  }, [issueId, currentPage, pageCount, onClose]);

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const half = rect.width / 2;

    if (x < half) {
      mangaMode ? goNext() : goPrev();
    } else {
      mangaMode ? goPrev() : goNext();
    }
  }, [mangaMode, goNext, goPrev]);

  if (loading) {
    return (
      <Box
        position="fixed"
        top={0}
        left={0}
        right={0}
        bottom={0}
        bg="black"
        zIndex={2000}
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Spinner size="xl" color="white" />
      </Box>
    );
  }

  const showSecondPage = doubleSpread && currentPage + 1 < pageCount;
  const leftPage = mangaMode && showSecondPage ? currentPage + 1 : currentPage;
  const rightPage = mangaMode && showSecondPage ? currentPage : currentPage + 1;

  return (
    <Box
      position="fixed"
      top={0}
      left={0}
      right={0}
      bottom={0}
      bg="black"
      zIndex={2000}
      display="flex"
      flexDirection="column"
    >
      {/* Top bar */}
      <Flex
        px={4}
        py={2}
        bg="rgba(0,0,0,0.85)"
        align="center"
        justify="space-between"
        flexShrink={0}
        borderBottom="1px solid rgba(255,255,255,0.1)"
      >
        <HStack gap={2}>
          <Text color="white" fontSize="sm" fontWeight="semibold" lineClamp={1}>
            {seriesTitle}
          </Text>
          <Text color="whiteAlpha.700" fontSize="sm">—</Text>
          <Text color="whiteAlpha.700" fontSize="sm" lineClamp={1}>
            {title}
          </Text>
        </HStack>

        <HStack gap={1}>
          <IconButton
            aria-label="Single page"
            size="sm"
            variant={!doubleSpread ? 'solid' : 'ghost'}
            colorPalette={!doubleSpread ? 'blue' : undefined}
            onClick={() => setDoubleSpread(false)}
            title="Single page"
          >
            <BookOpen size={16} />
          </IconButton>
          <IconButton
            aria-label="Double spread"
            size="sm"
            variant={doubleSpread ? 'solid' : 'ghost'}
            colorPalette={doubleSpread ? 'blue' : undefined}
            onClick={() => setDoubleSpread(true)}
            title="Double page spread"
          >
            <Columns2 size={16} />
          </IconButton>
          <IconButton
            aria-label="Toggle manga mode"
            size="sm"
            variant={mangaMode ? 'solid' : 'ghost'}
            colorPalette={mangaMode ? 'purple' : undefined}
            onClick={() => setMangaMode(m => !m)}
            title={mangaMode ? 'Manga mode (R→L)' : 'Standard mode (L→R)'}
          >
            <ArrowRightLeft size={16} />
          </IconButton>
          <IconButton
            aria-label="Close reader"
            size="sm"
            variant="ghost"
            onClick={handleClose}
          >
            <X size={18} color="white" />
          </IconButton>
        </HStack>
      </Flex>

      {/* Page display */}
      <Box
        flex={1}
        ref={containerRef}
        onClick={handleContainerClick}
        cursor="pointer"
        display="flex"
        alignItems="center"
        justifyContent="center"
        overflow="hidden"
        position="relative"
        userSelect="none"
      >
        {doubleSpread && showSecondPage ? (
          <Flex h="100%" align="center" justify="center" gap={0}>
            <Box h="100%" display="flex" alignItems="center">
              <img
                src={pageUrl(leftPage)}
                alt={`Page ${leftPage + 1}`}
                style={{ maxHeight: '100%', maxWidth: '50vw', objectFit: 'contain' }}
              />
            </Box>
            <Box h="100%" display="flex" alignItems="center">
              <img
                src={pageUrl(rightPage)}
                alt={`Page ${rightPage + 1}`}
                style={{ maxHeight: '100%', maxWidth: '50vw', objectFit: 'contain' }}
              />
            </Box>
          </Flex>
        ) : (
          <img
            src={pageUrl(currentPage)}
            alt={`Page ${currentPage + 1}`}
            style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
          />
        )}
      </Box>

      {/* Bottom bar */}
      <Flex
        px={4}
        py={2}
        bg="rgba(0,0,0,0.85)"
        align="center"
        justify="space-between"
        flexShrink={0}
        borderTop="1px solid rgba(255,255,255,0.1)"
      >
        <IconButton
          aria-label="Previous"
          size="sm"
          variant="ghost"
          onClick={mangaMode ? goNext : goPrev}
          disabled={mangaMode ? currentPage + step >= pageCount : currentPage - step < 0}
        >
          <ChevronLeft size={20} color="white" />
        </IconButton>

        <HStack gap={2}>
          <Text color="white" fontSize="sm">
            Page {currentPage + 1}{showSecondPage ? `-${currentPage + 2}` : ''} / {pageCount}
          </Text>
          {mangaMode && (
            <Badge colorPalette="purple" fontSize="2xs">R→L</Badge>
          )}
        </HStack>

        <IconButton
          aria-label="Next"
          size="sm"
          variant="ghost"
          onClick={mangaMode ? goPrev : goNext}
          disabled={mangaMode ? currentPage - step < 0 : currentPage + step >= pageCount}
        >
          <ChevronRight size={20} color="white" />
        </IconButton>
      </Flex>

      {/* Progress bar */}
      <Box h="3px" bg="rgba(255,255,255,0.1)">
        <Box
          h="100%"
          w={`${pageCount > 0 ? ((currentPage + 1) / pageCount) * 100 : 0}%`}
          bg="blue.500"
          transition="width 0.2s"
        />
      </Box>
    </Box>
  );
};

export default ComicsReader;
