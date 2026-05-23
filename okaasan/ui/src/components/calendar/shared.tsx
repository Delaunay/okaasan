import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Grid,
    GridItem,
    Text,
    HStack,
} from '@chakra-ui/react';
import type { Event } from '../../services/type';
import { fromDateServer } from '../../utils/dateUtils';
import EventModal from '../common/EventModal';

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

// ── Sizing hook ──────────────────────────────────────────────────────────────

export const useCalendarSizing = () => {
    const [timeSlotHeight, setTimeSlotHeight] = useState(33);
    const [totalCalendarHeight, setTotalCalendarHeight] = useState(600);
    const [weekWidth, setWeekWidth] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const lastWidthRef = useRef(0);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;

        const calculateSizing = () => {
            const rect = element.getBoundingClientRect();
            const containerWidth = rect.width;

            const availableHeight = window.innerHeight - rect.top;
            const headerHeight = 50 + 10;
            const padding = 32;
            const usable = availableHeight - headerHeight - padding;

            const hoursCount = 18;
            const calculatedHeight = usable / hoursCount;

            const minSlotHeight = 5;
            const maxSlotHeight = 8000;
            const optimalHeight = Math.max(minSlotHeight, Math.min(maxSlotHeight, calculatedHeight));

            setTimeSlotHeight(optimalHeight);
            setTotalCalendarHeight(optimalHeight * hoursCount);
            setWeekWidth(containerWidth);
            lastWidthRef.current = containerWidth;
        };

        calculateSizing();

        const resizeObserver = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            const newWidth = entry.contentRect.width;
            if (Math.abs(newWidth - lastWidthRef.current) > 1) {
                calculateSizing();
            }
        });
        resizeObserver.observe(element);

        window.addEventListener('resize', calculateSizing);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', calculateSizing);
        };
    }, []);

    return { containerRef, timeSlotHeight, totalCalendarHeight, weekWidth };
};

// ── GridWeek ─────────────────────────────────────────────────────────────────

export class GridWeek {
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

        const clampedStartMinutes = Math.max(dayStartMinutes, Math.min(dayEndMinutes, startMinutes));
        const clampedEndMinutes = Math.max(dayStartMinutes, Math.min(dayEndMinutes, endMinutes));

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
        const dayIndex = Math.trunc(x / dayWidth);
        return Math.max(0, Math.min(6, dayIndex));
    }

    getSnapInterval(): number {
        return this.timeSlotHeight / 12;
    }

    getWeekWidth(): number {
        return this.weekWidth;
    }
}

// ── DragOperation ────────────────────────────────────────────────────────────

export type DateResolver = (dayIndex: number) => Date;

export class DragOperation {
    dragOperationVisual: HTMLDivElement;
    grid: GridWeek;
    originalEvent: HTMLDivElement;

    private originalEventData: Event;
    private originalPosition: { top: number; height: number; dayIndex: number };
    private isDragging: boolean = false;
    private timeSlotHeight: number;
    private onTimeChange?: (event: Event, newStartTime: Date, newEndTime: Date) => void;
    private mouseOffset: { x: number; y: number } = { x: 0, y: 0 };
    private resolveDateForDay: DateResolver;

    constructor(
        dragOperationVisual: HTMLDivElement,
        grid: GridWeek,
        originalEvent: HTMLDivElement,
        eventData: Event,
        position: { top: number; height: number; dayIndex: number },
        timeSlotHeight: number,
        initialMousePos: { x: number; y: number },
        containerRect: DOMRect,
        onTimeChange: ((event: Event, newStartTime: Date, newEndTime: Date) => void) | undefined,
        resolveDateForDay: DateResolver,
    ) {
        this.dragOperationVisual = dragOperationVisual;
        this.grid = grid;
        this.originalEvent = originalEvent;
        this.originalEventData = eventData;
        this.originalPosition = position;
        this.timeSlotHeight = timeSlotHeight;
        this.onTimeChange = onTimeChange;
        this.resolveDateForDay = resolveDateForDay;

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

        return { top: finalTop, dayIndex: finalDayIndex, event: this.originalEventData };
    }

    cancel() {
        this.isDragging = false;
        this.originalEvent.style.visibility = 'visible';
        this.dragOperationVisual.style.display = 'none';
    }

    getIsDragging(): boolean {
        return this.isDragging;
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

        return { time: timeString + dayString, dayIndex };
    }

    private updateEventTime(top: number, dayIndex: number) {
        if (!this.onTimeChange) return;

        const newHour = Math.floor(top / this.timeSlotHeight) + 6;
        const newMinutes = Math.floor((top % this.timeSlotHeight) / this.timeSlotHeight * 60);
        const snappedMinutes = Math.round(newMinutes / 5) * 5;

        const originalStart = fromDateServer(this.originalEventData.datetime_start);
        const originalEnd = fromDateServer(this.originalEventData.datetime_end);
        const durationMs = originalEnd.getTime() - originalStart.getTime();

        const targetDate = this.resolveDateForDay(dayIndex);
        const newStartTime = new Date(targetDate);
        newStartTime.setHours(newHour, snappedMinutes, 0, 0);
        const newEndTime = new Date(newStartTime.getTime() + durationMs);

        this.onTimeChange(this.originalEventData, newStartTime, newEndTime);
    }
}

