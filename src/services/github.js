import axios from 'axios';
import { generateMockData } from '../utils/generateGraph';
import { parseISO, format, isValid, startOfWeek, addDays, subWeeks, isSameDay } from 'date-fns';

const API_BASE = 'https://github-contributions-api.jogruber.de/v4/';

export async function fetchContributions(username) {
    if (!username) return generateMockData();

    try {
        const response = await axios.get(`${API_BASE}${username}`);
        return normalizeData(response.data.contributions);
    } catch (error) {
        console.error("Failed to fetch GitHub data, falling back to mock:", error);
        return generateMockData();
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

    // 3. Generate 52 weeks backwards
    // We want the OLDEST week first (index 0) and CURRENT week last (index 51).
    // So we loop i from 51 down to 0? Or 0 to 51.
    // Let's generate chronological order: Week -51 to Week 0.

    for (let w = 52; w >= 0; w--) {
        // We actually want 53 columns sometimes to fill the screen? Let's stick to 52 for now.
        // If w=0 is THIS week. w=51 is oldest.
        // Let's reverse loop: w=51 (oldest), w=0 (current).
        // Wait, loop from -51 to 0 is easier mentally.
    }

    // Let's just build it:
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
