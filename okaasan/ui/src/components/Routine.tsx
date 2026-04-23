import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Grid,
    GridItem,
    Text,
    Button,
    HStack,
    Input,
    VStack,
    Heading,
} from '@chakra-ui/react';
import { recipeAPI } from '../services/api';
import type { Event } from '../services/type';
import EventModal from './EventModal';
import {
    toDateServer,
    fromDateServer,
} from '../utils/dateUtils';

// Individual Event Component for Routine
interface RoutineEventProps {
    event: Event;
    position: { top: number; height: number };
    onClick?: (event: Event) => void;
    onDoubleClick?: (event: Event) => void;
    onTimeChange?: (event: Event, newStartTime: Date, newEndTime: Date) => void;
    onDragStart?: (event: Event, position: { top: number; height: number }) => void;
    timeSlotHeight: number;
    snapInterval: number;
    gridWeek: GridWeek;
    dayIndex: number;
    isMock?: boolean;
    isDragging?: boolean;
    draggedEventData?: Event | null;
    mockPosition?: { top: number; height: number; dayIndex?: number } | null;
}

const RoutineEvent: React.FC<RoutineEventProps> = ({
    event,
    position,
    onClick,
    onDoubleClick,
    onTimeChange,
    onDragStart,
    timeSlotHeight,
    snapInterval,
    gridWeek,
    dayIndex,
    isMock,
    isDragging,
    draggedEventData,
    mockPosition
}) => {
    const [isDraggingState, setIsDraggingState] = useState(false);
    const dragOperationRef = useRef<DragOperation | null>(null);
    const eventRef = useRef<HTMLDivElement>(null);
    const [currentTime, setCurrentTime] = useState("");
    const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });

    // For mock events, use the provided position and don't handle interactions
    if (isMock) {
        const dayWidth = gridWeek.getWeekWidth() / 7;
        let displayDayIndex = 0;

        if (mockPosition && draggedEventData) {
            displayDayIndex = mockPosition.dayIndex !== undefined ? mockPosition.dayIndex : 0;
        }

        const leftPosition = displayDayIndex * dayWidth;
        const displayEvent = draggedEventData || event;

        return (
            <Box
                ref={eventRef}
                position="absolute"
                top={`${mockPosition?.top || 0}px`}
                left={`${leftPosition}px`}
                width={`${dayWidth}px`}
                height={`${mockPosition?.height || 30}px`}
                bg={displayEvent.color || "blue.500"}
                color="white"
                p={2}
                py={1}
                borderRadius="md"
                fontSize="sm"
                fontWeight="bold"
                zIndex={1000}
                boxShadow="lg"
                border="1px solid"
                borderColor="blue.600"
                display="flex"
                flexDirection="column"
                justifyContent="space-between"
                opacity={0.8}
                userSelect="none"
                pointerEvents="none"
                style={{
                    display: isDragging && draggedEventData ? 'flex' : 'none'
                }}
                data-day-index={displayDayIndex}
            >
                <Box flex="1" overflow="hidden">
                    <Text fontWeight="bold" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                        {displayEvent.title}
                    </Text>
                    {displayEvent.description && (mockPosition?.height || 30) > 30 && (
                        <Text overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" fontSize="xs" opacity={0.9}>
                            {displayEvent.description}
                        </Text>
                    )}
                </Box>
            </Box>
        );
    }

    const shouldHide = isDragging;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onClick) {
            onClick(event);
        }
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        if (dragTimeout) {
            clearTimeout(dragTimeout);
            setDragTimeout(null);
        }

        if (onDoubleClick) {
            onDoubleClick(event);
        }
    };

    const handleEventMouseUp = (e: React.MouseEvent) => {
        e.stopPropagation();

        if (dragTimeout) {
            clearTimeout(dragTimeout);
            setDragTimeout(null);
        }
    };

    const [dragTimeout, setDragTimeout] = useState<NodeJS.Timeout | null>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();

        const timeout = setTimeout(() => {
            startDragOperation(e.clientX, e.clientY);
        }, 150);

        setDragTimeout(timeout);
    };

    const startDragOperation = (mouseX: number, mouseY: number) => {
        const calendarContainer = document.querySelector('.class-grid') as HTMLElement;
        if (!calendarContainer || !eventRef.current) return;

        const mockEvent = document.querySelector('[data-mock-event="true"]') as HTMLDivElement;
        if (!mockEvent) return;

        const containerRect = calendarContainer.getBoundingClientRect();

        dragOperationRef.current = new DragOperation(
            mockEvent,
            gridWeek,
            eventRef.current,
            event,
            { top: position.top, height: position.height, dayIndex },
            timeSlotHeight,
            { x: mouseX, y: mouseY },
            containerRect,
            onTimeChange,
            null // No specific week for routine events
        );

        dragOperationRef.current.onDragStart();
        setIsDraggingState(true);

        if (onDragStart) {
            onDragStart(event, position);
        }
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDraggingState || !dragOperationRef.current) return;

        setCursorPosition({ x: e.clientX, y: e.clientY });

        const calendarContainer = document.querySelector('.class-grid') as HTMLElement;
        if (!calendarContainer) return;

        const containerRect = calendarContainer.getBoundingClientRect();

        const result = dragOperationRef.current.onDragMove(e.clientX, e.clientY, containerRect);
        if (result) {
            setCurrentTime(result.time);
        }
    };

    const handleMouseUp = () => {
        if (!isDraggingState || !dragOperationRef.current) return;

        dragOperationRef.current.onDrop();

        setIsDraggingState(false);
        setCurrentTime("");
        dragOperationRef.current = null;
    };

    useEffect(() => {
        if (isDraggingState) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);

            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDraggingState, timeSlotHeight, snapInterval]);

    return (
        <>
            <Box
                ref={eventRef}
                position="absolute"
                top={`${position.top}px`}
                left="0"
                right="0"
                height={`${position.height}px`}
                bg={event.color || "blue.500"}
                color="white"
                p={2}
                py={1}
                borderRadius="md"
                fontSize="sm"
                fontWeight="bold"
                zIndex={isDraggingState ? 1000 : 1}
                cursor={isDraggingState ? "grabbing" : "grab"}
                boxShadow="lg"
                border="1px solid"
                borderColor="blue.600"
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onMouseUp={handleEventMouseUp}
                display="flex"
                flexDirection="column"
                justifyContent="space-between"
                onMouseDown={handleMouseDown}
                opacity={isDraggingState ? 0.8 : 1}
                userSelect="none"
                transition={isDraggingState ? "none" : "all 0.2s"}
                _hover={{
                    opacity: isDraggingState ? 0.8 : 0.9,
                    transform: isDraggingState ? "scale(1.05)" : "scale(1.02)"
                }}
                style={{
                    visibility: shouldHide ? 'hidden' : 'visible'
                }}
            >
                <Box flex="1" overflow="hidden">
                    <Text fontWeight="bold" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                        {event.title}
                    </Text>
                    {event.description && position.height > 30 && (
                        <Text overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" fontSize="xs" opacity={0.9}>
                            {event.description}
                        </Text>
                    )}
                </Box>
            </Box>

            {/* Cursor Badge */}
            <CursorBadge
                time={currentTime}
                isVisible={isDraggingState}
                position={cursorPosition}
            />
        </>
    );
};

