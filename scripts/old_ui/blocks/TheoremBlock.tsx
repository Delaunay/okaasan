import React, { useRef } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const TheoremBlock: React.FC<BlockComponentProps> = ({ block, readonly, onUpdate }) => {
    const contentRef = useRef<HTMLParagraphElement>(null);
    const titleRef = useRef<HTMLParagraphElement>(null);

    const type = block.data?.type || 'theorem'; // theorem, proof, lemma, corollary, proposition
    const title = block.data?.title || '';
    const content = block.data?.content || '';
    const number = block.data?.number;

    const typeConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
        theorem: { label: 'Theorem', color: 'blue.900', bg: 'blue.50', border: 'blue.500' },
        proof: { label: 'Proof', color: 'green.900', bg: 'green.50', border: 'green.500' },
        lemma: { label: 'Lemma', color: 'purple.900', bg: 'purple.50', border: 'purple.500' },
        corollary: { label: 'Corollary', color: 'orange.900', bg: 'orange.50', border: 'orange.500' },
        proposition: { label: 'Proposition', color: 'teal.900', bg: 'teal.50', border: 'teal.500' }
    };

    const config = typeConfig[type] || typeConfig.theorem;

    const handleContentBlur = () => {
        if (contentRef.current && onUpdate) {
            const newContent = contentRef.current.innerText;
            onUpdate({
                ...block,
                data: { ...block.data, content: newContent }
            });
        }
    };

    const handleTitleBlur = () => {
        if (titleRef.current && onUpdate) {
            const newTitle = titleRef.current.innerText;
            onUpdate({
                ...block,
                data: { ...block.data, title: newTitle }
            });
        }
    };

    return (
        <Box
            mb={4}
            p={4}
            bg={config.bg}
            borderLeft="4px solid"
            borderLeftColor={config.border}
            borderRadius="md"
        >
            <Text fontSize="sm" fontWeight="700" color={config.color} mb={2}>
                {config.label}{number && ` ${number}`}{title && (
                    <Text as="span"> (
                        <Text
                            as="span"
                            ref={titleRef}
                            contentEditable={!readonly}
                            suppressContentEditableWarning
                            onBlur={handleTitleBlur}
                            css={
                                !readonly
                                    ? {
                                        '&:focus': {
                                            outline: '2px solid var(--chakra-colors-blue-400)',
                                            outlineOffset: '2px',
                                            borderRadius: '4px'
                                        }
                                    }
                                    : undefined
                            }
                        >
                            {title}
                        </Text>
                        )</Text>
                )}
            </Text>
            <Text
                ref={contentRef}
                fontSize="sm"
                color="gray.800"
                lineHeight="1.7"
                whiteSpace="pre-wrap"
                fontStyle={type === 'proof' ? 'italic' : 'normal'}
                contentEditable={!readonly}
                suppressContentEditableWarning
                onBlur={handleContentBlur}
                css={
                    !readonly
                        ? {
                            '&:focus': {
                                outline: '2px solid var(--chakra-colors-blue-400)',
                                outlineOffset: '2px',
                                borderRadius: '4px'
                            }
                        }
                        : undefined
                }
            >
                {content}
            </Text>
            {type === 'proof' && (
                <Text fontSize="sm" color={config.color} mt={2} textAlign="right">
                    ∎
                </Text>
            )}
        </Box>
    );
};


