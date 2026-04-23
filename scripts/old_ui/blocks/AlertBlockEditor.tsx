import React from 'react';
import { Box, VStack, HStack, Text, Input, Textarea } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const AlertBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const type = block.data?.type || 'info';
    const title = block.data?.title || '';
    const message = block.data?.message || '';

    const alertTypes = [
        { value: 'info', label: 'Info', color: '#3182ce' },
        { value: 'success', label: 'Success', color: '#38a169' },
        { value: 'warning', label: 'Warning', color: '#dd6b20' },
        { value: 'error', label: 'Error', color: '#e53e3e' }
    ];

    return (
        <VStack gap={3} align="stretch">
            <Box>
                <Text fontSize="sm" fontWeight="600" mb={2}>
                    Alert Type
                </Text>
                <HStack gap={2}>
                    {alertTypes.map((alertType) => (
                        <Box
                            key={alertType.value}
                            px={3}
                            py={1.5}
                            borderRadius="md"
                            border="2px solid"
                            borderColor={type === alertType.value ? alertType.color : 'gray.200'}
                            bg={type === alertType.value ? `${alertType.color}10` : 'white'}
                            cursor="pointer"
                            onClick={() => onChange('type', alertType.value)}
                            transition="all 0.15s"
                            _hover={{
                                borderColor: alertType.color,
                                bg: `${alertType.color}10`
                            }}
                        >
                            <Text
                                fontSize="xs"
                                fontWeight={type === alertType.value ? '600' : 'normal'}
                                color={type === alertType.value ? alertType.color : 'gray.600'}
                            >
                                {alertType.label}
                            </Text>
                        </Box>
                    ))}
                </HStack>
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Title (Optional)
                </Text>
                <Input
                    size="sm"
                    value={title}
                    onChange={(e) => onChange('title', e.target.value)}
                    placeholder="Alert title"
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Message
                </Text>
                <Textarea
                    size="sm"
                    value={message}
                    onChange={(e) => onChange('message', e.target.value)}
                    placeholder="Alert message"
                    rows={4}
                />
            </Box>

            <Text fontSize="xs" color="gray.500">
                Alerts are used to provide important information to users.
            </Text>
        </VStack>
    );
};


