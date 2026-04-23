import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

interface Component {
    id: string;
    type: 'resistor' | 'capacitor' | 'inductor' | 'voltage_source' | 'current_source' | 'ground' | 'battery' | 'diode' | 'led' | 'transistor' | 'switch' | 'fuse';
    value?: string;
    x: number;
    y: number;
    rotation?: number;
}

interface Wire {
    points: Array<[number, number]>;
}

const ComponentSymbol: React.FC<{ component: Component }> = ({ component }) => {
    const { type, x, y, rotation = 0, value, id } = component;
    const transform = `translate(${x}, ${y}) rotate(${rotation})`;

    const renderSymbol = () => {
        switch (type) {
            case 'resistor':
                return (
                    <g>
                        <line x1="-40" y1="0" x2="-20" y2="0" stroke="currentColor" strokeWidth="2" />
                        <path d="M-20,0 L-15,-8 L-5,8 L5,-8 L15,8 L20,0" fill="none" stroke="currentColor" strokeWidth="2" />
                        <line x1="20" y1="0" x2="40" y2="0" stroke="currentColor" strokeWidth="2" />
                    </g>
                );
            case 'capacitor':
                return (
                    <g>
                        <line x1="-40" y1="0" x2="-5" y2="0" stroke="currentColor" strokeWidth="2" />
                        <line x1="-5" y1="-15" x2="-5" y2="15" stroke="currentColor" strokeWidth="3" />
                        <line x1="5" y1="-15" x2="5" y2="15" stroke="currentColor" strokeWidth="3" />
                        <line x1="5" y1="0" x2="40" y2="0" stroke="currentColor" strokeWidth="2" />
                    </g>
                );
            case 'inductor':
                return (
                    <g>
                        <line x1="-40" y1="0" x2="-20" y2="0" stroke="currentColor" strokeWidth="2" />
                        <path d="M-20,0 Q-15,-10 -10,0 Q-5,10 0,0 Q5,-10 10,0 Q15,10 20,0" fill="none" stroke="currentColor" strokeWidth="2" />
                        <line x1="20" y1="0" x2="40" y2="0" stroke="currentColor" strokeWidth="2" />
                    </g>
                );
            case 'voltage_source':
            case 'battery':
                return (
                    <g>
                        <line x1="-40" y1="0" x2="-5" y2="0" stroke="currentColor" strokeWidth="2" />
                        <line x1="-5" y1="-20" x2="-5" y2="20" stroke="currentColor" strokeWidth="3" />
                        <line x1="5" y1="-12" x2="5" y2="12" stroke="currentColor" strokeWidth="3" />
                        <line x1="5" y1="0" x2="40" y2="0" stroke="currentColor" strokeWidth="2" />
                        <text x="-10" y="-5" fontSize="16" fill="currentColor">+</text>
                    </g>
                );
            case 'current_source':
                return (
                    <g>
                        <circle cx="0" cy="0" r="20" fill="none" stroke="currentColor" strokeWidth="2" />
                        <line x1="-40" y1="0" x2="-20" y2="0" stroke="currentColor" strokeWidth="2" />
                        <line x1="20" y1="0" x2="40" y2="0" stroke="currentColor" strokeWidth="2" />
                        <path d="M-8,0 L8,0 M3,-5 L8,0 L3,5" fill="none" stroke="currentColor" strokeWidth="2" />
                    </g>
                );
            case 'ground':
                return (
                    <g>
                        <line x1="0" y1="-20" x2="0" y2="0" stroke="currentColor" strokeWidth="2" />
                        <line x1="-20" y1="0" x2="20" y2="0" stroke="currentColor" strokeWidth="3" />
                        <line x1="-12" y1="6" x2="12" y2="6" stroke="currentColor" strokeWidth="2" />
                        <line x1="-6" y1="12" x2="6" y2="12" stroke="currentColor" strokeWidth="2" />
                    </g>
                );
            case 'diode':
                return (
                    <g>
                        <line x1="-40" y1="0" x2="-10" y2="0" stroke="currentColor" strokeWidth="2" />
                        <path d="M-10,-12 L-10,12 L10,0 Z" fill="none" stroke="currentColor" strokeWidth="2" />
                        <line x1="10" y1="-12" x2="10" y2="12" stroke="currentColor" strokeWidth="2" />
                        <line x1="10" y1="0" x2="40" y2="0" stroke="currentColor" strokeWidth="2" />
                    </g>
                );
            case 'led':
                return (
                    <g>
                        <line x1="-40" y1="0" x2="-10" y2="0" stroke="currentColor" strokeWidth="2" />
                        <path d="M-10,-12 L-10,12 L10,0 Z" fill="none" stroke="currentColor" strokeWidth="2" />
                        <line x1="10" y1="-12" x2="10" y2="12" stroke="currentColor" strokeWidth="2" />
                        <line x1="10" y1="0" x2="40" y2="0" stroke="currentColor" strokeWidth="2" />
                        <path d="M2,-15 L8,-21 M8,-21 L8,-18 M8,-21 L5,-21" stroke="currentColor" strokeWidth="1" fill="none" />
                        <path d="M8,-15 L14,-21 M14,-21 L14,-18 M14,-21 L11,-21" stroke="currentColor" strokeWidth="1" fill="none" />
                    </g>
                );
            case 'switch':
                return (
                    <g>
                        <line x1="-40" y1="0" x2="-10" y2="0" stroke="currentColor" strokeWidth="2" />
                        <circle cx="-10" cy="0" r="3" fill="currentColor" />
                        <line x1="-10" y1="0" x2="5" y2="-8" stroke="currentColor" strokeWidth="2" />
                        <circle cx="10" cy="0" r="3" fill="currentColor" />
                        <line x1="10" y1="0" x2="40" y2="0" stroke="currentColor" strokeWidth="2" />
                    </g>
                );
            case 'fuse':
                return (
                    <g>
                        <line x1="-40" y1="0" x2="-15" y2="0" stroke="currentColor" strokeWidth="2" />
                        <rect x="-15" y="-8" width="30" height="16" fill="none" stroke="currentColor" strokeWidth="2" />
                        <line x1="-10" y1="0" x2="10" y2="0" stroke="currentColor" strokeWidth="2" />
                        <line x1="15" y1="0" x2="40" y2="0" stroke="currentColor" strokeWidth="2" />
                    </g>
                );
            case 'transistor':
                return (
                    <g>
                        <circle cx="0" cy="0" r="20" fill="none" stroke="currentColor" strokeWidth="2" />
                        <line x1="-8" y1="-10" x2="-8" y2="10" stroke="currentColor" strokeWidth="2" />
                        <line x1="-8" y1="-6" x2="8" y2="-14" stroke="currentColor" strokeWidth="2" />
                        <line x1="-8" y1="6" x2="8" y2="14" stroke="currentColor" strokeWidth="2" />
                        <line x1="8" y1="-14" x2="8" y2="-25" stroke="currentColor" strokeWidth="2" />
                        <line x1="8" y1="14" x2="8" y2="25" stroke="currentColor" strokeWidth="2" />
                        <line x1="-20" y1="0" x2="-8" y2="0" stroke="currentColor" strokeWidth="2" />
                    </g>
                );
            default:
                return <circle cx="0" cy="0" r="5" fill="currentColor" />;
        }
    };

    return (
        <g transform={transform}>
            {renderSymbol()}
            {value && (
                <text x="0" y="35" fontSize="12" fill="currentColor" textAnchor="middle">
                    {value}
                </text>
            )}
            <text x="0" y="-25" fontSize="11" fill="currentColor" textAnchor="middle" fontWeight="600">
                {id}
            </text>
        </g>
    );
};

