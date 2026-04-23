import React, { useRef, useEffect, useState } from 'react';
import { Box, Text, HStack, Button } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const DrawingBlock: React.FC<BlockComponentProps> = ({ block, readonly }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [color, setColor] = useState(block.data?.defaultColor || '#000000');
    const [lineWidth, setLineWidth] = useState(block.data?.defaultLineWidth || 2);
    const imageData = block.data?.imageData;
    const title = block.data?.title;
    const width = block.data?.width || 600;
    const height = block.data?.height || 400;
    const backgroundColor = block.data?.backgroundColor || '#ffffff';

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas background
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Load existing drawing if available
        if (imageData) {
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0);
            };
            img.src = imageData;
        }
    }, [imageData, backgroundColor]);

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (readonly) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.beginPath();
        ctx.moveTo(x, y);
        setIsDrawing(true);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || readonly) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.lineTo(x, y);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const clearCanvas = () => {
        if (readonly) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    const colors = ['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFFFFF'];
    const lineWidths = [1, 2, 4, 8];

    return (
        <Box mb={4}>
            {title && (
                <Text fontSize="sm" fontWeight="600" color="gray.700" mb={2}>
                    {title}
                </Text>
            )}

            {!readonly && (
                <HStack mb={2} gap={3} flexWrap="wrap">
                    <HStack gap={1}>
                        <Text fontSize="xs" color="gray.600">Color:</Text>
                        {colors.map((c) => (
                            <Box
                                key={c}
                                width="24px"
                                height="24px"
                                bg={c}
                                border={color === c ? '3px solid blue' : '1px solid gray'}
                                borderRadius="sm"
                                cursor="pointer"
                                onClick={() => setColor(c)}
                            />
                        ))}
                    </HStack>

                    <HStack gap={1}>
                        <Text fontSize="xs" color="gray.600">Size:</Text>
                        {lineWidths.map((w) => (
                            <Button
                                key={w}
                                size="xs"
                                variant={lineWidth === w ? 'solid' : 'outline'}
                                onClick={() => setLineWidth(w)}
                            >
                                {w}px
                            </Button>
                        ))}
                    </HStack>

                    <Button size="xs" colorScheme="red" onClick={clearCanvas}>
                        Clear
                    </Button>
                </HStack>
            )}

            <Box
                border="1px solid"
                borderColor="gray.200"
                borderRadius="md"
                overflow="hidden"
                display="inline-block"
            >
                <canvas
                    ref={canvasRef}
                    width={width}
                    height={height}
                    style={{
                        display: 'block',
                        cursor: readonly ? 'default' : 'crosshair',
                        touchAction: 'none'
                    }}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                />
            </Box>

            {readonly && (
                <Text fontSize="xs" color="gray.500" mt={2}>
                    Drawing (read-only mode)
                </Text>
            )}
        </Box>
    );
};