// Cursor Badge Component
interface CursorBadgeProps {
    time: string;
    isVisible: boolean;
    position: { x: number; y: number };
}

const CursorBadge: React.FC<CursorBadgeProps> = ({ time, isVisible, position }) => {
    if (!isVisible) return null;

    return (
        <Box
            position="fixed"
            left={`${position.x + 10}px`}
            top={`${position.y - 40}px`}
            bg="blue.500"
            color="white"
            px={2}
            py={1}
            borderRadius="md"
            fontSize="sm"
            fontWeight="bold"
            zIndex={10000}
            pointerEvents="none"
            boxShadow="lg"
            border="1px solid"
            borderColor="blue.600"
        >
            {time}
        </Box>
    );
};

// Hook to measure container and calculate time slot heights
const useCalendarSizing = () => {
    const [timeSlotHeight, setTimeSlotHeight] = useState(33);
    const [totalCalendarHeight, setTotalCalendarHeight] = useState(600);
    const [weekWidth, setWeekWidth] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;

        const calculateSizing = () => {
            const rect = element.getBoundingClientRect();
            const containerHeight = rect.height;
            const containerWidth = rect.width;

            const headerHeight = 50 + 10;
            const padding = 32;
            const availableHeight = containerHeight - headerHeight - padding;

            const hoursCount = 18;

            const calculatedHeight = availableHeight / hoursCount;

            const minSlotHeight = 5;
            const maxSlotHeight = 8000;

            const optimalHeight = Math.max(minSlotHeight, Math.min(maxSlotHeight, calculatedHeight));

            setTimeSlotHeight(optimalHeight);
            setTotalCalendarHeight(optimalHeight * hoursCount);
            setWeekWidth(containerWidth);
        };

        calculateSizing();

        const resizeObserver = new ResizeObserver(calculateSizing);
        resizeObserver.observe(element);

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    return { containerRef, timeSlotHeight, totalCalendarHeight, weekWidth };
};

// Grid class for positioning events within a week grid
class GridWeek {
    private startHour: number;
    private endHour: number;
    private dayHeight: number;
    private timeSlotHeight: number;
    private weekWidth: number;

    constructor(startHour: number, endHour: number, dayHeight: number, timeSlotHeight: number, weekWidth: number) {
        this.startHour = startHour;
        this.endHour = endHour + 1;
        this.dayHeight = dayHeight;
        this.timeSlotHeight = timeSlotHeight;
        this.weekWidth = weekWidth;
    }

    getEventPosition(event: Event): { top: number; height: number } {
        const eventStart = fromDateServer(event.datetime_start);
        const eventEnd = fromDateServer(event.datetime_end);

        const startMinutes = eventStart.getHours() * 60 + eventStart.getMinutes();
        const endMinutes = eventEnd.getHours() * 60 + eventEnd.getMinutes();
        const dayStartMinutes = this.startHour * 60;
        const dayEndMinutes = this.endHour * 60;

        // Clamp the event times to the visible calendar range
        const clampedStartMinutes = Math.max(dayStartMinutes, Math.min(dayEndMinutes, startMinutes));
        const clampedEndMinutes = Math.max(dayStartMinutes, Math.min(dayEndMinutes, endMinutes));

        // Calculate relative positions within the visible range
        const relativeStart = (clampedStartMinutes - dayStartMinutes) / (dayEndMinutes - dayStartMinutes);
        const relativeEnd = (clampedEndMinutes - dayStartMinutes) / (dayEndMinutes - dayStartMinutes);

        const top = relativeStart * this.dayHeight;
        const bottom = relativeEnd * this.dayHeight;
        const height = Math.max(0, bottom - top);

        return { top, height };
    }