export const ElectricalDiagramBlock: React.FC<BlockComponentProps> = ({ block }) => {
    const components: Component[] = block.data?.components || [];
    const wires: Wire[] = block.data?.wires || [];
    const title = block.data?.title;
    const width = block.data?.width || 600;
    const height = block.data?.height || 400;

    if (components.length === 0) {
        return (
            <Box mb={4} p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Text fontSize="sm" color="gray.500" fontStyle="italic">
                    No electrical diagram defined
                </Text>
            </Box>
        );
    }

    return (
        <Box mb={4}>
            {title && (
                <Text fontSize="sm" fontWeight="600" color="gray.700" mb={2}>
                    {title}
                </Text>
            )}
            <Box
                border="1px solid"
                borderColor="gray.200"
                borderRadius="md"
                bg="bg"
                p={4}
                overflow="auto"
            >
                <svg width={width} height={height} style={{ display: 'block', margin: '0 auto' }}>
                    {/* Grid background */}
                    <defs>
                        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--chakra-colors-gray-200)" strokeWidth="0.5" />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />

                    {/* Wires */}
                    <g stroke="var(--chakra-colors-gray-800)" strokeWidth="2" fill="none">
                        {wires.map((wire, idx) => {
                            const pathData = wire.points
                                .map((point, i) => `${i === 0 ? 'M' : 'L'}${point[0]},${point[1]}`)
                                .join(' ');
                            return <path key={idx} d={pathData} />;
                        })}
                    </g>

                    {/* Components */}
                    <g color="var(--chakra-colors-gray-800)">
                        {components.map((component, idx) => (
                            <ComponentSymbol key={idx} component={component} />
                        ))}
                    </g>
                </svg>
            </Box>
        </Box>
    );
};

