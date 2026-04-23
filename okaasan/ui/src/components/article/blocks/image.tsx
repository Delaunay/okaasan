import React, { useState, useCallback } from 'react';
import { BlockBase, BlockDef, MarkdownGeneratorContext, BlockSetting, EmptyBlockPlaceholder } from "../base";
import { Box, Image, Text } from '@chakra-ui/react';
import { recipeAPI } from '../../../services/api';

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export interface ImageData {
    url: string;
    alt?: string;
    caption?: string;
    width?: string
    height?: string
}

export interface ImageBlockDef extends BlockDef {
    kind: "image";
    data: ImageData;
}

export class ImageBlock extends BlockBase {
    static kind = "image";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        return <ImageView block={this} />; 
    }

    is_md_representable(): boolean {
        return false;
    }

    settings(): BlockSetting {
        return {
            url:    { "type": "string", "required": false },
            alt:    { "type": "string", "required": false },
            caption:{ "type": "string", "required": false },
            width:  { "type": "int"   , "required": false },
            height: { "type": "int"   , "required": false },
        }
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        const alt = this.def.data.alt || "";
        const caption = this.def.data.caption ? ` "${this.def.data.caption}"` : "";
        return `![${alt}](${this.def.data.url}${caption})`;
    }
}

function ImageView({ block }: { block: ImageBlock }) {
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);

        const file = e.dataTransfer.files?.[0];
        if (!file || !ALLOWED_IMAGE_TYPES.includes(file.type)) return;

        setUploading(true);
        try {
            const articlePath = block.article.getArticlePath();
            const result = await recipeAPI.downloadImage(file, articlePath);

            block.def.data.url = result.url;
            if (!block.def.data.alt) {
                block.def.data.alt = file.name;
            }
            block.article._updateBlock(block, block.def);
        } catch (err) {
            console.error('Image drop upload failed:', err);
        } finally {
            setUploading(false);
        }
    }, [block]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
    }, []);

    const dropZoneProps = {
        onDrop: handleDrop,
        onDragOver: handleDragOver,
        onDragLeave: handleDragLeave,
    };

    if (uploading) {
        return (
            <Box
                display="flex" alignItems="center" justifyContent="center"
                minH="120px" border="2px dashed" borderColor="blue.300"
                borderRadius="md" color="blue.500" fontSize="sm"
            >
                Uploading...
            </Box>
        );
    }

    if (!block.def.data.url) {
        return (
            <Box
                {...dropZoneProps}
                display="flex" flexDirection="column" alignItems="center" justifyContent="center"
                minH="120px" py={6} px={8}
                border="2px dashed"
                borderColor={dragging ? "blue.400" : "gray.300"}
                borderRadius="md"
                bg={dragging ? "blue.50" : undefined}
                color={dragging ? "blue.500" : "gray.400"}
                cursor="pointer"
                transition="all 0.15s ease"
                _dark={{ borderColor: dragging ? "blue.400" : "gray.600", color: dragging ? "blue.300" : "gray.500", bg: dragging ? "blue.900" : undefined }}
            >
                <Box fontSize="2xl" lineHeight={1} mb={1}>🖼️</Box>
                <Box fontSize="sm" fontWeight="medium">Image</Box>
                <Box fontSize="xs" fontStyle="italic">
                    {dragging ? "Drop image here" : "Drag & drop an image, or configure via settings"}
                </Box>
            </Box>
        );
    }

    const src = recipeAPI.imagePath(block.def.data.url);

    return (
        <Box {...dropZoneProps} position="relative">
            {dragging && (
                <Box
                    position="absolute" inset={0} zIndex={10}
                    display="flex" alignItems="center" justifyContent="center"
                    bg="blackAlpha.500" borderRadius="md"
                    border="2px dashed" borderColor="blue.400"
                    color="white" fontSize="sm" fontWeight="medium"
                >
                    Drop to replace image
                </Box>
            )}
            <Image
                src={src}
                alt={block.def.data.alt}
                maxW="100%"
                width={block.def.data.width}
                height={block.def.data.height}
                borderRadius="md"
            />
        </Box>
    );
}
