import React, { useState, useCallback, useEffect } from 'react';
import { BlockBase, BlockDef, MarkdownGeneratorContext, BlockSetting, EmptyBlockPlaceholder } from "../base";
import { Box, Image, Text, Portal } from '@chakra-ui/react';
import { recipeAPI, isStaticMode } from '../../../services/api';

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
            width:  { "type": "string", "required": false },
            height: { "type": "string", "required": false },
        }
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        const alt = this.def.data.alt || "";
        const caption = this.def.data.caption ? ` "${this.def.data.caption}"` : "";
        return `![${alt}](${this.def.data.url}${caption})`;
    }
}

function normalizeSizeValue(value: string | number | undefined): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const s = String(value);
    if (s.endsWith('%') || s.endsWith('vw') || s.endsWith('vh') || s.endsWith('em') || s.endsWith('rem') || s.endsWith('px')) {
        return s;
    }
    if (/^\d+(\.\d+)?$/.test(s)) {
        return `${s}px`;
    }
    return s;
}

function ImageLightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    return (
        <Portal>
            <Box
                position="fixed"
                inset="0"
                zIndex={2000}
                bg="blackAlpha.800"
                display="flex"
                alignItems="center"
                justifyContent="center"
                onClick={onClose}
                cursor="zoom-out"
                p={4}
            >
                <Image
                    src={src}
                    alt={alt}
                    maxW="95vw"
                    maxH="95vh"
                    objectFit="contain"
                    borderRadius="md"
                    onClick={(e) => e.stopPropagation()}
                />
            </Box>
        </Portal>
    );
}

function ImageView({ block }: { block: ImageBlock }) {
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const readonly = isStaticMode() || block.article.options?.readonly;

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

    const dropZoneProps = readonly ? {} : {
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
    const w = normalizeSizeValue(block.def.data.width);
    const h = normalizeSizeValue(block.def.data.height);

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
                width={w}
                height={h}
                borderRadius="md"
                cursor={readonly ? "zoom-in" : undefined}
                onClick={readonly ? () => setLightboxOpen(true) : undefined}
            />
            {lightboxOpen && (
                <ImageLightbox
                    src={src}
                    alt={block.def.data.alt}
                    onClose={() => setLightboxOpen(false)}
                />
            )}
        </Box>
    );
}
