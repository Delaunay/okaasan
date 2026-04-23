import React, { useState, useEffect } from 'react';
import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Image, Text } from '@chakra-ui/react';

export interface Slide {
    url: string;
    caption?: string;
}

export interface SlideshowData {
    autoPlay?: boolean;
    interval?: number;
    showDots?: boolean;
    slides: Slide[];
}

export interface SlideshowBlockDef extends BlockDef {
    kind: "slideshow";
    data: SlideshowData;
}

export class SlideshowBlock extends BlockBase {
    static kind = "slideshow";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        return <SlideshowDisplay block={this} />;
    }

    is_md_representable(): boolean {
        return false;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        return "";
    }
}

function SlideshowDisplay({ block }: { block: SlideshowBlock }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const slides = block.def.data.slides || [];
    const autoPlay = block.def.data.autoPlay !== false;
    const interval = block.def.data.interval || 3000;
    const showDots = block.def.data.showDots !== false;

    useEffect(() => {
        if (autoPlay && slides.length > 1) {
            const timer = setInterval(() => {
                setCurrentIndex((prev) => (prev + 1) % slides.length);
            }, interval);
            return () => clearInterval(timer);
        }
    }, [autoPlay, interval, slides.length]);

    if (slides.length === 0) return null;

    return (
        <Box position="relative">
            <Image
                src={slides[currentIndex].url}
                alt={slides[currentIndex].caption || `Slide ${currentIndex + 1}`}
                w="100%"
                borderRadius="md"
            />
            {slides[currentIndex].caption && (
                <Text fontSize="sm" color="gray.600" mt={2} textAlign="center">
                    {slides[currentIndex].caption}
                </Text>
            )}
            {showDots && slides.length > 1 && (
                <Box display="flex" justifyContent="center" gap={2} mt={2}>
                    {slides.map((_, idx) => (
                        <Box
                            key={idx}
                            w="8px"
                            h="8px"
                            borderRadius="full"
                            bg={idx === currentIndex ? "blue.500" : "gray.300"}
                            cursor="pointer"
                            onClick={() => setCurrentIndex(idx)}
                        />
                    ))}
                </Box>
            )}
        </Box>
    );
}