    getEventPositionSnapped(event: Event): { top: number; height: number } {
        const position = this.getEventPosition(event);

        const snapInterval = this.timeSlotHeight / 12;
        const snappedTop = Math.round(position.top / snapInterval) * snapInterval;

        return { top: snappedTop, height: position.height };
    }

    getDayIndexFromWidth(x: number): number {
        const dayWidth = this.weekWidth / 7;
        const dayIndex = Math.trunc((x) / dayWidth);
        return Math.max(0, Math.min(6, dayIndex));
    }

    getDayNameFromWidth(widthPosition: number): string {
        const dayIndex = this.getDayIndexFromWidth(widthPosition);
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        return days[dayIndex];
    }

    snapWidthToDayStart(widthPosition: number): number {
        const dayWidth = this.weekWidth / 7;
        const dayIndex = this.getDayIndexFromWidth(widthPosition);
        return dayIndex * dayWidth;
    }

    getDaySpan(): number {
        return (this.endHour - this.startHour) * 60;
    }

    getSnapInterval(): number {
        return this.timeSlotHeight / 12;
    }

    getWeekWidth(): number {
        return this.weekWidth;
    }
}

class DragOperation {
    dragOperationVisual: HTMLDivElement;
    grid: GridWeek;
    originalEvent: HTMLDivElement;

    private originalEventData: Event;
    private originalPosition: { top: number; height: number; dayIndex: number };
    private isDragging: boolean = false;
    private timeSlotHeight: number;
    private onTimeChange?: (event: Event, newStartTime: Date, newEndTime: Date) => void;
    private mouseOffset: { x: number; y: number } = { x: 0, y: 0 };

    constructor(
        dragOperationVisual: HTMLDivElement,
        grid: GridWeek,
        originalEvent: HTMLDivElement,
        eventData: Event,
        position: { top: number; height: number; dayIndex: number },
        timeSlotHeight: number,
        initialMousePos: { x: number; y: number },
        containerRect: DOMRect,
        onTimeChange?: (event: Event, newStartTime: Date, newEndTime: Date) => void,
        _currentWeek?: Date | null
    ) {
        this.dragOperationVisual = dragOperationVisual;
        this.grid = grid;
        this.originalEvent = originalEvent;
        this.originalEventData = eventData;
        this.originalPosition = position;
        this.timeSlotHeight = timeSlotHeight;
        this.onTimeChange = onTimeChange;

        const relativeMouseY = initialMousePos.y - containerRect.top;
        this.mouseOffset = {
            x: 0,
            y: relativeMouseY - position.top
        };
    }

    onDragStart() {
        this.isDragging = true;
        this.originalEvent.style.visibility = 'hidden';
        this.updateDragVisualPosition(this.originalPosition.top, this.originalPosition.dayIndex, this.originalPosition.height);
        this.dragOperationVisual.style.display = 'flex';
        this.dragOperationVisual.style.opacity = '0.8';
    }

    onDragMove(mouseX: number, mouseY: number, containerRect: DOMRect) {
        if (!this.isDragging) return;

        const relativeX = mouseX - containerRect.left;
        const dayIndex = this.grid.getDayIndexFromWidth(relativeX);

        const relativeMouseY = mouseY - containerRect.top;
        const newTop = Math.max(0, relativeMouseY - this.mouseOffset.y);

        const snapInterval = this.grid.getSnapInterval();
        const snappedTop = Math.round(newTop / snapInterval) * snapInterval;

        this.updateDragVisualPosition(snappedTop, dayIndex);

        return this.calculateCurrentTimeAndDay(snappedTop, dayIndex);
    }

    onDrop() {
        if (!this.isDragging) return;

        this.isDragging = false;

        const finalTop = parseInt(this.dragOperationVisual.style.top);
        const finalDayIndex = parseInt(this.dragOperationVisual.dataset.dayIndex || '0');

        if (this.onTimeChange) {
            this.updateEventTime(finalTop, finalDayIndex);
        }

        this.dragOperationVisual.style.display = 'none';
        this.originalEvent.style.visibility = 'visible';

        return {
            top: finalTop,
            dayIndex: finalDayIndex,
            event: this.originalEventData
        };
    }

    private updateDragVisualPosition(top: number, dayIndex: number, height?: number) {
        const dayWidth = this.grid.getWeekWidth() / 7;
        const leftPosition = dayIndex * dayWidth;

        this.dragOperationVisual.style.top = `${top}px`;
        this.dragOperationVisual.style.left = `${leftPosition}px`;
        this.dragOperationVisual.style.width = `${dayWidth}px`;
        if (height !== undefined) {
            this.dragOperationVisual.style.height = `${height}px`;
        }
        this.dragOperationVisual.dataset.dayIndex = dayIndex.toString();
    }

