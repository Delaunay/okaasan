import React, { useRef, useState, useEffect } from 'react';
import { VStack, Box, Text, Input, HStack, Button } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const DrawingBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [color, setColor] = useState(block.data?.defaultColor || '#000000');
    const [lineWidth, setLineWidth] = useState(block.data?.defaultLineWidth || 2);

    const title = block.data?.title || '';
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
        if (block.data?.imageData) {
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0);
            };
            img.src = block.data.imageData;
        }
    }, [block.data?.imageData, backgroundColor]);

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
        if (!isDrawing) return;

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
        saveDrawing();
    };

    const saveDrawing = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const imageData = canvas.toDataURL('image/png');
        onChange('imageData', imageData);
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        saveDrawing();
    };

    const colors = ['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFFFFF'];
    const lineWidths = [1, 2, 4, 8];

    return (
        <VStack gap={3} align="stretch">
            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Title (Optional)
                </Text>
                <Input
                    size="sm"
                    value={title}
                    onChange={(e) => onChange('title', e.target.value)}
                    placeholder="Drawing title"
                />
            </Box>

            <HStack gap={2}>
                <Box flex={1}>
                    <Text fontSize="sm" fontWeight="600" mb={1}>
                        Width (px)
                    </Text>
                    <Input
                        size="sm"
                        type="number"
                        value={width}
                        onChange={(e) => onChange('width', parseInt(e.target.value) || 600)}
                    />
                </Box>
                <Box flex={1}>
                    <Text fontSize="sm" fontWeight="600" mb={1}>
                        Height (px)
                    </Text>
                    <Input
                        size="sm"
                        type="number"
                        value={height}
                        onChange={(e) => onChange('height', parseInt(e.target.value) || 400)}
                    />
                </Box>
            </HStack>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Background Color
                </Text>
                <Input
                    size="sm"
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => {
                        onChange('backgroundColor', e.target.value);
                    }}
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={2}>
                    Drawing Canvas
                </Text>

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
                                onClick={() => {
                                    setColor(c);
                                    onChange('defaultColor', c);
                                }}
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
                                onClick={() => {
                                    setLineWidth(w);
                                    onChange('defaultLineWidth', w);
                                }}
                            >
                                {w}px
                            </Button>
                        ))}
                    </HStack>

                    <Button size="xs" colorScheme="red" onClick={clearCanvas}>
                        Clear
                    </Button>
                </HStack>

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
                            cursor: 'crosshair',
                            touchAction: 'none',
                            maxWidth: '100%'
                        }}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                    />
                </Box>
            </Box>

            <Text fontSize="xs" color="gray.500">
                Draw on the canvas above. Your drawing is automatically saved.
            </Text>
        </VStack>
    );
};

