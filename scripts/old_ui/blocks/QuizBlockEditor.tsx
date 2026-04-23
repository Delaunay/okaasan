import React from 'react';
import { VStack, HStack, Box, Text, Input, Textarea, Button, IconButton } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

const DeleteIcon = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
        <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" />
    </svg>
);

export const QuizBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const question = block.data?.question || '';
    const options = block.data?.options || ['', '', '', ''];
    const correctAnswer = block.data?.correctAnswer ?? 0;
    const explanation = block.data?.explanation || '';

    const addOption = () => {
        onChange('options', [...options, '']);
    };

    const updateOption = (index: number, value: string) => {
        const newOptions = options.map((opt: string, i: number) => i === index ? value : opt);
        onChange('options', newOptions);
    };

    const deleteOption = (index: number) => {
        if (options.length <= 2) return; // Minimum 2 options
        const newOptions = options.filter((_: string, i: number) => i !== index);
        onChange('options', newOptions);
        // Adjust correct answer if needed
        if (correctAnswer >= newOptions.length) {
            onChange('correctAnswer', newOptions.length - 1);
        }
    };

    return (
        <VStack gap={3} align="stretch">
            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Question
                </Text>
                <Textarea
                    size="sm"
                    value={question}
                    onChange={(e) => onChange('question', e.target.value)}
                    placeholder="Enter your question..."
                    rows={3}
                />
            </Box>

            <Box>
                <HStack justifyContent="space-between" mb={2}>
                    <Text fontSize="sm" fontWeight="600">
                        Options
                    </Text>
                    <Button size="xs" onClick={addOption} variant="outline" colorScheme="blue">
                        Add Option
                    </Button>
                </HStack>

                <VStack gap={2} align="stretch">
                    {options.map((option: string, index: number) => (
                        <Box key={index}>
                            <HStack gap={2}>
                                <Box
                                    width="24px"
                                    height="24px"
                                    borderRadius="50%"
                                    border="3px solid"
                                    borderColor={correctAnswer === index ? 'green.500' : 'gray.300'}
                                    bg={correctAnswer === index ? 'green.500' : 'white'}
                                    flexShrink={0}
                                    cursor="pointer"
                                    onClick={() => onChange('correctAnswer', index)}
                                    display="flex"
                                    alignItems="center"
                                    justifyContent="center"
                                    fontSize="xs"
                                    color="white"
                                    fontWeight="bold"
                                >
                                    {correctAnswer === index ? '✓' : ''}
                                </Box>
                                <Input
                                    size="sm"
                                    value={option}
                                    onChange={(e) => updateOption(index, e.target.value)}
                                    placeholder={`Option ${index + 1}`}
                                    flex={1}
                                />
                                <IconButton
                                    aria-label="Delete"
                                    size="sm"
                                    variant="ghost"
                                    colorScheme="red"
                                    onClick={() => deleteOption(index)}
                                    isDisabled={options.length <= 2}
                                >
                                    <DeleteIcon />
                                </IconButton>
                            </HStack>
                        </Box>
                    ))}
                </VStack>
                <Text fontSize="xs" color="gray.500" mt={1}>
                    Click the circle to mark the correct answer
                </Text>
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Explanation (Optional)
                </Text>
                <Textarea
                    size="sm"
                    value={explanation}
                    onChange={(e) => onChange('explanation', e.target.value)}
                    placeholder="Explain why this is the correct answer..."
                    rows={3}
                />
            </Box>

            <Text fontSize="xs" color="gray.500">
                Interactive quiz with instant feedback. Users can retry after seeing the result.
            </Text>
        </VStack>
    );
};


