import React, { useRef } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const ReferenceBlock: React.FC<BlockComponentProps> = ({ block, readonly, onUpdate }) => {
    const citationRef = useRef<HTMLParagraphElement>(null);
    const citation = block.data?.citation || 'Author, Year. Title.';

    const handleBlur = () => {
        if (citationRef.current && onUpdate) {
            const newCitation = citationRef.current.innerText;
            onUpdate({
                ...block,
                data: { ...block.data, citation: newCitation }
            });
        }
    };

    return (
        <Box mb={3} pl={4} borderLeft="3px solid" borderColor="gray.300" fontStyle="italic">
            <Text
                ref={citationRef}
                fontSize="sm"
                color="gray.700"
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
                {citation}
            </Text>
        </Box>
    );
};