// ── CursorBadge ──────────────────────────────────────────────────────────────

export const CursorBadge: React.FC<{
    time: string;
    isVisible: boolean;
    position: { x: number; y: number };
}> = ({ time, isVisible, position }) => {
    if (!isVisible) return null;

    return (
        <Box
            position="fixed"
            left={`${position.x + 10}px`}
            top={`${position.y - 40}px`}
            bg="var(--card-bg)"
            color="var(--heading-color)"
            px={2}
            py={1}
            borderRadius="md"
            fontSize="sm"
            fontWeight="bold"
            zIndex={10000}
            pointerEvents="none"
            border="1px solid"
            borderColor="var(--border-color)"
        >
            {time}
        </Box>
    );
};

// ── GridEvent (shared event component) ───────────────────────────────────────

interface GridEventProps {
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
    isDragging?: boolean;
    draggedEventData?: Event | null;
    resolveDateForDay: DateResolver;
}

export const GridEvent: React.FC<GridEventProps> = ({
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
    isDragging,
    resolveDateForDay,
}) => {
    const [isDraggingState, setIsDraggingState] = useState(false);
    const dragOperationRef = useRef<DragOperation | null>(null);
    const eventRef = useRef<HTMLDivElement>(null);
    const [currentTime, setCurrentTime] = useState("");
    const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
    const [dragTimeout, setDragTimeout] = useState<NodeJS.Timeout | null>(null);

    const shouldHide = isDragging;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onClick?.(event);
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (dragTimeout) {
            clearTimeout(dragTimeout);
            setDragTimeout(null);
        }
        onDoubleClick?.(event);
    };

    const handleEventMouseUp = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (dragTimeout) {
            clearTimeout(dragTimeout);
            setDragTimeout(null);
        }
    };

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
            resolveDateForDay,
        );

        dragOperationRef.current.onDragStart();
        setIsDraggingState(true);
        onDragStart?.(event, position);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDraggingState || !dragOperationRef.current) return;
        setCursorPosition({ x: e.clientX, y: e.clientY });

        const calendarContainer = document.querySelector('.class-grid') as HTMLElement;
        if (!calendarContainer) return;

        const containerRect = calendarContainer.getBoundingClientRect();
        const result = dragOperationRef.current.onDragMove(e.clientX, e.clientY, containerRect);
        if (result) setCurrentTime(result.time);
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
                border="1px solid"
                borderColor={event.color || "blue.600"}
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
                style={{ visibility: shouldHide ? 'hidden' : 'visible' }}
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

            <CursorBadge time={currentTime} isVisible={isDraggingState} position={cursorPosition} />
        </>
    );
};

// ── WeeklyGrid (the main shared component) ───────────────────────────────────

export interface WeeklyGridProps {
    events: Event[];
    getEventsForDay: (dayName: string) => Event[];
    resolveDateForDay: DateResolver;
    onTimeSlotClick: (dayName: string, dayIndex: number, hour: number, minutes: number) => void;
    onEventClick?: (event: Event) => void;
    onEventDoubleClick: (event: Event) => void;
    onEventTimeChange: (event: Event, newStartTime: Date, newEndTime: Date) => void;
    onEventCreated: (event: Event) => void;
    onEventUpdated: (event: Event) => void;
    onEventDeleted: (eventId: number) => void;
    renderDayHeader: (day: string, dayIndex: number) => React.ReactNode;
    getDayBg?: (dayIndex: number) => { bg?: string; _dark?: { bg?: string } } | undefined;
    className?: string;

    isModalOpen: boolean;
    editingEvent: Event | null;
    modalInitialDate?: Date;
    modalInitialTime?: string;
    onModalClose: () => void;
}

