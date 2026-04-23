
import React, { useState, useEffect } from 'react';

import { Box, Heading, VStack, HStack, Button, Text, Input, chakra, IconButton, Portal } from '@chakra-ui/react';
import { Plus, Settings } from 'lucide-react';
import { Link as RouterLinkBase } from 'react-router-dom';
import { useColorModeValue } from '../ui/color-mode';
import { ArticleDef } from './base';
import { recipeAPI, isStaticMode } from '../../services/api';

interface SubPageListProps {
    articleDef: ArticleDef;
}

const RouterLink = chakra(RouterLinkBase);

export const SubPageList: React.FC<SubPageListProps> = ({ articleDef }) => {
    const [isCreating, setIsCreating] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [children, setChildren] = useState<any[]>(articleDef.children || []);
    const topLevelArticle = articleDef.top_level_article ?? { id: articleDef.root_id || articleDef.id, title: articleDef.title };
    const isRootActive = topLevelArticle.id === articleDef.id;

    const [isActionsOpen, setIsActionsOpen] = useState(false);
    const [actionsMenuPos, setActionsMenuPos] = useState<{ x: number; y: number } | null>(null);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isMoveOpen, setIsMoveOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isMoving, setIsMoving] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [selectedParent, setSelectedParent] = useState<any | null>(null);

    const headingColor = useColorModeValue('gray.700', 'gray.200');
    const inputBg = useColorModeValue('white', 'gray.800');
    const inputBorder = useColorModeValue('gray.200', 'gray.600');
    const cardBg = useColorModeValue('white', 'gray.800');
    const cardBorder = useColorModeValue('gray.200', 'gray.700');
    const textColor = useColorModeValue('gray.700', 'gray.200');
    const emptyTextColor = useColorModeValue('gray.500', 'gray.400');
    const createBoxBg = useColorModeValue('gray.50', 'gray.700');

    useEffect(() => {
        setChildren(articleDef.children || []);
    }, [articleDef.children]);

    useEffect(() => {
        if (!isMoveOpen) {
            setSearchQuery("");
            setSearchResults([]);
            setSearchError(null);
            setSelectedParent(null);
            return;
        }
        const query = searchQuery.trim();
        if (!query) {
            setSearchResults([]);
            setSearchError(null);
            return;
        }

        const handle = setTimeout(async () => {
            try {
                setIsSearching(true);
                setSearchError(null);
                const results = await recipeAPI.searchArticles(query);
                setSearchResults(results);
            } catch (error) {
                console.error("Failed to search articles:", error);
                setSearchError("Failed to search articles.");
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(handle);
    }, [searchQuery, isMoveOpen]);

    const insertChildNode = (nodes: any[], parentId: number, child: any): any[] => {
        let inserted = false;
        const next = nodes.map((node) => {
            if (node.id === parentId) {
                inserted = true;
                const existingChildren = Array.isArray(node.children) ? node.children : [];
                return { ...node, children: [...existingChildren, child] };
            }
            if (node.children && node.children.length > 0) {
                const updatedChildren = insertChildNode(node.children, parentId, child);
                if (updatedChildren !== node.children) {
                    inserted = true;
                    return { ...node, children: updatedChildren };
                }
            }
            return node;
        });

        if (!inserted) {
            return nodes;
        }
        return next;
    };

    const handleCreate = async () => {
        if (!newTitle.trim()) return;

        try {
            const newArticle = await recipeAPI.createChildArticle(articleDef.id, {
                title: newTitle,
                root_id: articleDef.root_id || articleDef.id,
                namespace: articleDef.namespace,
                tags: [],
                extension: {}
            });

            const childWithTree = { ...newArticle, children: newArticle.children || [] };
            setChildren((prev) => {
                if (articleDef.id === topLevelArticle.id) {
                    return [...prev, childWithTree];
                }
                const updated = insertChildNode(prev, articleDef.id, childWithTree);
                return updated === prev ? [...prev, childWithTree] : updated;
            });
            setNewTitle("");
            setIsCreating(false);
        } catch (error) {
            console.error("Failed to create child article:", error);
        }
    };

    const removeNodeById = (nodes: any[], targetId: number): any[] => {
        return nodes
            .filter((node) => node.id !== targetId)
            .map((node) => ({
                ...node,
                children: node.children ? removeNodeById(node.children, targetId) : []
            }));
    };

    const handleDelete = async () => {
        try {
            setIsDeleting(true);
            await recipeAPI.deleteArticle(articleDef.id);
            setChildren((prev) => removeNodeById(prev, articleDef.id));
            setIsDeleteOpen(false);
        } catch (error) {
            console.error("Failed to delete article:", error);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleMove = async () => {
        if (!selectedParent) return;
        try {
            setIsMoving(true);
            await recipeAPI.moveArticle(articleDef.id, selectedParent.id);
            setChildren((prev) => removeNodeById(prev, articleDef.id));
            setIsMoveOpen(false);
        } catch (error) {
            console.error("Failed to move article:", error);
        } finally {
            setIsMoving(false);
        }
    };

    const actionControls = isStaticMode() ? null : (
        <HStack gap={1}>
            <Button
                size="xs"
                variant="ghost"
                onClick={() => setIsCreating(true)}
                disabled={isCreating}
            >
                <Plus size={16} style={{ marginRight: '4px' }} />
            </Button>
            <IconButton
                size="xs"
                variant="ghost"
                aria-label="Page actions"
                onClick={(event) => {
                    setActionsMenuPos({ x: event.clientX, y: event.clientY });
                    setIsActionsOpen(true);
                }}
            >
                <Settings size={16} />
            </IconButton>
        </HStack>
    );

    const renderTree = (nodes: any[]) => {
        if (!nodes || nodes.length === 0) return null;

        return (
            <Box as="ol" pl={4} style={{ listStylePosition: 'outside' }}>
                {nodes.map((node) => (
                    <Box as="li" key={node.id} mb={2}>
                        <HStack align="start" justifyContent="space-between">
                            <RouterLink
                                to={`/article?id=${node.id}`}
                                _hover={{ textDecoration: 'underline' }}
                                display="inline"
                                color={textColor}
                                fontWeight={node.id === articleDef.id ? 'bold' : 'normal'}
                            >
                                {node.title}
                            </RouterLink>
                            {node.id === articleDef.id ? actionControls : null}
                        </HStack>
                        {renderTree(node.children)}
                    </Box>
                ))}
            </Box>
        );
    };

    const actionsMenuStyle = (() => {
        if (!actionsMenuPos) return { top: "0px", left: "0px" };
        const menuWidth = 240;
        const menuHeight = 160;
        const padding = 8;
        const viewportWidth = typeof window !== "undefined" ? window.innerWidth : menuWidth + padding * 2;
        const viewportHeight = typeof window !== "undefined" ? window.innerHeight : menuHeight + padding * 2;
        const maxLeft = Math.max(padding, viewportWidth - menuWidth - padding);
        const maxTop = Math.max(padding, viewportHeight - menuHeight - padding);
        const left = Math.min(Math.max(actionsMenuPos.x + padding, padding), maxLeft);
        const top = Math.min(Math.max(actionsMenuPos.y + padding, padding), maxTop);
        return { top: `${top}px`, left: `${left}px` };
    })();

    return (
        <Box>
            <HStack justifyContent="space-between" mb={4}>
                <Heading size="md" color={headingColor}>
                    <RouterLink
                        to={`/article?id=${topLevelArticle.id}`}
                        color={headingColor}
                        _hover={{ textDecoration: 'underline' }}
                        fontWeight={topLevelArticle.id === articleDef.id ? 'bold' : 'normal'}
                    >
                        {topLevelArticle.title}
                    </RouterLink>
                </Heading>
                {isRootActive ? actionControls : null}
            </HStack>

            {isCreating && (
                <Box mb={4} p={3} bg={createBoxBg} borderRadius="md" border="1px solid" borderColor={inputBorder}>
                    <HStack>
                        <Input
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            placeholder="Page title"
                            autoFocus
                            size="sm"
                            bg={inputBg}
                            borderColor={inputBorder}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreate();
                                if (e.key === 'Escape') setIsCreating(false);
                            }}
                        />
                        <Button onClick={handleCreate} colorScheme="blue" size="sm">Create</Button>
                        <Button onClick={() => setIsCreating(false)} variant="ghost" size="sm">Cancel</Button>
                    </HStack>
                </Box>
            )}

            <VStack align="stretch" gap={2}>
                {children.length === 0 && !isCreating && (
                    <Text color={emptyTextColor} fontSize="sm" fontStyle="italic">No sub-pages yet.</Text>
                )}
                {renderTree(children)}
            </VStack>

            {isActionsOpen && actionsMenuPos && (
                <Portal>
                    <Box
                        position="fixed"
                        inset="0"
                        bg="blackAlpha.300"
                        zIndex={1400}
                        onClick={() => setIsActionsOpen(false)}
                    />
                    <Box
                        position="fixed"
                        top={actionsMenuStyle.top}
                        left={actionsMenuStyle.left}
                        bg={cardBg}
                        borderRadius="md"
                        border="1px solid"
                        borderColor={cardBorder}
                        p={4}
                        zIndex={1401}
                        minW="220px"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-label="Page actions"
                    >
                        <Text fontWeight="semibold" mb={3}>Page actions</Text>
                        <VStack align="stretch" gap={2}>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setIsActionsOpen(false);
                                    setIsMoveOpen(true);
                                }}
                            >
                                Move
                            </Button>
                            <Button
                                colorScheme="red"
                                variant="outline"
                                onClick={() => {
                                    setIsActionsOpen(false);
                                    setIsDeleteOpen(true);
                                }}
                            >
                                Delete
                            </Button>
                        </VStack>
                    </Box>
                </Portal>
            )}

            {isDeleteOpen && (
                <Portal>
                    <Box
                        position="fixed"
                        inset="0"
                        bg="blackAlpha.300"
                        zIndex={1400}
                        onClick={() => setIsDeleteOpen(false)}
                    />
                    <Box
                        position="fixed"
                        top="50%"
                        left="50%"
                        transform="translate(-50%, -50%)"
                        bg={cardBg}
                        borderRadius="md"
                        border="1px solid"
                        borderColor={cardBorder}
                        p={4}
                        zIndex={1401}
                        minW="320px"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-label="Delete page"
                    >
                        <Text fontWeight="semibold" mb={2}>Delete page?</Text>
                        <Text mb={4}>Are you sure you want to delete this page? This cannot be undone.</Text>
                        <HStack justifyContent="flex-end" gap={2}>
                            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
                                Cancel
                            </Button>
                            <Button colorScheme="red" onClick={handleDelete} loading={isDeleting}>
                                Delete
                            </Button>
                        </HStack>
                    </Box>
                </Portal>
            )}

            {isMoveOpen && (
                <Portal>
                    <Box
                        position="fixed"
                        inset="0"
                        bg="blackAlpha.300"
                        zIndex={1400}
                        onClick={() => setIsMoveOpen(false)}
                    />
                    <Box
                        position="fixed"
                        top="50%"
                        left="50%"
                        transform="translate(-50%, -50%)"
                        bg={cardBg}
                        borderRadius="md"
                        border="1px solid"
                        borderColor={cardBorder}
                        p={4}
                        zIndex={1401}
                        minW="360px"
                        maxH="70vh"
                        overflowY="auto"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-label="Move page"
                    >
                        <Text fontWeight="semibold" mb={2}>Move page</Text>
                        <VStack align="stretch" gap={3}>
                            <Input
                                placeholder="Search for a new parent..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {searchError && (
                                <Text color="red.500" fontSize="sm">{searchError}</Text>
                            )}
                            {!searchError && isSearching && (
                                <Text fontSize="sm" color={emptyTextColor}>Searching...</Text>
                            )}
                            {!isSearching && searchResults.length === 0 && searchQuery.trim() && !searchError && (
                                <Text fontSize="sm" color={emptyTextColor}>No results.</Text>
                            )}
                            <VStack align="stretch" gap={1}>
                                {searchResults.map((result) => (
                                    <Button
                                        key={result.id}
                                        variant={selectedParent?.id === result.id ? "solid" : "ghost"}
                                        onClick={() => setSelectedParent(result)}
                                        justifyContent="flex-start"
                                    >
                                        {result.title || `Article ${result.id}`}
                                    </Button>
                                ))}
                            </VStack>
                            <HStack justifyContent="flex-end" gap={2}>
                                <Button variant="outline" onClick={() => setIsMoveOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={handleMove} loading={isMoving} disabled={!selectedParent}>
                                    Move
                                </Button>
                            </HStack>
                        </VStack>
                    </Box>
                </Portal>
            )}
        </Box>
    );
};
