import { subDays, format } from 'date-fns';

export function generateMockData() {
    const today = new Date();
    const weeks = [];
    // Generate 52 weeks
    for (let w = 0; w < 52; w++) {
        const days = [];
        for (let d = 0; d < 7; d++) {
            // Simple random intensity 0-4
            // Bias towards 0 for realism
            const rand = Math.random();
            let level = 0;
            if (rand > 0.7) level = 1;
            if (rand > 0.85) level = 2;
            if (rand > 0.95) level = 3;
            if (rand > 0.98) level = 4;

            days.push({
                level,
                date: format(subDays(today, (52 - w) * 7 + (6 - d)), 'yyyy-MM-dd'),
                count: level * 3 // fake count
            });
        }
        weeks.push({ days });
    }
    return { weeks }; // Structure to match API roughly
}
