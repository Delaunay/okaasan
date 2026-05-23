import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Text,
    Button,
    HStack,
} from '@chakra-ui/react';
import { recipeAPI } from '../../services/api';
import type { Event } from '../../services/type';
import {
    toDateServer,
    formatDateRangeForServer,
    fromDateServer,
    getStartOfWeek,
    getEndOfWeek,
    formatDateDisplay,
    isToday,
} from '../../utils/dateUtils';
import { WeeklyGrid, DAYS, type DateResolver } from './shared';

interface WeeklyCalendarProps {
    initialDate?: Date;
}

const WeeklyCalendar: React.FC<WeeklyCalendarProps> = ({ initialDate }) => {
    const [events, setEvents] = useState<Event[]>([]);
    const [currentWeek, setCurrentWeek] = useState<Date>(initialDate || new Date());

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalInitialDate, setModalInitialDate] = useState<Date | undefined>();
    const [modalInitialTime, setModalInitialTime] = useState<string | undefined>();
    const [editingEvent, setEditingEvent] = useState<Event | null>(null);

    const resolveDateForDay: DateResolver = useCallback((dayIndex: number) => {
        const startOfWeek = getStartOfWeek(currentWeek);
        const targetDate = new Date(startOfWeek);
        targetDate.setDate(startOfWeek.getDate() + dayIndex);
        return targetDate;
    }, [currentWeek]);

    const getEventsForDay = useCallback((dayName: string): Event[] => {
        const dayIndex = DAYS.indexOf(dayName as typeof DAYS[number]);
        if (dayIndex === -1) return [];

        const startOfWeek = getStartOfWeek(currentWeek);
        const targetDate = new Date(startOfWeek);
        targetDate.setDate(startOfWeek.getDate() + dayIndex);

        return events.filter(event => {
            const eventDate = fromDateServer(event.datetime_start);
            return eventDate.toDateString() === targetDate.toDateString();
        });
    }, [events, currentWeek]);

    const handleTimeSlotClick = (_dayName: string, dayIndex: number, hour: number, minutes: number) => {
        const startOfWeek = getStartOfWeek(currentWeek);
        const clickedDate = new Date(startOfWeek);
        clickedDate.setDate(startOfWeek.getDate() + dayIndex);

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

    const goToPreviousWeek = () => {
        setCurrentWeek(prev => {
            const d = new Date(prev);
            d.setDate(d.getDate() - 7);
            return d;
        });
    };

    const goToNextWeek = () => {
        setCurrentWeek(prev => {
            const d = new Date(prev);
            d.setDate(d.getDate() + 7);
            return d;
        });
    };

    const goToToday = () => setCurrentWeek(new Date());

    const isDayToday = (dayIndex: number) => {
        const startOfWeek = getStartOfWeek(currentWeek);
        const dayDate = new Date(startOfWeek);
        dayDate.setDate(startOfWeek.getDate() + dayIndex);
        return isToday(dayDate);
    };

    const fetchEvents = async () => {
        try {
            const startOfWeek = getStartOfWeek(currentWeek);
            const endOfWeek = getEndOfWeek(currentWeek);
            const startUTC = formatDateRangeForServer(startOfWeek, false);
            const endUTC = formatDateRangeForServer(endOfWeek, true);
            const data = await recipeAPI.getEvents(startUTC, endUTC);
            setEvents(data);
        } catch (error) {
            console.error('Error fetching events:', error);
            setEvents([]);
        }
    };

    useEffect(() => { fetchEvents(); }, [currentWeek]);

    const renderDayHeader = (day: string, index: number) => {
        const startOfWeek = getStartOfWeek(currentWeek);
        const dayDate = new Date(startOfWeek);
        dayDate.setDate(startOfWeek.getDate() + index);
        const formattedDate = formatDateDisplay(dayDate);

        return (
            <>
                <Text>{day}</Text>
                <Text fontSize="xs" fontWeight="normal" color="gray.600" textAlign="center">
                    {formattedDate}
                </Text>
            </>
        );
    };

    const getDayBg = (dayIndex: number) => {
        if (isDayToday(dayIndex)) {
            return { bg: "orange.200", _dark: { bg: "orange.900" } };
        }
        return undefined;
    };

    return (
        <Box className="cls-calendar" h="100%" w="100%">
            <Box mb={4} p={2} bg="bg" borderRadius="md" boxShadow="sm">
                <HStack justify="space-between" align="center">
                    <Button variant="outline" size="sm" onClick={goToPreviousWeek}>
                        ← Previous
                    </Button>
                    <Button variant="solid" size="sm" colorScheme="blue" onClick={goToToday}>
                        Today
                    </Button>
                    <Button variant="outline" size="sm" onClick={goToNextWeek}>
                        Next →
                    </Button>
                </HStack>
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
