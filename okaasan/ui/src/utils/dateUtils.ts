// Date utilities for proper UTC storage with local display conversion
// This follows best practices: store UTC, display local

/**
 * Converts a local Date object to UTC ISO string for server storage
 * The server will store this as a true UTC timestamp
 */
export const toDateServer = (date: Date): string => {
    return date.toISOString(); // Always returns UTC format: "2024-12-16T14:00:00.000Z"
};

/**
 * Converts a UTC ISO string from server to a local Date object
 * This allows proper local time display and manipulation
 */
export const fromDateServer = (serverDateString: string): Date => {
    return new Date(serverDateString); // JavaScript automatically converts to local timezone
};

/**
 * Converts datetime-local input value to UTC for server storage
 * datetime-local represents the user's intended local time
 */
export const datetimeLocalToServer = (datetimeLocal: string): string => {
    // Create a date from the local datetime string
    // Note: new Date(datetimeLocal) treats it as local time
    const localDate = new Date(datetimeLocal);
    return localDate.toISOString(); // Convert to UTC for storage
};

/**
 * Converts UTC server date to datetime-local input format
 * This shows the UTC time converted to user's local timezone
 */
export const serverToDatetimeLocal = (serverDateString: string): string => {
    const date = new Date(serverDateString); // Automatically converts to local

    // Format as YYYY-MM-DDTHH:MM for datetime-local input
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hour}:${minute}`;
};

/**
 * Format date range for API queries in UTC
 * Used for fetching events within a date range
 */
export const formatDateRangeForServer = (date: Date, isEndDate: boolean = false): string => {
    const utcDate = new Date(date);

    if (isEndDate) {
        // Set to end of day in local time, then convert to UTC
        utcDate.setHours(23, 59, 59, 999);
    } else {
        // Set to start of day in local time, then convert to UTC
        utcDate.setHours(0, 0, 0, 0);
    }

    return utcDate.toISOString();
};

/**
 * Get start of week for a given date (Monday)
 * Returns a Date object representing Monday of that week
 */
export const getStartOfWeek = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0); // Start of day
    return monday;
};

/**
 * Get end of week for a given date (Sunday)
 * Returns a Date object representing Sunday of that week
 */
export const getEndOfWeek = (date: Date): Date => {
    const start = getStartOfWeek(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999); // End of day
    return end;
};

/**
 * Format time for display (HH:MM format)
 * Takes a Date object and returns local time string
 */
export const formatTimeDisplay = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
};

/**
 * Format date for display (e.g., "9th August")
 * Takes a Date object and returns formatted date string
 */
export const formatDateDisplay = (date: Date): string => {
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'long' });

    const getOrdinalSuffix = (day: number) => {
        if (day > 3 && day < 21) return 'th';
        switch (day % 10) {
            case 1: return 'st';
            case 2: return 'nd';
            case 3: return 'rd';
            default: return 'th';
        }
    };

    return `${day}${getOrdinalSuffix(day)} ${month}`;
};

/**
 * Check if a date is today in the user's local timezone
 */
export const isToday = (date: Date): boolean => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
};

/**
 * Debug utility to show timezone information
 */
export const getTimezoneInfo = () => {
    const now = new Date();
    return {
        localTime: now.toString(),
        utcTime: now.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        offset: now.getTimezoneOffset() // Minutes difference from UTC
    };
};