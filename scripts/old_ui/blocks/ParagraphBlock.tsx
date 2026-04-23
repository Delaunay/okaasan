import React, { useRef } from 'react';
import { Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const ParagraphBlock: React.FC<BlockComponentProps> = ({ block, readonly, onUpdate }) => {
    const contentRef = useRef<HTMLParagraphElement>(null);

    const handleBlur = () => {
        if (contentRef.current && onUpdate) {
            const newText = contentRef.current.innerText;
            onUpdate({
                ...block,
                data: { ...block.data, text: newText }
            });
        }
    };

    const text = block.data?.text || 'Paragraph text';

    return (
        <Text
            ref={contentRef}
            mb={3}
            contentEditable={!readonly}
            suppressContentEditableWarning
            onBlur={handleBlur}
            css={
                !readonly
                    ? {
                        '&:focus': {
                            outline: '2px solid var(--chakra-colors-blue-400)',
                            outlineOffset: '2px'
                        }
                    }
                    : undefined
            }
        >
            {text}
        </Text>
    );
};


