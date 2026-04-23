import React, { useState } from 'react';
import { Box, Text, Button, HStack } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const SandboxBlock: React.FC<BlockComponentProps> = ({ block, readonly }) => {
    const code = block.data?.code || '';
    const language = block.data?.language || 'javascript';
    const caption = block.data?.caption;

    const [output, setOutput] = useState('');
    const [error, setError] = useState('');
    const [isRunning, setIsRunning] = useState(false);

    const runCode = () => {
        if (!readonly) return;

        setIsRunning(true);
        setOutput('');
        setError('');

        try {
            if (language === 'javascript') {
                // Capture console.log output
                const logs: string[] = [];
                const originalLog = console.log;
                console.log = (...args) => {
                    logs.push(args.map(a => String(a)).join(' '));
                };

                try {
                    // Execute code in isolated context
                    const result = eval(code);
                    if (result !== undefined) {
                        logs.push(`=> ${result}`);
                    }
                } catch (err) {
                    throw err;
                } finally {
                    console.log = originalLog;
                }

                setOutput(logs.join('\n') || '(no output)');
            } else {
                setOutput(`Execution for ${language} not implemented in this demo`);
            }
        } catch (err: any) {
            setError(err.message || String(err));
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <Box mb={4}>
            {caption && (
                <Text fontSize="sm" fontWeight="600" color="gray.700" mb={2}>
                    {caption}
                </Text>
            )}

            <Box border="1px solid" borderColor="gray.200" borderRadius="md" overflow="hidden">
                {/* Code Editor */}
                <Box
                    bg="gray.900"
                    p={3}
                    fontFamily="monospace"
                    fontSize="sm"
                    color="white"
                    whiteSpace="pre-wrap"
                    overflowX="auto"
                    maxHeight="400px"
                    overflowY="auto"
                >
                    {code || '// Write your code here'}
                </Box>

                {/* Controls */}
                {readonly && (
                    <Box p={2} bg="gray.50" borderTop="1px solid" borderColor="gray.200">
                        <HStack justifyContent="space-between">
                            <Button
                                size="sm"
                                colorScheme="green"
                                onClick={runCode}
                                isLoading={isRunning}
                            >
                                ▶ Run Code
                            </Button>
                            <Text fontSize="xs" color="gray.500">
                                {language}
                            </Text>
                        </HStack>
                    </Box>
                )}

                {/* Output */}
                {(output || error) && (
                    <Box
                        p={3}
                        bg={error ? 'red.50' : 'green.50'}
                        borderTop="1px solid"
                        borderColor={error ? 'red.200' : 'green.200'}
                    >
                        <Text fontSize="xs" fontWeight="600" color={error ? 'red.700' : 'green.700'} mb={1}>
                            {error ? 'Error:' : 'Output:'}
                        </Text>
                        <Box
                            fontFamily="monospace"
                            fontSize="xs"
                            color={error ? 'red.800' : 'green.900'}
                            whiteSpace="pre-wrap"
                            bg={error ? 'red.100' : 'green.100'}
                            p={2}
                            borderRadius="md"
                        >
                            {error || output}
                        </Box>
                    </Box>
                )}
            </Box>
        </Box>
    );
};


