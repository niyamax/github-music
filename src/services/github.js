import axios from 'axios';
import { generateMockData } from '../utils/generateGraph';
import { parseISO, format, isValid, startOfWeek, addDays, subWeeks, isSameDay } from 'date-fns';

const API_BASE = 'https://github-contributions-api.jogruber.de/v4/';

export async function fetchContributions(username) {
    if (!username) {
        return { data: generateMockData(), error: null, isMock: true };
    }

    try {
        const response = await axios.get(`${API_BASE}${username}`);
        if (!response.data.contributions || response.data.contributions.length === 0) {
            return { data: generateMockData(), error: `No contributions found for "${username}"`, isMock: true };
        }
        return { data: normalizeData(response.data.contributions), error: null, isMock: false };
    } catch (error) {
        const message = error.response?.status === 404
            ? `User "${username}" not found`
            : 'Failed to fetch GitHub data';
        return { data: generateMockData(), error: message, isMock: true };
    }
}

function normalizeData(flatContributions) {
    if (!Array.isArray(flatContributions)) return generateMockData();

    // 1. Create a lookup map for quick access
    const contributionMap = new Map();
    flatContributions.forEach(item => {
        contributionMap.set(item.date, item);
    });

    // 2. Determine the grid anchor (The end of the current week)
    // We want the last column to be "This Week".
    const today = new Date(); // Or use the last date from API if preferred, but Today is safer for "current" context.

    // Align to the start of the current week (e.g., Sunday)
    // weekStartsOn: 0 gives us Sunday.
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 0 });

    const weeks = [];

    // 3. Generate 52 weeks backwards (oldest first, current week last)
    for (let w = 51; w >= 0; w--) {
        const weekStart = subWeeks(currentWeekStart, w);
        const days = [];

        for (let d = 0; d < 7; d++) {
            const dateObj = addDays(weekStart, d);
            const dateStr = format(dateObj, 'yyyy-MM-dd');

            const data = contributionMap.get(dateStr);

            days.push({
                date: dateStr,
                level: data ? data.level : 0,
                count: data ? data.count : 0
            });
        }
        weeks.push({ days });
    }

    return { weeks };
}
