import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Text,
    Button,
    HStack,
    Input,
    VStack,
    Heading,
} from '@chakra-ui/react';
import { recipeAPI } from '../../services/api';
import type { Event } from '../../services/type';
import {
    toDateServer,
    fromDateServer,
} from '../../utils/dateUtils';
import { WeeklyGrid, DAYS, type DateResolver } from '../calendar/shared';

const ROUTINE_BASE_DATE = new Date(1970, 0, 5); // Jan 5, 1970 = Monday

interface RoutineProps {
    initialOwner?: string;
    initialRoutineName?: string;
}

const Routine: React.FC<RoutineProps> = ({
    initialOwner = 'default',
    initialRoutineName = 'work'
}) => {
    const [events, setEvents] = useState<Event[]>([]);
    const [owner, setOwner] = useState<string>(initialOwner);
    const [routineName, setRoutineName] = useState<string>(initialRoutineName);

    const [copiedDayEvents, setCopiedDayEvents] = useState<Event[] | null>(null);
    const [copiedDayName, setCopiedDayName] = useState<string | null>(null);
    const [showStats, setShowStats] = useState(true);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalInitialDate, setModalInitialDate] = useState<Date | undefined>();
    const [modalInitialTime, setModalInitialTime] = useState<string | undefined>();
    const [editingEvent, setEditingEvent] = useState<Event | null>(null);

    const resolveDateForDay: DateResolver = useCallback((dayIndex: number) => {
        const targetDate = new Date(ROUTINE_BASE_DATE);
        targetDate.setDate(ROUTINE_BASE_DATE.getDate() + dayIndex);
        return targetDate;
    }, []);

    const getEventsForDay = useCallback((dayName: string): Event[] => {
        const dayIndex = DAYS.indexOf(dayName as typeof DAYS[number]);
        if (dayIndex === -1) return [];

        return events.filter(event => {
            const eventDate = fromDateServer(event.datetime_start);
            const eventDayOfWeek = (eventDate.getDay() + 6) % 7;
            return eventDayOfWeek === dayIndex;
        });
    }, [events]);

    const handleTimeSlotClick = (_dayName: string, dayIndex: number, hour: number, minutes: number) => {
        const clickedDate = new Date(ROUTINE_BASE_DATE);
        clickedDate.setDate(ROUTINE_BASE_DATE.getDate() + dayIndex);

        setEditingEvent(null);
        setModalInitialDate(clickedDate);
        setModalInitialTime(`${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`);
        setIsModalOpen(true);
    };

    const handleEventDoubleClick = (event: Event) => {
        setEditingEvent(event);
        setModalInitialDate(undefined);
        setModalInitialTime(undefined);
        setIsModalOpen(true);
    };

    const handleEventTimeChange = async (event: Event, newStartTime: Date, newEndTime: Date) => {
        try {
            if (event.id !== undefined) {
                const startTimeServer = toDateServer(newStartTime);
                const endTimeServer = toDateServer(newEndTime);

                await recipeAPI.updateEvent(event.id, {
                    datetime_start: startTimeServer,
                    datetime_end: endTimeServer,
                    template: true,
                    owner,
                    name: routineName
                });

                setEvents(prevEvents =>
                    prevEvents.map(e =>
                        e.id === event.id
                            ? { ...e, datetime_start: startTimeServer, datetime_end: endTimeServer }
                            : e
                    )
                );
            }
        } catch (error) {
            console.error('Error updating routine event:', error);
        }
    };

    const handleEventCreated = async (newEvent: Event) => {
        try {
            const routineEvent = await recipeAPI.createEvent({
                ...newEvent,
                template: true,
                owner,
                name: routineName
            });
            setEvents(prevEvents => [...prevEvents, routineEvent]);
            setIsModalOpen(false);
        } catch (error) {
            console.error('Error creating routine event:', error);
        }
    };

    const handleEventUpdated = async (updatedEvent: Event) => {
        try {
            const routineEvent = await recipeAPI.updateEvent(updatedEvent.id!, {
                ...updatedEvent,
                template: true,
                owner,
                name: routineName
            });
            setEvents(prevEvents =>
                prevEvents.map(e => e.id === routineEvent.id ? routineEvent : e)
            );
            setIsModalOpen(false);
            setEditingEvent(null);
        } catch (error) {
            console.error('Error updating routine event:', error);
        }
    };

    const handleEventDeleted = (eventId: number) => {
        setEvents(prevEvents => prevEvents.filter(e => e.id !== eventId));
        setIsModalOpen(false);
        setEditingEvent(null);
    };

    const fetchRoutineEvents = async () => {
        try {
            const data = await recipeAPI.getRoutineEvents(owner, routineName);
            setEvents(data);
        } catch (error) {
            console.error('Error fetching routine events:', error);
            setEvents([]);
        }
    };

    useEffect(() => { fetchRoutineEvents(); }, [owner, routineName]);

    // ── Copy / Paste ─────────────────────────────────────────────────────────

    const handleCopyDay = (dayName: string) => {
        const eventsForDay = getEventsForDay(dayName);
        if (eventsForDay.length === 0) {
            alert(`No events to copy from ${dayName}`);
            return;
        }
        setCopiedDayEvents(eventsForDay);
        setCopiedDayName(dayName);
        alert(`Copied ${eventsForDay.length} event(s) from ${dayName}`);
    };

    const handlePasteDay = async (targetDayName: string) => {
        if (!copiedDayEvents || copiedDayEvents.length === 0) {
            alert('No events copied. Copy a day first.');
            return;
        }

        const sourceDayIndex = DAYS.indexOf(copiedDayName as typeof DAYS[number]);
        const targetDayIndex = DAYS.indexOf(targetDayName as typeof DAYS[number]);
        if (sourceDayIndex === -1 || targetDayIndex === -1) {
            alert('Invalid day selection');
            return;
        }

        try {
            const dayOffset = targetDayIndex - sourceDayIndex;

            const pastePromises = copiedDayEvents.map(async (event) => {
                const eventStart = fromDateServer(event.datetime_start);
                const eventEnd = fromDateServer(event.datetime_end);

                const newStart = new Date(eventStart);
                newStart.setDate(eventStart.getDate() + dayOffset);
                const newEnd = new Date(eventEnd);
                newEnd.setDate(eventEnd.getDate() + dayOffset);

                return recipeAPI.createEvent({
                    title: event.title,
                    description: event.description,
                    datetime_start: toDateServer(newStart),
                    datetime_end: toDateServer(newEnd),
                    location: event.location,
                    color: event.color,
                    kind: event.kind,
                    done: false,
                    template: true,
                    recuring: false,
                    active: true,
                    owner,
                    name: routineName
                });
            });

            const createdEvents = await Promise.all(pastePromises);
            setEvents(prevEvents => [...prevEvents, ...createdEvents]);
            alert(`Pasted ${createdEvents.length} event(s) to ${targetDayName}`);
        } catch (error) {
            console.error('Error pasting events:', error);
            alert('Failed to paste events');
        }
    };

    // ── Statistics ────────────────────────────────────────────────────────────

    const computeWeekStats = () => {
        const statsByName: Record<string, {
            count: number;
            totalMinutes: number;
            color?: string;
            durations: number[];
        }> = {};

        events.forEach(event => {
            const eventStart = fromDateServer(event.datetime_start);
            const eventEnd = fromDateServer(event.datetime_end);
            const durationMinutes = (eventEnd.getTime() - eventStart.getTime()) / (1000 * 60);
            const eventName = event.title || 'Unnamed';

            if (!statsByName[eventName]) {
                statsByName[eventName] = { count: 0, totalMinutes: 0, color: event.color, durations: [] };
            }
            statsByName[eventName].count += 1;
            statsByName[eventName].totalMinutes += durationMinutes;
            statsByName[eventName].durations.push(durationMinutes);
        });

        return Object.entries(statsByName)
            .map(([name, stats]) => ({
                name,
                count: stats.count,
                totalMinutes: stats.totalMinutes,
                totalHours: stats.totalMinutes / 60,
                color: stats.color,
                avgBlockDuration: stats.totalMinutes / stats.count,
                avgBlockDurationHours: stats.totalMinutes / stats.count / 60,
                longestBlock: Math.max(...stats.durations),
                longestBlockHours: Math.max(...stats.durations) / 60,
                fragmentationIndex: stats.count / Math.max(stats.totalMinutes / 60, 0.1),
            }))
            .sort((a, b) => b.totalMinutes - a.totalMinutes);
    };

    const weekStats = computeWeekStats();
    const totalWeekMinutes = weekStats.reduce((sum, s) => sum + s.totalMinutes, 0);
    const totalWeekHours = totalWeekMinutes / 60;
    const totalDayMinutes = 24 * 7 * 60;
    const unaccountedMinutes = totalDayMinutes - totalWeekMinutes;
    const unaccountedHours = unaccountedMinutes / 60;

    // ── Day header renderer ──────────────────────────────────────────────────

    const renderDayHeader = (day: string, _dayIndex: number) => {
        const eventsCount = getEventsForDay(day).length;
        const isCopiedDay = copiedDayName === day;

        return (
            <HStack gap={1}>
                <Text
                    fontWeight="bold"
                    color={isCopiedDay ? "blue.400" : undefined}
                >
                    {day}
                </Text>
                <HStack>
                    <Button
                        size="xs"
                        variant="ghost"
                        colorScheme="blue"
                        onClick={(e) => { e.stopPropagation(); handleCopyDay(day); }}
                        title={`Copy ${day} (${eventsCount} events)`}
                        disabled={eventsCount === 0}
                    >
                        📋
                    </Button>
                    <Button
                        size="xs"
                        variant="ghost"
                        colorScheme="green"
                        onClick={(e) => { e.stopPropagation(); handlePasteDay(day); }}
                        title={`Paste to ${day}`}
                        disabled={!copiedDayEvents || copiedDayEvents.length === 0}
                    >
                        📌
                    </Button>
                </HStack>
            </HStack>
        );
    };

    // ── Render ────────────────────────────────────────────────────────────────

    const formatDuration = (hours: number, minutes: number) =>
        hours >= 1 ? `${hours.toFixed(1)}h` : `${minutes.toFixed(0)}m`;

    return (
        <Box className="cls-routine" h="100%" w="100%">
            {/* Header */}
            <Box mb={4} p={4} bg="bg" borderRadius="md">
                <VStack gap={4} align="stretch">
                    <HStack justify="space-between" align="center">
                        <Heading size="lg">Routine Template</Heading>
                        {copiedDayName && copiedDayEvents && (
                            <Box
                                px={3} py={1} bg="bg" borderRadius="md"
                                border="1px solid" borderColor="var(--border-color)"
                            >
                                <Text fontSize="sm" fontWeight="medium" color="blue.400">
                                    📋 Copied: {copiedDayName} ({copiedDayEvents.length} event{copiedDayEvents.length !== 1 ? 's' : ''})
                                </Text>
                            </Box>
                        )}
                    </HStack>

                    <HStack gap={4}>
                        <HStack flex="1">
                            <Text mb={2} fontWeight="medium">Owner</Text>
                            <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Enter owner name" />
                        </HStack>
                        <HStack flex="1">
                            <Text mb={2} fontWeight="medium">Routine Name</Text>
                            <select
                                value={routineName}
                                onChange={(e) => setRoutineName(e.target.value)}
                                style={{
                                    padding: '8px', borderRadius: '6px',
                                    border: '1px solid var(--border-color)',
                                    width: '100%', backgroundColor: 'var(--card-bg)'
                                }}
                            >
                                <option value="work">Work</option>
                                <option value="sport">Sport</option>
                                <option value="relax">Relax</option>
                                <option value="vacation">Vacation</option>
                                <option value="study">Study</option>
                                <option value="family">Family</option>
                                <option value="personal">Personal</option>
                            </select>
                        </HStack>
                        <Box display="flex" alignItems="flex-end">
                            <Button colorScheme="blue" onClick={fetchRoutineEvents}>Load Routine</Button>
                        </Box>
                    </HStack>

                    {/* Statistics */}
                    {events.length > 0 && (
                        <Box>
                            <HStack justify="space-between" align="center" mb={2}>
                                <Text fontWeight="bold" fontSize="md">Weekly Statistics</Text>
                                <Button size="xs" variant="ghost" onClick={() => setShowStats(!showStats)}>
                                    {showStats ? '▼ Hide' : '▶ Show'}
                                </Button>
                            </HStack>

                            {showStats && (
                                <Box border="1px solid" borderColor="var(--border-color)" borderRadius="md" overflow="hidden">
                                    <Box overflowX="auto">
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: 'var(--card-bg)' }}>
                                                    {['Event', 'Total Time', 'Daily Avg', 'Avg Block', 'Longest', 'Frag', '%'].map((h, i) => (
                                                        <th key={h} style={{
                                                            padding: '8px', textAlign: i === 0 ? 'left' : 'right',
                                                            borderBottom: '1px solid var(--border-color)',
                                                            fontSize: '0.875rem', fontWeight: 600,
                                                        }}>
                                                            {h}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {weekStats.map((stat, index) => {
                                                    const percentage = totalWeekMinutes > 0
                                                        ? (stat.totalMinutes / totalWeekMinutes * 100).toFixed(1) : '0';
                                                    const dailyAvgMinutes = stat.totalMinutes / 7;
                                                    return (
                                                        <tr key={index} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                            <td style={{ padding: '8px' }}>
                                                                <HStack gap={2}>
                                                                    <Box width="12px" height="12px" bg={stat.color || 'gray.400'} borderRadius="sm" />
                                                                    <Text fontSize="sm">{stat.name}</Text>
                                                                </HStack>
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'right' }}>
                                                                <Text fontSize="sm" fontWeight="medium">{formatDuration(stat.totalHours, stat.totalMinutes)}</Text>
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'right' }}>
                                                                <Text fontSize="sm" color="var(--muted-text)">{formatDuration(dailyAvgMinutes / 60, dailyAvgMinutes)}</Text>
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'right' }}>
                                                                <Text fontSize="sm" color="var(--muted-text)">{formatDuration(stat.avgBlockDurationHours, stat.avgBlockDuration)}</Text>
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'right' }}>
                                                                <Text fontSize="sm" color="var(--muted-text)">{formatDuration(stat.longestBlockHours, stat.longestBlock)}</Text>
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'right' }}>
                                                                <Text fontSize="sm" color="var(--muted-text)">{stat.fragmentationIndex.toFixed(2)}</Text>
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'right' }}>
                                                                <Text fontSize="sm" color="var(--muted-text)">{percentage}%</Text>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot>
                                                <tr style={{ backgroundColor: 'var(--card-bg)', fontWeight: 'bold' }}>
                                                    <td style={{ padding: '8px' }}><Text fontSize="sm" fontWeight="bold">Total Scheduled</Text></td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}><Text fontSize="sm" fontWeight="bold">{formatDuration(totalWeekHours, totalWeekMinutes)}</Text></td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}><Text fontSize="sm" fontWeight="bold">{formatDuration(totalWeekHours / 7, totalWeekMinutes / 7)}</Text></td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}><Text fontSize="sm" fontWeight="bold">-</Text></td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}><Text fontSize="sm" fontWeight="bold">-</Text></td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}><Text fontSize="sm" fontWeight="bold">-</Text></td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}><Text fontSize="sm" fontWeight="bold">100%</Text></td>
                                                </tr>
                                                <tr style={{ backgroundColor: 'var(--card-bg)' }}>
                                                    <td style={{ padding: '8px' }}>
                                                        <HStack gap={2}>
                                                            <Box width="12px" height="12px" bg="var(--muted-text)" borderRadius="sm" />
                                                            <Text fontSize="sm" fontStyle="italic" color="var(--muted-text)">Unaccounted Time</Text>
                                                        </HStack>
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                                        <Text fontSize="sm" color="var(--muted-text)">{formatDuration(unaccountedHours, Math.max(0, unaccountedMinutes))}</Text>
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                                        <Text fontSize="sm" color="var(--muted-text)">{formatDuration(unaccountedHours / 7, Math.max(0, unaccountedMinutes / 7))}</Text>
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}><Text fontSize="sm" color="var(--muted-text)">-</Text></td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}><Text fontSize="sm" color="var(--muted-text)">-</Text></td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}><Text fontSize="sm" color="var(--muted-text)">-</Text></td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                                        <Text fontSize="sm" color="var(--muted-text)">
                                                            {Math.max(0, (unaccountedMinutes / totalDayMinutes * 100)).toFixed(1)}%
                                                        </Text>
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </Box>
                                </Box>
                            )}
                        </Box>
                    )}
                </VStack>
            </Box>

            <WeeklyGrid
                events={events}
                getEventsForDay={getEventsForDay}
                resolveDateForDay={resolveDateForDay}
                onTimeSlotClick={handleTimeSlotClick}
                onEventDoubleClick={handleEventDoubleClick}
                onEventTimeChange={handleEventTimeChange}
                onEventCreated={handleEventCreated}
                onEventUpdated={handleEventUpdated}
                onEventDeleted={handleEventDeleted}
                renderDayHeader={renderDayHeader}
                isModalOpen={isModalOpen}
                editingEvent={editingEvent}
                modalInitialDate={modalInitialDate}
                modalInitialTime={modalInitialTime}
                onModalClose={() => {
                    setIsModalOpen(false);
                    setEditingEvent(null);
                    setModalInitialDate(undefined);
                    setModalInitialTime(undefined);
                }}
            />
        </Box>
    );
};

export default Routine;
