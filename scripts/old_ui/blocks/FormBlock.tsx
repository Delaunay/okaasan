import React, { useState } from 'react';
import { Box, VStack, Text, Input, Textarea, Button, HStack } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const FormBlock: React.FC<BlockComponentProps> = ({ block, readonly }) => {
    const title = block.data?.title || 'Form';
    const fields = block.data?.fields || [];
    const submitText = block.data?.submitText || 'Submit';
    const submitUrl = block.data?.submitUrl || '';

    const [formData, setFormData] = useState<Record<string, any>>({});
    const [submitted, setSubmitted] = useState(false);

    const handleChange = (fieldId: string, value: any) => {
        setFormData(prev => ({ ...prev, [fieldId]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!readonly) return;

        console.log('Form submitted:', formData);
        setSubmitted(true);
        setTimeout(() => setSubmitted(false), 3000);

        // In a real implementation, send to submitUrl
        if (submitUrl) {
            // fetch(submitUrl, { method: 'POST', body: JSON.stringify(formData) })
        }
    };

    return (
        <Box mb={4} p={4} border="1px solid" borderColor="gray.200" borderRadius="md" bg="bg">
            <Text fontSize="lg" fontWeight="600" mb={4}>
                {title}
            </Text>

            <form onSubmit={handleSubmit}>
                <VStack gap={3} align="stretch">
                    {fields.map((field: any) => {
                        const { id, label, type, required, placeholder, options } = field;

                        return (
                            <Box key={id}>
                                <Text fontSize="sm" fontWeight="500" mb={1}>
                                    {label}{required && <Text as="span" color="red.500">*</Text>}
                                </Text>

                                {type === 'text' && (
                                    <Input
                                        size="sm"
                                        value={formData[id] || ''}
                                        onChange={(e) => handleChange(id, e.target.value)}
                                        placeholder={placeholder}
                                        required={required}
                                        disabled={!readonly}
                                    />
                                )}

                                {type === 'email' && (
                                    <Input
                                        size="sm"
                                        type="email"
                                        value={formData[id] || ''}
                                        onChange={(e) => handleChange(id, e.target.value)}
                                        placeholder={placeholder}
                                        required={required}
                                        disabled={!readonly}
                                    />
                                )}

                                {type === 'textarea' && (
                                    <Textarea
                                        size="sm"
                                        value={formData[id] || ''}
                                        onChange={(e) => handleChange(id, e.target.value)}
                                        placeholder={placeholder}
                                        required={required}
                                        disabled={!readonly}
                                        rows={3}
                                    />
                                )}

                                {type === 'select' && (
                                    <select
                                        value={formData[id] || ''}
                                        onChange={(e) => handleChange(id, e.target.value)}
                                        required={required}
                                        disabled={!readonly}
                                        style={{
                                            width: '100%',
                                            padding: '6px 12px',
                                            fontSize: '14px',
                                            border: '1px solid var(--chakra-colors-border)',
                                            borderRadius: '6px'
                                        }}
                                    >
                                        <option value="">Select...</option>
                                        {options?.map((opt: string) => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                )}

                                {type === 'checkbox' && (
                                    <HStack gap={2}>
                                        <input
                                            type="checkbox"
                                            checked={formData[id] || false}
                                            onChange={(e) => handleChange(id, e.target.checked)}
                                            disabled={!readonly}
                                        />
                                        <Text fontSize="sm">{placeholder}</Text>
                                    </HStack>
                                )}
                            </Box>
                        );
                    })}
                </VStack>

                <Button
                    type="submit"
                    mt={4}
                    colorScheme="blue"
                    size="sm"
                    disabled={!readonly}
                >
                    {submitText}
                </Button>

                {submitted && (
                    <Text fontSize="sm" color="green.600" mt={2}>
                        ✓ Form submitted successfully!
                    </Text>
                )}
            </form>
        </Box>
    );
};


