import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Box,
    Text,
    Button,
    HStack,
} from '@chakra-ui/react';
import { RefreshCw } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import type { Event } from '../../services/type';
import {
    toDateServer,
    formatDateRangeForServer,
    fromDateServer,
    formatDateDisplay,
    isToday,
} from '../../utils/dateUtils';
import { WeeklyGrid, type DateResolver } from './shared';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const stripTime = (d: Date) => {
    const r = new Date(d);
    r.setHours(0, 0, 0, 0);
    return r;
};

interface WeeklyCalendarProps {
    initialDate?: Date;
}

const WeeklyCalendar: React.FC<WeeklyCalendarProps> = ({ initialDate }) => {
    const [events, setEvents] = useState<Event[]>([]);
    const [startDate, setStartDate] = useState<Date>(() => stripTime(initialDate || new Date()));

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalInitialDate, setModalInitialDate] = useState<Date | undefined>();
    const [modalInitialTime, setModalInitialTime] = useState<string | undefined>();
    const [editingEvent, setEditingEvent] = useState<Event | null>(null);

    const [syncing, setSyncing] = useState(false);
    const [gcalConnected, setGcalConnected] = useState(false);

    useEffect(() => {
        recipeAPI.getGCalStatus()
            .then(status => setGcalConnected(status.setup_complete))
            .catch(() => setGcalConnected(false));
    }, []);

    const dayDates = useMemo(() =>
        Array.from({ length: 7 }, (_, i) => {
            const d = new Date(startDate);
            d.setDate(startDate.getDate() + i);
            return d;
        }),
    [startDate]);

    const dayLabels = useMemo(() =>
        dayDates.map(d => DAY_NAMES[d.getDay()]),
    [dayDates]);

    const resolveDateForDay: DateResolver = useCallback((dayIndex: number) => {
        return new Date(dayDates[dayIndex]);
    }, [dayDates]);

    const getEventsForDay = useCallback((_dayLabel: string, dayIndex: number): Event[] => {
        const targetDate = dayDates[dayIndex];
        return events.filter(event => {
            const eventDate = fromDateServer(event.datetime_start);
            return eventDate.toDateString() === targetDate.toDateString();
        });
    }, [events, dayDates]);

    const handleTimeSlotClick = (_dayLabel: string, dayIndex: number, hour: number, minutes: number) => {
        const clickedDate = new Date(dayDates[dayIndex]);

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
                    datetime_end: endTimeServer
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
            console.error('Error updating event:', error);
        }
    };

    const handleEventCreated = (newEvent: Event) => {
        setEvents(prevEvents => [...prevEvents, newEvent]);
        setIsModalOpen(false);
    };

    const handleEventUpdated = (updatedEvent: Event) => {
        setEvents(prevEvents =>
            prevEvents.map(e => e.id === updatedEvent.id ? updatedEvent : e)
        );
        setIsModalOpen(false);
        setEditingEvent(null);
    };

    const handleEventDeleted = (eventId: number) => {
        setEvents(prevEvents => prevEvents.filter(e => e.id !== eventId));
        setIsModalOpen(false);
        setEditingEvent(null);
    };

    const goToPrevious = () => {
        setStartDate(prev => {
            const d = new Date(prev);
            d.setDate(d.getDate() - 7);
            return d;
        });
    };

    const goToNext = () => {
        setStartDate(prev => {
            const d = new Date(prev);
            d.setDate(d.getDate() + 7);
            return d;
        });
    };

    const goToToday = () => setStartDate(stripTime(new Date()));

    const getDateRange = useCallback(() => {
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        return {
            startUTC: formatDateRangeForServer(startDate, false),
            endUTC: formatDateRangeForServer(endDate, true),
        };
    }, [startDate]);

    const fetchEvents = async () => {
        try {
            const { startUTC, endUTC } = getDateRange();
            const data = await recipeAPI.getEvents(startUTC, endUTC);
            setEvents(data);
        } catch (error) {
            console.error('Error fetching events:', error);
            setEvents([]);
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        try {
            const { startUTC, endUTC } = getDateRange();
            await recipeAPI.syncGCalEvents(startUTC, endUTC);
            await recipeAPI.completePastTasks();
            await fetchEvents();
        } catch (error) {
            console.error('Error syncing Google Calendar:', error);
        } finally {
            setSyncing(false);
        }
    };

    useEffect(() => { fetchEvents(); }, [startDate]);

    const renderDayHeader = (_dayLabel: string, index: number) => {
        const date = dayDates[index];
        const dayName = DAY_NAMES[date.getDay()];
        const formattedDate = formatDateDisplay(date);

        return (
            <>
                <Text>{dayName}</Text>
                <Text fontSize="xs" fontWeight="normal" color="gray.600" textAlign="center">
                    {formattedDate}
                </Text>
            </>
        );
    };

    const getDayBg = (dayIndex: number) => {
        if (isToday(dayDates[dayIndex])) {
            return { bg: "var(--cal-today-bg)" };
        }
        return undefined;
    };

    return (
        <Box className="cls-calendar" h="100%" w="100%">
            <Box mb={4} p={2} bg="bg" borderRadius="md" boxShadow="sm">
                <HStack justify="space-between" align="center">
                    <HStack gap={2}>
                        <Button variant="outline" size="sm" onClick={goToPrevious}>
                            ← Previous
                        </Button>
                        <Button variant="solid" size="sm" colorScheme="blue" onClick={goToToday}>
                            Today
                        </Button>
                        <Button variant="outline" size="sm" onClick={goToNext}>
                            Next →
                        </Button>
                    </HStack>
                    {gcalConnected && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleSync}
                            disabled={syncing}
                        >
                            <RefreshCw size={14} className={syncing ? 'spin' : ''} />
                            <Box ml={1}>{syncing ? 'Syncing...' : 'Sync'}</Box>
                        </Button>
                    )}
                </HStack>
            </Box>

            <WeeklyGrid
                events={events}
                days={dayLabels}
                getEventsForDay={getEventsForDay}
                resolveDateForDay={resolveDateForDay}
                onTimeSlotClick={handleTimeSlotClick}
                onEventDoubleClick={handleEventDoubleClick}
                onEventTimeChange={handleEventTimeChange}
                onEventCreated={handleEventCreated}
                onEventUpdated={handleEventUpdated}
                onEventDeleted={handleEventDeleted}
                renderDayHeader={renderDayHeader}
                getDayBg={getDayBg}
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

export default WeeklyCalendar;
