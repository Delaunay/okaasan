import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Text, Spinner, VStack, Heading, Flex } from '@chakra-ui/react';
import { recipeAPI } from '../../services/api';
import { ArticleBlock } from '../../services/type';
import Article from '../article/article';
import { ArticleDef, BlockDef } from '../article/base';

/**
 * Standalone read-only article view — no sidebar, no navigation.
 * Accessible at /#/share/article?id=<articleId>
 */
const StandaloneArticleView: React.FC = () => {
    const [searchParams] = useSearchParams();
    const [article, setArticle] = useState<ArticleDef | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const articleId = searchParams.get('id');

        if (!articleId) {
            setError('No article ID provided');
            setLoading(false);
            return;
        }

        const fetchArticle = async () => {
            try {
                setLoading(true);
                setError(null);

                const articleIdNum = parseInt(articleId, 10);
                if (isNaN(articleIdNum)) {
                    throw new Error('Invalid article ID');
                }

                const fetchedArticle = await recipeAPI.getArticle(articleIdNum);
                let childrenSource = fetchedArticle;
                let topLevelSource = fetchedArticle;
                const rootId = fetchedArticle.root_id ?? fetchedArticle.id;

                if (rootId && rootId !== fetchedArticle.id) {
                    try {
                        const rootArticle = await recipeAPI.getArticle(rootId);
                        childrenSource = rootArticle;
                        topLevelSource = rootArticle;
                    } catch (rootErr) {
                        console.warn('Failed to fetch root article, falling back to current article:', rootErr);
                    }
                }

                const articleDef: ArticleDef = {
                    id: fetchedArticle.id || 0,
                    root_id: fetchedArticle.root_id || fetchedArticle.id || 0,
                    parent_id: fetchedArticle.parent_id,
                    title: fetchedArticle.title || 'Untitled',
                    namespace: fetchedArticle.namespace || '',
                    tags: fetchedArticle.tags || {},
                    extension: fetchedArticle.extension || {},
                    public: fetchedArticle.public ?? false,
                    article_kind: fetchedArticle.article_kind ?? '',
                    sequence: 0,
                    blocks: convertBlocks(fetchedArticle.blocks || []),
                    orphans: convertBlocks(fetchedArticle.orphans || []),
                    children: childrenSource.children?.map(child => ({
                        id: child.id || 0,
                        root_id: child.root_id || 0,
                        parent_id: child.parent_id,
                        title: child.title || 'Untitled',
                        namespace: child.namespace || '',
                        tags: child.tags || {},
                        extension: child.extension || {},
                        public: child.public ?? false,
                        article_kind: child.article_kind ?? '',
                        sequence: 0,
                        blocks: [],
                        children: child.children
                    })),
                    top_level_article: {
                        id: topLevelSource.id || fetchedArticle.id || 0,
                        title: topLevelSource.title || fetchedArticle.title || 'Untitled'
                    }
                };

                setArticle(articleDef);
            } catch (err) {
                console.error('Failed to fetch article:', err);
                setError(err instanceof Error ? err.message : 'Failed to load article');
            } finally {
                setLoading(false);
            }
        };

        fetchArticle();
    }, [searchParams]);

    const convertBlocks = (blocks: ArticleBlock[]): BlockDef[] => {
        return blocks.map((block, i) => ({
            id: block.id || 0,
            page_id: block.page_id || 0,
            parent_id: block.parent_id,
            sequence: block.sequence || i,
            kind: block.kind || 'text',
            data: block.data || {},
            extension: block.extension || {},
            children: block.children ? convertBlocks(block.children) : []
        }));
    };

    if (loading) {
        return (
            <Flex minH="100vh" align="center" justify="center" bg="var(--card-bg)">
                <VStack gap={4}>
                    <Spinner size="xl" color="orange.500" />
                    <Text color="var(--muted-text)">Loading article...</Text>
                </VStack>
            </Flex>
        );
    }

    if (error) {
        return (
            <Flex minH="100vh" align="center" justify="center" bg="var(--card-bg)">
                <Box p={6} bg="bg.error.subtle" borderRadius="md" border="1px solid" borderColor="border.error" maxW="500px">
                    <Text color="fg.error" fontSize="lg" fontWeight="600" mb={2}>
                        Error loading article
                    </Text>
                    <Text color="fg.error">{error}</Text>
                </Box>
            </Flex>
        );
    }

    if (!article) {
        return (
            <Flex minH="100vh" align="center" justify="center" bg="var(--card-bg)">
                <Text color="var(--muted-text)">Article not found</Text>
            </Flex>
        );
    }

    return (
        <Box height="100vh" bg="var(--card-bg)" py={10} px={4} overflowY="auto">
            <Box maxW="800px" mx="auto">
                <Article article={article} options={{ editTrigger: "click", readonly: true }} />
            </Box>
        </Box>
    );
};

export default StandaloneArticleView;
