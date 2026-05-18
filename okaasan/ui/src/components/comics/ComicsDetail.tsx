import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Flex, Heading, Text, VStack, HStack, Spinner, Badge, Image, Button } from '@chakra-ui/react';
import { ArrowLeft, Layers, BookOpen, User, Building2 } from 'lucide-react';
import { recipeAPI, resolveMediaUrl } from '../../services/api';
import ComicsReader from './ComicsReader';

interface ComicIssue {
  id: number;
  file_id: number;
  issue_number: number;
  title: string | null;
  page_count: number;
  read_pages: number;
  cover_url: string | null;
}

interface SeriesDetail {
  id: number;
  title: string;
  cover_url: string | null;
  comic_type: string;
  author: string | null;
  artist: string | null;
  publisher: string | null;
  year: number | null;
  description: string | null;
  issue_count: number;
  issues: ComicIssue[];
}

function resolveCover(coverUrl: string | null | undefined): string | undefined {
  return resolveMediaUrl(coverUrl);
}

const ComicsDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [series, setSeries] = useState<SeriesDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reader, setReader] = useState<{ fileId: number; issueId: number; title: string; startPage?: number } | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await recipeAPI.request<SeriesDetail>(`/comics/series/${id}`);
      setSeries(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRead = useCallback((issue: ComicIssue) => {
    const startPage = issue.read_pages > 0 && issue.read_pages < issue.page_count
      ? issue.read_pages
      : 0;
    setReader({
      fileId: issue.file_id,
      issueId: issue.id,
      title: issue.title || `Issue #${issue.issue_number}`,
      startPage,
    });
  }, []);

  const handleCloseReader = useCallback(() => {
    setReader(null);
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  if (!series) {
    return <Text color="var(--muted-text)">Series not found.</Text>;
  }

  const cover = resolveCover(series.cover_url);
  const readCount = series.issues.filter(i => i.read_pages >= i.page_count && i.page_count > 0).length;

  return (
    <>
      {reader && (
        <ComicsReader
          fileId={reader.fileId}
          issueId={reader.issueId}
          title={reader.title}
          seriesTitle={series.title}
          startPage={reader.startPage}
          isManga={series.comic_type === 'manga'}
          onClose={handleCloseReader}
        />
      )}

      <VStack gap={6} align="stretch" p={4}>
        <HStack>
          <Button size="sm" variant="ghost" onClick={() => navigate('/comics-library')}>
            <ArrowLeft size={16} />
          </Button>
          <Layers size={24} />
          <Heading size="lg" color="var(--heading-color)">{series.title}</Heading>
        </HStack>

        <Flex gap={6} direction={{ base: 'column', md: 'row' }}>
          <Box flexShrink={0} w={{ base: '100%', md: '220px' }}>
            {cover ? (
              <Image src={cover} alt={series.title} w="100%" borderRadius="lg" objectFit="cover" />
            ) : (
              <Box
                w="100%"
                h="320px"
                bg="var(--surface-muted)"
                borderRadius="lg"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <Layers size={64} color="var(--muted-text)" />
              </Box>
            )}
          </Box>

          <VStack align="stretch" gap={3} flex={1}>
            <HStack gap={2} flexWrap="wrap">
              <Badge colorPalette={series.comic_type === 'manga' ? 'purple' : 'blue'}>
                {series.comic_type === 'manga' ? 'Manga' : 'Comic'}
              </Badge>
              {series.year && <Badge colorPalette="gray">{series.year}</Badge>}
              <Badge colorPalette="green">{readCount}/{series.issue_count} read</Badge>
            </HStack>

            {series.author && (
              <HStack gap={2}>
                <User size={14} color="var(--muted-text)" />
                <Text fontSize="sm" color="var(--muted-text)">
                  {series.author}{series.artist && series.artist !== series.author ? ` / ${series.artist}` : ''}
                </Text>
              </HStack>
            )}

            {series.publisher && (
              <HStack gap={2}>
                <Building2 size={14} color="var(--muted-text)" />
                <Text fontSize="sm" color="var(--muted-text)">{series.publisher}</Text>
              </HStack>
            )}

            {series.description && (
              <Text fontSize="sm" color="var(--muted-text)" lineHeight="tall">
                {series.description}
              </Text>
            )}
          </VStack>
        </Flex>

        <Box>
          <HStack mb={4}>
            <BookOpen size={20} />
            <Heading size="md" color="var(--heading-color)">Issues</Heading>
            <Badge colorPalette="gray">{series.issues.length}</Badge>
          </HStack>

          <VStack align="stretch" gap={2}>
            {series.issues.map(issue => (
              <IssueRow key={issue.id} issue={issue} onRead={handleRead} />
            ))}
          </VStack>

          {series.issues.length === 0 && (
            <Text color="var(--muted-text)" fontSize="sm" textAlign="center" py={8}>
              No issues found for this series.
            </Text>
          )}
        </Box>
      </VStack>
    </>
  );
};

const IssueRow: React.FC<{ issue: ComicIssue; onRead: (issue: ComicIssue) => void }> = ({ issue, onRead }) => {
  const progress = issue.page_count > 0
    ? Math.round((issue.read_pages / issue.page_count) * 100)
    : 0;
  const isComplete = progress >= 100;

  return (
    <Box
      p={3}
      borderRadius="md"
      border="1px solid"
      borderColor="var(--border-color)"
      bg="var(--card-bg)"
      _hover={{ borderColor: 'var(--panel-blue-border)' }}
      transition="border-color 0.2s"
    >
      <Flex justify="space-between" align="center" gap={3}>
        <HStack gap={3} flex={1} minW={0}>
          <Badge colorPalette="gray" fontSize="xs" flexShrink={0}>
            #{issue.issue_number}
          </Badge>
          <Text fontSize="sm" fontWeight="medium" lineClamp={1}>
            {issue.title || `Issue #${issue.issue_number}`}
          </Text>
          {issue.page_count > 0 && (
            <Text fontSize="xs" color="var(--muted-text)" flexShrink={0}>
              {issue.page_count} pages
            </Text>
          )}
        </HStack>

        <HStack gap={2} flexShrink={0}>
          {progress > 0 && (
            <HStack gap={1}>
              <Box w="60px" h="4px" bg="var(--border-color)" borderRadius="full" overflow="hidden">
                <Box
                  h="100%"
                  w={`${progress}%`}
                  bg={isComplete ? 'green.500' : 'blue.500'}
                  borderRadius="full"
                />
              </Box>
              <Text fontSize="2xs" color="var(--muted-text)" w="35px" textAlign="right">
                {progress}%
              </Text>
            </HStack>
          )}
          <Button size="xs" onClick={() => onRead(issue)}>
            <BookOpen size={12} />
            <Text ml={1}>{progress > 0 && !isComplete ? 'Continue' : 'Read'}</Text>
          </Button>
        </HStack>
      </Flex>
    </Box>
  );
};

export default ComicsDetail;
