import React from 'react';
import { VStack, HStack, Box, Text, Input, Button, IconButton, Select } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

const DeleteIcon = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
        <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" />
    </svg>
);

export const FormBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const title = block.data?.title || 'Form';
    const fields = block.data?.fields || [];
    const submitText = block.data?.submitText || 'Submit';
    const submitUrl = block.data?.submitUrl || '';

    const addField = () => {
        const newField = {
            id: `field_${Date.now()}`,
            label: 'New Field',
            type: 'text',
            required: false,
            placeholder: ''
        };
        onChange('fields', [...fields, newField]);
    };

    const updateField = (index: number, key: string, value: any) => {
        const newFields = fields.map((f: any, i: number) =>
            i === index ? { ...f, [key]: value } : f
        );
        onChange('fields', newFields);
    };

    const deleteField = (index: number) => {
        onChange('fields', fields.filter((_: any, i: number) => i !== index));
    };

    return (
        <VStack gap={3} align="stretch">
            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Form Title
                </Text>
                <Input
                    size="sm"
                    value={title}
                    onChange={(e) => onChange('title', e.target.value)}
                    placeholder="Contact Form"
                />
            </Box>

            <Box>
                <HStack justifyContent="space-between" mb={2}>
                    <Text fontSize="sm" fontWeight="600">
                        Form Fields
                    </Text>
                    <Button size="xs" onClick={addField} variant="outline" colorScheme="blue">
                        Add Field
                    </Button>
                </HStack>

                {fields.length === 0 ? (
                    <Text fontSize="sm" color="gray.500" fontStyle="italic">
                        No fields yet. Click "Add Field" to create one.
                    </Text>
                ) : (
                    <VStack gap={2} align="stretch">
                        {fields.map((field: any, index: number) => (
                            <Box key={index} p={3} border="1px solid" borderColor="gray.200" borderRadius="md" bg="gray.50">
                                <HStack justifyContent="space-between" mb={2}>
                                    <Text fontSize="xs" fontWeight="bold" color="gray.600">
                                        Field {index + 1}
                                    </Text>
                                    <IconButton
                                        aria-label="Delete"
                                        size="xs"
                                        variant="ghost"
                                        colorScheme="red"
                                        onClick={() => deleteField(index)}
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </HStack>

                                <VStack gap={2} align="stretch">
                                    <HStack gap={2}>
                                        <Box flex={1}>
                                            <Input
                                                size="xs"
                                                value={field.label}
                                                onChange={(e) => updateField(index, 'label', e.target.value)}
                                                placeholder="Label"
                                            />
                                        </Box>
                                        <Box flex={1}>
                                            <Select
                                                size="xs"
                                                value={field.type}
                                                onChange={(e) => updateField(index, 'type', e.target.value)}
                                            >
                                                <option value="text">Text</option>
                                                <option value="email">Email</option>
                                                <option value="textarea">Textarea</option>
                                                <option value="select">Select</option>
                                                <option value="checkbox">Checkbox</option>
                                            </Select>
                                        </Box>
                                    </HStack>

                                    <Input
                                        size="xs"
                                        value={field.placeholder || ''}
                                        onChange={(e) => updateField(index, 'placeholder', e.target.value)}
                                        placeholder="Placeholder text"
                                    />

                                    <HStack gap={2}>
                                        <input
                                            type="checkbox"
                                            checked={field.required}
                                            onChange={(e) => updateField(index, 'required', e.target.checked)}
                                        />
                                        <Text fontSize="xs">Required</Text>
                                    </HStack>
                                </VStack>
                            </Box>
                        ))}
                    </VStack>
                )}
            </Box>

            <HStack gap={2}>
                <Box flex={1}>
                    <Text fontSize="sm" fontWeight="600" mb={1}>
                        Submit Button Text
                    </Text>
                    <Input
                        size="sm"
                        value={submitText}
                        onChange={(e) => onChange('submitText', e.target.value)}
                        placeholder="Submit"
                    />
                </Box>
                <Box flex={1}>
                    <Text fontSize="sm" fontWeight="600" mb={1}>
                        Submit URL (Optional)
                    </Text>
                    <Input
                        size="sm"
                        value={submitUrl}
                        onChange={(e) => onChange('submitUrl', e.target.value)}
                        placeholder="https://api.example.com/submit"
                    />
                </Box>
            </HStack>

            <Text fontSize="xs" color="gray.500">
                Interactive form with validation. Configure fields, types, and submission endpoint.
            </Text>
        </VStack>
    );
};


