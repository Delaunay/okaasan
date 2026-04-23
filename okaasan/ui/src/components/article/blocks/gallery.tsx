import { BlockBase, BlockDef, MarkdownGeneratorContext, EmptyBlockPlaceholder } from "../base";
import { Box, Image, Text } from '@chakra-ui/react';

export interface GalleryImage {
    url: string;
    alt?: string;
}

export interface GalleryData {
    caption?: string;
    columns?: number;
    images: GalleryImage[];
}

export interface GalleryBlockDef extends BlockDef {
    kind: "gallery";
    data: GalleryData;
}

export class GalleryBlock extends BlockBase {
    static kind = "gallery";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        const columns = this.def.data.columns || 3;
        const images = this.def.data.images || [];

        if (images.length === 0) {
            return <EmptyBlockPlaceholder icon="🖼️" label="Gallery" hint="Configure via settings to add images" />;
        }

        return (
            <Box>
                <Box
                    display="grid"
                    gridTemplateColumns={{ base: "1fr", md: `repeat(${columns}, 1fr)` }}
                    gap={4}
                >
                    {images.map((img, idx) => (
                        <Box key={idx}>
                            <Image
                                src={img.url}
                                alt={img.alt || `Gallery image ${idx + 1}`}
                                borderRadius="md"
                                objectFit="cover"
                                w="100%"
                                h="200px"
                            />
                        </Box>
                    ))}
                </Box>
                {this.def.data.caption && (
                    <Text fontSize="sm" color="gray.600" mt={2} textAlign="center">
                        {this.def.data.caption}
                    </Text>
                )}
            </Box>
        );
    }

    is_md_representable(): boolean {
        return false;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        return "";
    }
}