    private calculateCurrentTimeAndDay(top: number, dayIndex: number) {
        const newHour = Math.floor(top / this.timeSlotHeight) + 6;
        const newMinutes = Math.floor((top % this.timeSlotHeight) / this.timeSlotHeight * 60);
        const snappedMinutes = Math.round(newMinutes / 5) * 5;

        const timeString = `${newHour.toString().padStart(2, '0')}:${snappedMinutes.toString().padStart(2, '0')}`;
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const dayString = days[dayIndex] ? ` - ${days[dayIndex]}` : "";

        return {
            time: timeString + dayString,
            dayIndex: dayIndex
        };
    }

    private updateEventTime(top: number, dayIndex: number) {
        if (!this.onTimeChange) return;

        const newHour = Math.floor(top / this.timeSlotHeight) + 6;
        const newMinutes = Math.floor((top % this.timeSlotHeight) / this.timeSlotHeight * 60);
        const snappedMinutes = Math.round(newMinutes / 5) * 5;

        const originalStart = fromDateServer(this.originalEventData.datetime_start);
        const originalEnd = fromDateServer(this.originalEventData.datetime_end);
        const durationMs = originalEnd.getTime() - originalStart.getTime();

        // For routine events, create a template date (using Monday of 1970 as base)
        const baseDate = new Date(1970, 0, 5); // Jan 5, 1970 was a Monday
        const targetDate = new Date(baseDate);
        targetDate.setDate(baseDate.getDate() + dayIndex);

        const newStartTime = new Date(targetDate);
        newStartTime.setHours(newHour, snappedMinutes, 0, 0);

        const newEndTime = new Date(newStartTime.getTime() + durationMs);

        this.onTimeChange(this.originalEventData, newStartTime, newEndTime);
    }

    cancel() {
        this.isDragging = false;
        this.originalEvent.style.visibility = 'visible';
        this.dragOperationVisual.style.display = 'none';
    }

    getIsDragging(): boolean {
        return this.isDragging;
    }
}

interface RoutineProps {
    initialOwner?: string;
    initialRoutineName?: string;
}

