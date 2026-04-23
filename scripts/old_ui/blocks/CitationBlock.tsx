import React, { useRef } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const CitationBlock: React.FC<BlockComponentProps> = ({ block, readonly, onUpdate }) => {
    const textRef = useRef<HTMLParagraphElement>(null);
    const authorRef = useRef<HTMLParagraphElement>(null);

    const author = block.data?.author || '';
    const year = block.data?.year || '';
    const text = block.data?.text || '';
    const page = block.data?.page;

    const handleTextBlur = () => {
        if (textRef.current && onUpdate) {
            const newText = textRef.current.innerText;
            onUpdate({
                ...block,
                data: { ...block.data, text: newText }
            });
        }
    };

    const handleAuthorBlur = () => {
        if (authorRef.current && onUpdate) {
            const newAuthor = authorRef.current.innerText;
            onUpdate({
                ...block,
                data: { ...block.data, author: newAuthor }
            });
        }
    };

    return (
        <Box
            mb={4}
            p={4}
            bg="gray.50"
            borderLeft="4px solid"
            borderLeftColor="gray.400"
            borderRadius="md"
            position="relative"
        >
            <Text fontSize="3xl" color="gray.300" position="absolute" top="2" left="3" fontFamily="serif">
                "
            </Text>
            <Box pl={6} pr={2} pt={2}>
                <Text
                    ref={textRef}
                    fontSize="md"
                    color="gray.800"
                    lineHeight="1.7"
                    fontStyle="italic"
                    mb={3}
                    contentEditable={!readonly}
                    suppressContentEditableWarning
                    onBlur={handleTextBlur}
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
                    {text}
                </Text>
                <Text fontSize="sm" color="gray.600" textAlign="right">
                    — <Text
                        as="span"
                        ref={authorRef}
                        contentEditable={!readonly}
                        suppressContentEditableWarning
                        onBlur={handleAuthorBlur}
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
                        {author}
                    </Text>{year && `, ${year}`}{page && `, p. ${page}`}
                </Text>
            </Box>
        </Box>
    );
};


