import React, { useState } from 'react';
import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text, Input, Textarea, CheckboxRoot, CheckboxHiddenInput, CheckboxControl, CheckboxIndicator, CheckboxLabel, Button } from '@chakra-ui/react';

export interface FormField {
    id: string;
    label: string;
    type: 'text' | 'email' | 'textarea' | 'checkbox';
    required?: boolean;
    placeholder?: string;
}

export interface FormData {
    title?: string;
    fields: FormField[];
    submitText?: string;
    submitUrl?: string;
}

export interface FormBlockDef extends BlockDef {
    kind: "form";
    data: FormData;
}

export class FormBlock extends BlockBase {
    static kind = "form";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        return <FormDisplay block={this} />;
    }

    is_md_representable(): boolean {
        return false;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        return "";
    }
}

function FormDisplay({ block }: { block: FormBlock }) {
    const [formData, setFormData] = useState<Record<string, any>>({});

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // In production, submit to submitUrl
        console.log("Form submitted:", formData);
    };

    const handleChange = (id: string, value: any) => {
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    return (
        <Box>
            {block.def.data.title && (
                <Text fontWeight="bold" mb={4}>{block.def.data.title}</Text>
            )}
            <form onSubmit={handleSubmit}>
                <Box display="flex" flexDirection="column" gap={4}>
                    {block.def.data.fields.map((field) => (
                        <Box key={field.id}>
                            {field.type === 'checkbox' ? (
                                <CheckboxRoot
                                    checked={formData[field.id] || false}
                                    onCheckedChange={(details) => handleChange(field.id, details.checked)}
                                >
                                    <CheckboxHiddenInput />
                                    <CheckboxControl>
                                        <CheckboxIndicator />
                                    </CheckboxControl>
                                    <CheckboxLabel>
                                        {field.label}
                                        {field.required && <Text as="span" colorPalette="red"> *</Text>}
                                    </CheckboxLabel>
                                </CheckboxRoot>
                            ) : (
                                <>
                                    <Text as="label" display="block" mb={1} fontWeight="medium">
                                        {field.label}
                                        {field.required && <Text as="span" colorPalette="red"> *</Text>}
                                    </Text>
                                    {field.type === 'textarea' ? (
                                        <Textarea
                                            value={formData[field.id] || ""}
                                            onChange={(e) => handleChange(field.id, e.target.value)}
                                            placeholder={field.placeholder}
                                            required={field.required}
                                        />
                                    ) : (
                                        <Input
                                            type={field.type}
                                            value={formData[field.id] || ""}
                                            onChange={(e) => handleChange(field.id, e.target.value)}
                                            placeholder={field.placeholder}
                                            required={field.required}
                                        />
                                    )}
                                </>
                            )}
                        </Box>
                    ))}
                    <Button type="submit" colorPalette="blue">
                        {block.def.data.submitText || "Submit"}
                    </Button>
                </Box>
            </form>
        </Box>
    );
}
