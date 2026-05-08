import React, { useCallback, useMemo, useState } from 'react';
import {
    Box, Button, Grid, Heading, HStack, Input, Text, VStack,
} from '@chakra-ui/react';
import { VegaProvider } from '../../contexts/VegaContext';

import StressChart from './charts/StressChart';
import BodyBatteryChart from './charts/BodyBatteryChart';
import StepsChart from './charts/StepsChart';
import RespirationChart from './charts/RespirationChart';
import DailySummaryChart from './charts/DailySummaryChart';
import SpO2Chart from './charts/SpO2Chart';

const RANGE_PRESETS = [
    { label: '1W', days: 7 },
    { label: '1M', days: 30 },
    { label: '3M', days: 90 },
    { label: '1Y', days: 365 },
] as const;

function fmt(d: Date) {
    return d.toISOString().slice(0, 10);
}

const HealthDetailView: React.FC = () => {
    const today = useMemo(() => new Date(), []);
    const [startDate, setStartDate] = useState(fmt(new Date(today.getTime() - 30 * 86400_000)));
    const [endDate, setEndDate] = useState(fmt(today));
    const [activePreset, setActivePreset] = useState<string>('1M');

    const applyPreset = useCallback((days: number, label: string) => {
        const end = new Date();
        const start = new Date(end.getTime() - days * 86400_000);
        setStartDate(fmt(start));
        setEndDate(fmt(end));
        setActivePreset(label);
    }, []);

    const handleStartChange = useCallback((v: string) => { setStartDate(v); setActivePreset(''); }, []);
    const handleEndChange = useCallback((v: string) => { setEndDate(v); setActivePreset(''); }, []);

    return (
        <VegaProvider>
            <Box width="100%" maxW="1200px" mx="auto" p={4}>
                <Heading size="lg" mb={4}>Health Details</Heading>

                <HStack mb={6} gap={3} flexWrap="wrap">
                    <HStack gap={1}>
                        {RANGE_PRESETS.map((p) => (
                            <Button
                                key={p.label}
                                size="xs"
                                variant={activePreset === p.label ? 'solid' : 'outline'}
                                colorPalette={activePreset === p.label ? 'blue' : 'gray'}
                                onClick={() => applyPreset(p.days, p.label)}
                            >
                                {p.label}
                            </Button>
                        ))}
                    </HStack>
                    <HStack gap={1}>
                        <Text fontSize="sm" whiteSpace="nowrap">From</Text>
                        <Input type="date" size="sm" value={startDate} onChange={(e) => handleStartChange(e.target.value)} maxW="160px" />
                    </HStack>
                    <HStack gap={1}>
                        <Text fontSize="sm" whiteSpace="nowrap">To</Text>
                        <Input type="date" size="sm" value={endDate} onChange={(e) => handleEndChange(e.target.value)} maxW="160px" />
                    </HStack>
                </HStack>

                <Heading size="md" mb={4}>Time Series</Heading>
                <Grid templateColumns={{ base: '1fr', lg: 'repeat(2, 1fr)' }} gap={6} mb={8}>
                    <Box>
                        <Heading size="sm" mb={2}>Stress</Heading>
                        <StressChart start={startDate} end={endDate} />
                    </Box>
                    <Box>
                        <Heading size="sm" mb={2}>Body Battery</Heading>
                        <BodyBatteryChart start={startDate} end={endDate} />
                    </Box>
                    <Box>
                        <Heading size="sm" mb={2}>Respiration</Heading>
                        <RespirationChart start={startDate} end={endDate} />
                    </Box>
                    <Box>
                        <Heading size="sm" mb={2}>Steps</Heading>
                        <StepsChart start={startDate} end={endDate} />
                    </Box>
                    <Box>
                        <Heading size="sm" mb={2}>SpO2</Heading>
                        <SpO2Chart start={startDate} end={endDate} />
                    </Box>
                </Grid>

                <Heading size="md" mb={4}>Daily Summaries</Heading>
                <Grid templateColumns={{ base: '1fr', lg: 'repeat(2, 1fr)' }} gap={6}>
                    <Box>
                        <Heading size="sm" mb={2}>Floors Climbed</Heading>
                        <DailySummaryChart start={startDate} end={endDate} field="floors_ascended" title="Floors" color="#9467bd" />
                    </Box>
                    <Box>
                        <Heading size="sm" mb={2}>Sleep Score</Heading>
                        <DailySummaryChart start={startDate} end={endDate} field="sleep_score" title="Score" color="#1f4e79" mark="line" yDomain={[0, 100]} />
                    </Box>
                </Grid>
            </Box>
        </VegaProvider>
    );
};

export default HealthDetailView;