const Routine: React.FC<RoutineProps> = ({
    initialOwner = 'default',
    initialRoutineName = 'work'
}) => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const hours = Array.from({ length: 18 }, (_, i) => i + 6);

    const { containerRef, timeSlotHeight, totalCalendarHeight, weekWidth } = useCalendarSizing();

    const [events, setEvents] = useState<Event[]>([]);
    const [owner, setOwner] = useState<string>(initialOwner);
    const [routineName, setRoutineName] = useState<string>(initialRoutineName);
    const [dayAxis, setDayAxis] = useState<GridWeek | null>(null);
    const calendarContentRef = useRef<HTMLDivElement>(null);

    // Drag and drop state
    const [draggedEvent, setDraggedEvent] = useState<Event | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Copy/paste state
    const [copiedDayEvents, setCopiedDayEvents] = useState<Event[] | null>(null);
    const [copiedDayName, setCopiedDayName] = useState<string | null>(null);

    // Stats display state
    const [showStats, setShowStats] = useState(true);

    // Modal state (unified for both create and edit)
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalInitialDate, setModalInitialDate] = useState<Date | undefined>();
    const [modalInitialTime, setModalInitialTime] = useState<string | undefined>();
    const [editingEvent, setEditingEvent] = useState<Event | null>(null);

    // Event handlers
    const handleEventClick = (event: Event) => {
        console.log('Event clicked:', event);
    };

    const handleEventDoubleClick = (event: Event) => {
        setEditingEvent(event);
        setModalInitialDate(undefined);
        setModalInitialTime(undefined);
        setIsModalOpen(true);
    };

    const handleDayClick = (dayName: string, event: React.MouseEvent) => {
        if (isDragging) return;

        const dayElement = event.currentTarget;
        const rect = dayElement.getBoundingClientRect();
        const clickY = event.clientY - rect.top;

        const totalMinutesFromStart = (clickY / timeSlotHeight) * 60;
        const hoursFromStart = Math.floor(totalMinutesFromStart / 60);
        const minutesInHour = Math.floor((totalMinutesFromStart % 60) / 15) * 15;

        const clickedHour = Math.max(6, Math.min(23, 6 + hoursFromStart));
        const clickedMinutes = Math.min(45, minutesInHour);

        // For routine events, we use a template date (Monday of 1970 as base)
        const dayIndex = days.indexOf(dayName);
        const baseDate = new Date(1970, 0, 5); // Jan 5, 1970 was a Monday
        const clickedDate = new Date(baseDate);
        clickedDate.setDate(baseDate.getDate() + dayIndex);

        setEditingEvent(null);
        setModalInitialDate(clickedDate);
        setModalInitialTime(`${clickedHour.toString().padStart(2, '0')}:${clickedMinutes.toString().padStart(2, '0')}`);
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
                    owner: owner,
                    name: routineName
                });

                setEvents(prevEvents =>
                    prevEvents.map(e =>
                        e.id === event.id
                            ? {
                                ...e,
                                datetime_start: startTimeServer,
                                datetime_end: endTimeServer
                            }
                            : e
                    )
                );
            }
        } catch (error) {
            console.error('Error updating routine event:', error);
        }

        setIsDragging(false);
        setDraggedEvent(null);
    };

    const handleDragStart = (event: Event, _position: { top: number; height: number }) => {
        setDraggedEvent(event);
        setIsDragging(true);
    };

    const handleEventCreated = async (newEvent: Event) => {
        try {
            // Override with routine-specific properties
            const routineEvent = await recipeAPI.createEvent({
                ...newEvent,
                template: true,
                owner: owner,
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
            // Ensure template properties are maintained
            const routineEvent = await recipeAPI.updateEvent(updatedEvent.id!, {
                ...updatedEvent,
                template: true,
                owner: owner,
                name: routineName
            });
            setEvents(prevEvents =>
                prevEvents.map(e =>
                    e.id === routineEvent.id ? routineEvent : e
                )
            );
            setIsModalOpen(false);
            setEditingEvent(null);
        } catch (error) {
            console.error('Error updating routine event:', error);
        }
    };

    const handleEventDeleted = (eventId: number) => {
        setEvents(prevEvents =>
            prevEvents.filter(e => e.id !== eventId)
        );
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

    // Filter events for a specific day (Monday=0, Sunday=6)
    const getEventsForDay = (dayName: string): Event[] => {
        const dayIndex = days.indexOf(dayName);
        if (dayIndex === -1) return [];

        return events.filter(event => {
            const eventDate = fromDateServer(event.datetime_start);
            // Day of week: 0=Sunday, 1=Monday, etc. We need to convert to 0=Monday
            const eventDayOfWeek = (eventDate.getDay() + 6) % 7;
            return eventDayOfWeek === dayIndex;
        });
    };

    useEffect(() => {
        const newDayAxis = new GridWeek(6, 23, totalCalendarHeight, timeSlotHeight, weekWidth);
        setDayAxis(newDayAxis);
    }, [totalCalendarHeight, timeSlotHeight, weekWidth]);

    useEffect(() => {
        fetchRoutineEvents();
    }, [owner, routineName]);

    // Compute statistics about the routine week
    const computeWeekStats = () => {
        const statsByName: {
            [key: string]: {
                count: number;
                totalMinutes: number;
                color?: string;
                durations: number[];
            }
        } = {};

        events.forEach(event => {
            const eventStart = fromDateServer(event.datetime_start);
            const eventEnd = fromDateServer(event.datetime_end);
            const durationMs = eventEnd.getTime() - eventStart.getTime();
            const durationMinutes = durationMs / (1000 * 60);

            const eventName = event.title || 'Unnamed';

            if (!statsByName[eventName]) {
                statsByName[eventName] = {
                    count: 0,
                    totalMinutes: 0,
                    color: event.color,
                    durations: []
                };
            }

            statsByName[eventName].count += 1;
            statsByName[eventName].totalMinutes += durationMinutes;
            statsByName[eventName].durations.push(durationMinutes);
        });

        // Convert to array and sort by total time (descending)
        return Object.entries(statsByName)
            .map(([name, stats]) => {
                // Calculate fragmentation metrics for this event type
                const avgBlockDuration = stats.totalMinutes / stats.count;
                const longestBlock = Math.max(...stats.durations);
                const fragmentationIndex = stats.count / Math.max(stats.totalMinutes / 60, 0.1);

                return {
                    name,
                    count: stats.count,
                    totalMinutes: stats.totalMinutes,
                    totalHours: stats.totalMinutes / 60,
                    color: stats.color,
                    avgBlockDuration,
                    avgBlockDurationHours: avgBlockDuration / 60,
                    longestBlock,
                    longestBlockHours: longestBlock / 60,
                    fragmentationIndex
                };
            })
            .sort((a, b) => b.totalMinutes - a.totalMinutes);
    };

    const weekStats = computeWeekStats();
    const totalWeekMinutes = weekStats.reduce((sum, stat) => sum + stat.totalMinutes, 0);
    const totalWeekHours = totalWeekMinutes / 60;

    // Calculate unaccounted time (24 hours per day * 7 days = 168 hours total)
    const hoursPerDay = 24;
    const totalDayHours = hoursPerDay * 7; // 168 hours per week
    const totalDayMinutes = totalDayHours * 60;
    const unaccountedMinutes = totalDayMinutes - totalWeekMinutes;
    const unaccountedHours = unaccountedMinutes / 60;

    // Copy all events from a specific day
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

    // Paste copied events to a specific day
    const handlePasteDay = async (targetDayName: string) => {
        if (!copiedDayEvents || copiedDayEvents.length === 0) {
            alert('No events copied. Copy a day first.');
            return;
        }

        const sourceDayIndex = days.indexOf(copiedDayName || '');
        const targetDayIndex = days.indexOf(targetDayName);

        if (sourceDayIndex === -1 || targetDayIndex === -1) {
            alert('Invalid day selection');
            return;
        }

        try {
            // Calculate day offset
            const dayOffset = targetDayIndex - sourceDayIndex;

            // Create new events for the target day
            const pastePromises = copiedDayEvents.map(async (event) => {
                const eventStart = fromDateServer(event.datetime_start);
                const eventEnd = fromDateServer(event.datetime_end);

                // Create new date with the day offset
                const newStart = new Date(eventStart);
                newStart.setDate(eventStart.getDate() + dayOffset);

                const newEnd = new Date(eventEnd);
                newEnd.setDate(eventEnd.getDate() + dayOffset);

                const newEvent = {
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
                    owner: owner,
                    name: routineName
                };

                return recipeAPI.createEvent(newEvent);
            });

            const createdEvents = await Promise.all(pastePromises);

            // Add the new events to the state
            setEvents(prevEvents => [...prevEvents, ...createdEvents]);

            alert(`Pasted ${createdEvents.length} event(s) to ${targetDayName}`);
        } catch (error) {
            console.error('Error pasting events:', error);
            alert('Failed to paste events');
        }
    };

    return (
        <Box
            className="cls-routine"
            h="100%"
            w="100%"
        >
            {/* Header with Owner and Routine Name */}
            <Box mb={4} p={4} bg="bg" borderRadius="md" boxShadow="sm">
                <VStack gap={4} align="stretch">
                    <HStack justify="space-between" align="center">
                        <Heading size="lg">Routine Template</Heading>
                        {copiedDayName && copiedDayEvents && (
                            <Box
                                px={3}
                                py={1}
                                bg="bg"
                                borderRadius="md"
                                border="1px solid"
                                borderColor="blue.300"
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
                            <Input
                                value={owner}
                                onChange={(e) => setOwner(e.target.value)}
                                placeholder="Enter owner name"
                            />
                        </HStack>
                        <HStack flex="1">
                            <Text mb={2} fontWeight="medium">Routine Name</Text>
                            <select
                                value={routineName}
                                onChange={(e) => setRoutineName(e.target.value)}
                                style={{
                                    padding: '8px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--chakra-colors-border)',
                                    width: '100%',
                                    backgroundColor: 'var(--chakra-colors-bg)'
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
                            <Button colorScheme="blue" onClick={fetchRoutineEvents}>
                                Load Routine
                            </Button>
                        </Box>
                    </HStack>

                    {/* Statistics Section */}
                    {events.length > 0 && (
                        <Box>
                            <HStack justify="space-between" align="center" mb={2}>
                                <Text fontWeight="bold" fontSize="md">
                                    Weekly Statistics
                                </Text>
                                <Button
                                    size="xs"
                                    variant="ghost"
                                    onClick={() => setShowStats(!showStats)}
                                >
                                    {showStats ? '▼ Hide' : '▶ Show'}
                                </Button>
                            </HStack>

                            {showStats && (
                                <Box
                                    border="1px solid"
                                    borderColor="gray.200"
                                    borderRadius="md"
                                    overflow="hidden"
                                >
                                    <Box overflowX="auto">
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: 'var(--chakra-colors-bg)' }}>
                                                    <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid var(--chakra-colors-border)', fontSize: '0.875rem', fontWeight: 600 }}>
                                                        Event
                                                    </th>
                                                    <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--chakra-colors-border)', fontSize: '0.875rem', fontWeight: 600 }}>
                                                        Total Time
                                                    </th>
                                                    <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--chakra-colors-border)', fontSize: '0.875rem', fontWeight: 600 }}>
                                                        Daily Avg
                                                    </th>
                                                    <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--chakra-colors-border)', fontSize: '0.875rem', fontWeight: 600 }}>
                                                        Avg Block
                                                    </th>
                                                    <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--chakra-colors-border)', fontSize: '0.875rem', fontWeight: 600 }}>
                                                        Longest
                                                    </th>
                                                    <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--chakra-colors-border)', fontSize: '0.875rem', fontWeight: 600 }}>
                                                        Frag
                                                    </th>
                                                    <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--chakra-colors-border)', fontSize: '0.875rem', fontWeight: 600 }}>
                                                        %
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {weekStats.map((stat, index) => {
                                                    const percentage = totalWeekMinutes > 0
                                                        ? (stat.totalMinutes / totalWeekMinutes * 100).toFixed(1)
                                                        : 0;
                                                    const dailyAvgMinutes = stat.totalMinutes / 7;
                                                    const dailyAvgHours = dailyAvgMinutes / 60;
                                                    return (
                                                        <tr key={index} style={{ borderBottom: '1px solid var(--chakra-colors-border)' }}>
                                                            <td style={{ padding: '8px' }}>
                                                                <HStack gap={2}>
                                                                    <Box
                                                                        width="12px"
                                                                        height="12px"
                                                                        bg={stat.color || 'gray.400'}
                                                                        borderRadius="sm"
                                                                    />
                                                                    <Text fontSize="sm">{stat.name}</Text>
                                                                </HStack>
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'right' }}>
                                                                <Text fontSize="sm" fontWeight="medium">
                                                                    {stat.totalHours >= 1
                                                                        ? `${stat.totalHours.toFixed(1)}h`
                                                                        : `${stat.totalMinutes.toFixed(0)}m`
                                                                    }
                                                                </Text>
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'right' }}>
                                                                <Text fontSize="sm" color="gray.600">
                                                                    {dailyAvgHours >= 1
                                                                        ? `${dailyAvgHours.toFixed(1)}h`
                                                                        : `${dailyAvgMinutes.toFixed(0)}m`
                                                                    }
                                                                </Text>
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'right' }}>
                                                                <Text fontSize="sm" color="gray.600">
                                                                    {stat.avgBlockDurationHours >= 1
                                                                        ? `${stat.avgBlockDurationHours.toFixed(1)}h`
                                                                        : `${stat.avgBlockDuration.toFixed(0)}m`
                                                                    }
                                                                </Text>
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'right' }}>
                                                                <Text fontSize="sm" color="gray.600">
                                                                    {stat.longestBlockHours >= 1
                                                                        ? `${stat.longestBlockHours.toFixed(1)}h`
                                                                        : `${stat.longestBlock.toFixed(0)}m`
                                                                    }
                                                                </Text>
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'right' }}>
                                                                <Text fontSize="sm" color="gray.600">
                                                                    {stat.fragmentationIndex.toFixed(2)}
                                                                </Text>
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'right' }}>
                                                                <Text fontSize="sm" color="gray.600">
                                                                    {percentage}%
                                                                </Text>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot>
                                                <tr style={{ backgroundColor: 'var(--chakra-colors-bg)', fontWeight: 'bold' }}>
                                                    <td style={{ padding: '8px' }}>
                                                        <Text fontSize="sm" fontWeight="bold">Total Scheduled</Text>
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                                        <Text fontSize="sm" fontWeight="bold">
                                                            {totalWeekHours >= 1
                                                                ? `${totalWeekHours.toFixed(1)}h`
                                                                : `${totalWeekMinutes.toFixed(0)}m`
                                                            }
                                                        </Text>
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                                        <Text fontSize="sm" fontWeight="bold">
                                                            {(totalWeekHours / 7) >= 1
                                                                ? `${(totalWeekHours / 7).toFixed(1)}h`
                                                                : `${(totalWeekMinutes / 7).toFixed(0)}m`
                                                            }
                                                        </Text>
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                                        <Text fontSize="sm" fontWeight="bold">-</Text>
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                                        <Text fontSize="sm" fontWeight="bold">-</Text>
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                                        <Text fontSize="sm" fontWeight="bold">-</Text>
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                                        <Text fontSize="sm" fontWeight="bold">100%</Text>
                                                    </td>
                                                </tr>
                                                {/* Unaccounted Time Row */}
                                                <tr style={{ backgroundColor: 'var(--chakra-colors-bg)' }}>
                                                    <td style={{ padding: '8px' }}>
                                                        <HStack gap={2}>
                                                            <Box
                                                                width="12px"
                                                                height="12px"
                                                                bg="gray.300"
                                                                borderRadius="sm"
                                                            />
                                                            <Text fontSize="sm" fontStyle="italic" color="gray.600">Unaccounted Time</Text>
                                                        </HStack>
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                                        <Text fontSize="sm" color="gray.600">
                                                            {unaccountedHours >= 1
                                                                ? `${unaccountedHours.toFixed(1)}h`
                                                                : `${Math.max(0, unaccountedMinutes).toFixed(0)}m`
                                                            }
                                                        </Text>
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                                        <Text fontSize="sm" color="gray.600">
                                                            {(unaccountedHours / 7) >= 1
                                                                ? `${(unaccountedHours / 7).toFixed(1)}h`
                                                                : `${Math.max(0, unaccountedMinutes / 7).toFixed(0)}m`
                                                            }
                                                        </Text>
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                                        <Text fontSize="sm" color="gray.600">-</Text>
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                                        <Text fontSize="sm" color="gray.600">-</Text>
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                                        <Text fontSize="sm" color="gray.600">-</Text>
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                                        <Text fontSize="sm" color="gray.600">
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

            <HStack ref={containerRef} h="100%" w="100%" maxH="100%" maxW="100%">
                <Grid
                    templateColumns="80px repeat(7, 1fr)"
                    templateRows="50px 1fr"
                    gap={0.5}
                    borderColor="gray.300"
                    borderRadius="md"
                    bg="bg"
                    className="class-grid"
                    flex="1"
                    width="100%"
                    height="100%"
                >
                    <GridItem
                        border="1px solid"
                        borderColor="gray.200"
                        bg="bg"
                    />

                    {/* Day headers - just day names, no dates */}
                    {days.map((day) => {
                        const eventsCount = getEventsForDay(day).length;
                        const isCopiedDay = copiedDayName === day;
                        return (
                            <GridItem
                                key={day}
                                border="1px solid"
                                borderColor={isCopiedDay ? "blue.400" : "gray.200"}
                                bg={isCopiedDay ? "bg" : "bg"}
                                _dark={{ bg: isCopiedDay ? "blue.900" : "bg" }}
                                display="flex"
                                alignItems="center"
                                justifyContent="center"
                                fontWeight="bold"
                                fontSize="sm"
                                flexDirection="column"
                                py={2}
                                gap={1}
                            >
                                <HStack gap={1}>
                                    <Text>{day}</Text>
                                    <HStack>
                                        <Button
                                            size="xs"
                                            variant="ghost"
                                            colorScheme="blue"
                                            onClick={() => handleCopyDay(day)}
                                            title={`Copy ${day} (${eventsCount} events)`}
                                            disabled={eventsCount === 0}
                                        >
                                            📋
                                        </Button>
                                        <Button
                                            size="xs"
                                            variant="ghost"
                                            colorScheme="green"
                                            onClick={() => handlePasteDay(day)}
                                            title={`Paste to ${day}`}
                                            disabled={!copiedDayEvents || copiedDayEvents.length === 0}
                                        >
                                            📌
                                        </Button>
                                    </HStack>
                                </HStack>
                            </GridItem>
                        );
                    })}

                    {/* Time labels column */}
                    <GridItem
                        borderTop="1px solid"
                        borderLeft="1px solid"
                        borderRight="1px solid"
                        borderColor="gray.200"
                        bg="bg"
                        display="flex"
                        flexDirection="column"
                        height={`${timeSlotHeight * hours.length}px`}
                    >
                        {hours.map((hour) => (
                            <Box
                                key={hour}
                                height={`${timeSlotHeight}px`}
                                display="flex"
                                alignItems="center"
                                justifyContent="center"
                                borderBottom="1px solid"
                                borderColor="gray.200"
                                fontSize="sm"
                                fontWeight="medium"
                            >
                                <Text>{hour}:00</Text>
                            </Box>
                        ))}
                    </GridItem>

                    {/* Content area spanning all 7 days */}
                    <GridItem
                        colSpan={7}
                        bg="bg"
                        _hover={{
                            bg: "gray.200",
                            _dark: { bg: "gray.700" }
                        }}
                        position="relative"
                        display="flex"
                        flexDirection="column"
                        id="calendar-content"
                        ref={calendarContentRef}
                        flex="1"
                        minH="0"
                        height={`${timeSlotHeight * hours.length}px`}
                    >
                        {/* Mock event for drag preview */}
                        <Box
                            data-mock-event="true"
                            position="absolute"
                            top="0px"
                            left="0"
                            width="100%"
                            height="30px"
                            bg={draggedEvent?.color || "blue.500"}
                            color="white"
                            p={2}
                            py={1}
                            borderRadius="md"
                            fontSize="sm"
                            fontWeight="bold"
                            zIndex={1000}
                            boxShadow="lg"
                            border="1px solid"
                            borderColor="blue.600"
                            display="none"
                            opacity={0.8}
                            userSelect="none"
                            pointerEvents="none"
                            style={{
                                display: isDragging && draggedEvent ? 'flex' : 'none'
                            }}
                        >
                            {draggedEvent && (
                                <>
                                    <Text fontWeight="bold" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                                        {draggedEvent.title}
                                    </Text>
                                    {draggedEvent.description && (
                                        <Text overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" fontSize="xs" opacity={0.9}>
                                            {draggedEvent.description}
                                        </Text>
                                    )}
                                </>
                            )}
                        </Box>

                        {/* Day columns */}
                        <Grid
                            templateColumns="repeat(7, 1fr)"
                            gap={0.5}
                            flex="1"
                            minH="0"
                        >
                            {days.map((day) => (
                                <GridItem
                                    key={day}
                                    borderTop="1px solid"
                                    borderLeft="1px solid"
                                    borderRight="1px solid"
                                    borderColor="gray.200"
                                    bg="bg"
                                    _hover={{
                                        bg: "gray.200",
                                        _dark: { bg: "gray.700" }
                                    }}
                                    minH="200px"
                                    id={`routine-${day}`}
                                    position="relative"
                                    height="100%"
                                    cursor="pointer"
                                    onClick={(e) => handleDayClick(day, e)}
                                >
                                    {hours.map((hour) => (
                                        <Box
                                            key={hour}
                                            height={`${timeSlotHeight}px`}
                                            display="flex"
                                            alignItems="center"
                                            justifyContent="center"
                                            borderBottom="1px solid"
                                            borderColor="gray.200"
                                            fontSize="sm"
                                            fontWeight="medium"
                                        >
                                        </Box>
                                    ))}

                                    {/* Render events for this day */}
                                    {dayAxis && getEventsForDay(day).map((event) => {
                                        const position = dayAxis.getEventPosition(event);
                                        const dayIdx = days.indexOf(day);
                                        return (
                                            <RoutineEvent
                                                key={event.id}
                                                event={event}
                                                position={position}
                                                onClick={handleEventClick}
                                                onDoubleClick={handleEventDoubleClick}
                                                onTimeChange={handleEventTimeChange}
                                                timeSlotHeight={timeSlotHeight}
                                                snapInterval={dayAxis.getSnapInterval()}
                                                gridWeek={dayAxis}
                                                dayIndex={dayIdx}
                                                isDragging={isDragging && draggedEvent?.id === event.id}
                                                onDragStart={handleDragStart}
                                            />
                                        );
                                    })}
                                </GridItem>
                            ))}
                        </Grid>
                    </GridItem>
                </Grid>

                {/* Event Modal */}
                <EventModal
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false);
                        setEditingEvent(null);
                        setModalInitialDate(undefined);
                        setModalInitialTime(undefined);
                    }}
                    event={editingEvent}
                    initialDate={modalInitialDate}
                    initialTime={modalInitialTime}
                    onEventCreated={handleEventCreated}
                    onEventUpdated={handleEventUpdated}
                    onEventDeleted={handleEventDeleted}
                />
            </HStack>
        </Box>
    );
};

export default Routine;

