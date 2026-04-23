import React, { useState } from 'react';
import { Box, VStack, Text, HStack } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const QuizBlock: React.FC<BlockComponentProps> = ({ block, readonly }) => {
    const question = block.data?.question || '';
    const options = block.data?.options || [];
    const correctAnswer = block.data?.correctAnswer;
    const explanation = block.data?.explanation;

    const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
    const [showResult, setShowResult] = useState(false);

    const handleAnswerClick = (index: number) => {
        if (!readonly || showResult) return;
        setSelectedAnswer(index);
        setShowResult(true);
    };

    const resetQuiz = () => {
        setSelectedAnswer(null);
        setShowResult(false);
    };

    const isCorrect = selectedAnswer === correctAnswer;

    return (
        <Box mb={4} p={4} border="1px solid" borderColor="gray.200" borderRadius="md" bg="bg">
            <Text fontSize="md" fontWeight="600" color="gray.800" mb={4}>
                {question}
            </Text>

            <VStack align="stretch" gap={2} mb={3}>
                {options.map((option: string, index: number) => {
                    const isSelected = selectedAnswer === index;
                    const isCorrectOption = index === correctAnswer;
                    const showAsCorrect = showResult && isCorrectOption;
                    const showAsWrong = showResult && isSelected && !isCorrectOption;

                    return (
                        <Box
                            key={index}
                            px={4}
                            py={3}
                            border="2px solid"
                            borderColor={
                                showAsCorrect ? 'green.500' :
                                    showAsWrong ? 'red.500' :
                                        isSelected ? 'blue.500' :
                                            'gray.200'
                            }
                            bg={
                                showAsCorrect ? 'green.50' :
                                    showAsWrong ? 'red.50' :
                                        isSelected ? 'blue.50' :
                                            'white'
                            }
                            borderRadius="md"
                            cursor={readonly && !showResult ? 'pointer' : 'default'}
                            onClick={() => handleAnswerClick(index)}
                            transition="all 0.15s"
                            _hover={readonly && !showResult ? { borderColor: 'blue.300', bg: 'gray.50' } : {}}
                        >
                            <HStack gap={2}>
                                <Box
                                    width="20px"
                                    height="20px"
                                    borderRadius="50%"
                                    border="2px solid"
                                    borderColor={
                                        showAsCorrect ? 'green.500' :
                                            showAsWrong ? 'red.500' :
                                                isSelected ? 'blue.500' :
                                                    'gray.300'
                                    }
                                    bg={
                                        showAsCorrect || showAsWrong || isSelected
                                            ? showAsCorrect ? 'green.500' : showAsWrong ? 'red.500' : 'blue.500'
                                            : 'white'
                                    }
                                    flexShrink={0}
                                />
                                <Text fontSize="sm" color="gray.800">
                                    {option}
                                </Text>
                            </HStack>
                        </Box>
                    );
                })}
            </VStack>

            {showResult && (
                <Box p={3} bg={isCorrect ? 'green.50' : 'orange.50'} borderRadius="md" border="1px solid" borderColor={isCorrect ? 'green.200' : 'orange.200'}>
                    <Text fontSize="sm" fontWeight="600" color={isCorrect ? 'green.800' : 'orange.800'} mb={1}>
                        {isCorrect ? '✓ Correct!' : '✗ Incorrect'}
                    </Text>
                    {explanation && (
                        <Text fontSize="sm" color="gray.700">
                            {explanation}
                        </Text>
                    )}
                    <Box mt={2}>
                        <Text
                            as="span"
                            fontSize="xs"
                            color="blue.600"
                            cursor="pointer"
                            textDecoration="underline"
                            onClick={resetQuiz}
                        >
                            Try again
                        </Text>
                    </Box>
                </Box>
            )}
        </Box>
    );
};