export const WeeklyGrid: React.FC<WeeklyGridProps> = ({
    getEventsForDay,
    resolveDateForDay,
    onTimeSlotClick,
    onEventClick,
    onEventDoubleClick,
    onEventTimeChange,
    onEventCreated,
    onEventUpdated,
    onEventDeleted,
    renderDayHeader,
    getDayBg,
    className,
    isModalOpen,
    editingEvent,
    modalInitialDate,
    modalInitialTime,
    onModalClose,
}) => {
    const { containerRef, timeSlotHeight, totalCalendarHeight, weekWidth } = useCalendarSizing();

    const [dayAxis, setDayAxis] = useState<GridWeek | null>(null);
    const calendarContentRef = useRef<HTMLDivElement>(null);

    const [draggedEvent, setDraggedEvent] = useState<Event | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleDragStart = (event: Event, _position: { top: number; height: number }) => {
        setDraggedEvent(event);
        setIsDragging(true);
    };

    const handleEventTimeChangeWrapper = async (event: Event, newStartTime: Date, newEndTime: Date) => {
        await onEventTimeChange(event, newStartTime, newEndTime);
        setIsDragging(false);
        setDraggedEvent(null);
    };

    const handleDayClick = (day: string, dayIndex: number, e: React.MouseEvent) => {
        if (isDragging) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const clickY = e.clientY - rect.top;

        const totalMinutesFromStart = (clickY / timeSlotHeight) * 60;
        const hoursFromStart = Math.floor(totalMinutesFromStart / 60);
        const minutesInHour = Math.floor((totalMinutesFromStart % 60) / 15) * 15;

        const hour = Math.max(6, Math.min(23, 6 + hoursFromStart));
        const minutes = Math.min(45, minutesInHour);

        onTimeSlotClick(day, dayIndex, hour, minutes);
    };

    useEffect(() => {
        setDayAxis(new GridWeek(6, 23, totalCalendarHeight, timeSlotHeight, weekWidth));
    }, [totalCalendarHeight, timeSlotHeight, weekWidth]);

    return (
        <HStack ref={containerRef} h="100%" w="100%" maxH="100%" maxW="100%" overflow="hidden">
            <Grid
                templateColumns="80px repeat(7, 1fr)"
                templateRows="50px 1fr"
                gap={0.5}
                borderColor="var(--border-color)"
                borderRadius="md"
                bg="bg"
                className={`class-grid ${className || ''}`}
                flex="1"
                width="100%"
                height="100%"
            >
                {/* Empty top-left corner */}
                <GridItem border="1px solid" borderColor="var(--border-color)" bg="bg" />

                {/* Day headers (custom per page) */}
                {DAYS.map((day, index) => (
                    <GridItem
                        key={day}
                        border="1px solid"
                        borderColor="gray.200"
                        bg="bg"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        fontWeight="bold"
                        fontSize="sm"
                        flexDirection="column"
                        py={2}
                    >
                        {renderDayHeader(day, index)}
                    </GridItem>
                ))}

                {/* Time labels */}
                <GridItem
                    borderTop="1px solid"
                    borderLeft="1px solid"
                    borderRight="1px solid"
                    borderColor="var(--border-color)"
                    bg="bg"
                    display="flex"
                    flexDirection="column"
                    height={`${timeSlotHeight * HOURS.length}px`}
                >
                    {HOURS.map((hour) => (
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
                    position="relative"
                    display="flex"
                    flexDirection="column"
                    ref={calendarContentRef}
                    flex="1"
                    minH="0"
                    height={`${timeSlotHeight * HOURS.length}px`}
                >
                    {/* Mock drag preview */}
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
                        border="1px solid"
                        borderColor={draggedEvent?.color || "blue.600"}
                        display="none"
                        opacity={0.8}
                        userSelect="none"
                        pointerEvents="none"
                        style={{ display: isDragging && draggedEvent ? 'flex' : 'none' }}
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
                    <Grid templateColumns="repeat(7, 1fr)" gap={0.5} flex="1" minH="0">
                        {DAYS.map((day, dayIndex) => {
                            const dayBg = getDayBg?.(dayIndex);
                            return (
                                <GridItem
                                    key={day}
                                    borderTop="1px solid"
                                    borderLeft="1px solid"
                                    borderRight="1px solid"
                                    borderColor="gray.200"
                                    bg={dayBg?.bg || "bg"}
                                    _dark={dayBg?._dark || {}}
                                    _hover={{ bg: "gray.200", _dark: { bg: "gray.700" } }}
                                    minH="200px"
                                    position="relative"
                                    height="100%"
                                    cursor="pointer"
                                    onClick={(e) => handleDayClick(day, dayIndex, e)}
                                >
                                    {HOURS.map((hour) => (
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
                                        />
                                    ))}

                                    {dayAxis && getEventsForDay(day).map((event) => {
                                        const position = dayAxis.getEventPosition(event);
                                        return (
                                            <GridEvent
                                                key={event.id}
                                                event={event}
                                                position={position}
                                                onClick={onEventClick}
                                                onDoubleClick={onEventDoubleClick}
                                                onTimeChange={handleEventTimeChangeWrapper}
                                                timeSlotHeight={timeSlotHeight}
                                                snapInterval={dayAxis.getSnapInterval()}
                                                gridWeek={dayAxis}
                                                dayIndex={dayIndex}
                                                isDragging={isDragging && draggedEvent?.id === event.id}
                                                onDragStart={handleDragStart}
                                                resolveDateForDay={resolveDateForDay}
                                            />
                                        );
                                    })}
                                </GridItem>
                            );
                        })}
                    </Grid>
                </GridItem>
            </Grid>

            <EventModal
                isOpen={isModalOpen}
                onClose={onModalClose}
                event={editingEvent}
                initialDate={modalInitialDate}
                initialTime={modalInitialTime}
                onEventCreated={onEventCreated}
                onEventUpdated={onEventUpdated}
                onEventDeleted={onEventDeleted}
            />
        </HStack>
    );
};
