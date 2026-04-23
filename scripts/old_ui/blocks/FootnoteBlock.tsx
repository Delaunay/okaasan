import React, { useRef } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const FootnoteBlock: React.FC<BlockComponentProps> = ({ block, readonly, onUpdate }) => {
    const contentRef = useRef<HTMLParagraphElement>(null);
    const number = block.data?.number || '1';
    const text = block.data?.text || 'Footnote text';

    const handleBlur = () => {
        if (contentRef.current && onUpdate) {
            const newText = contentRef.current.innerText;
            onUpdate({
                ...block,
                data: { ...block.data, text: newText }
            });
        }
    };

    return (
        <Box mb={2} fontSize="sm" color="gray.600">
            <Text as="sup" fontWeight="bold" mr={1}>
                [{number}]
            </Text>
            <Text
                as="span"
                ref={contentRef}
                contentEditable={!readonly}
                suppressContentEditableWarning
                onBlur={handleBlur}
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
        </Box>
    );
};


