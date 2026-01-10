import axios from 'axios';
import { format, startOfWeek, addDays, subWeeks } from 'date-fns';

const GITHUB_API = 'https://github-contributions-api.jogruber.de/v4/';
const GITLAB_API = '/api/gitlab'; // Vercel serverless proxy

// Generate empty 52-week grid (for users with 0 contributions)
function generateEmptyGrid() {
    const today = new Date();
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 0 });
    const weeks = [];

    for (let w = 51; w >= 0; w--) {
        const weekStart = subWeeks(currentWeekStart, w);
        const days = [];

        for (let d = 0; d < 7; d++) {
            const dateObj = addDays(weekStart, d);
            days.push({
                date: format(dateObj, 'yyyy-MM-dd'),
                level: 0,
                count: 0
            });
        }
        weeks.push({ days });
    }

    return { weeks };
}

// Fetch from GitHub
export async function fetchGitHubContributions(username) {
    if (!username) {
        return { data: null, error: null };
    }

    try {
        const response = await axios.get(`${GITHUB_API}${username}`);
        // User exists but has no contributions - return empty grid
        if (!response.data.contributions || response.data.contributions.length === 0) {
            return { data: generateEmptyGrid(), error: null };
        }
        const normalized = normalizeGitHubData(response.data.contributions);
        if (!normalized) {
            return { data: null, error: 'Failed to parse GitHub data' };
        }
        return { data: normalized, error: null };
    } catch (error) {
        const message = error.response?.status === 404
            ? `User "${username}" not found on GitHub`
            : 'Failed to fetch GitHub data';
        return { data: null, error: message };
    }
}

// Fetch from GitLab (via proxy to avoid CORS)
export async function fetchGitLabContributions(username) {
    if (!username) {
        return { data: null, error: null };
    }

    try {
        const response = await axios.get(`${GITLAB_API}?username=${encodeURIComponent(username)}`);

        // Check if proxy returned an error
        if (response.data && response.data.error) {
            return { data: null, error: response.data.error };
        }

        // User exists but has no contributions - return empty grid
        if (!response.data || Object.keys(response.data).length === 0) {
            return { data: generateEmptyGrid(), error: null };
        }

        // Normalize and return
        const normalized = normalizeGitLabData(response.data);
        if (!normalized) {
            return { data: null, error: 'Failed to parse GitLab data' };
        }
        return { data: normalized, error: null };
    } catch (error) {
        let message = 'Failed to fetch GitLab data';
        if (error.response?.data?.error) {
            message = error.response.data.error;
        } else if (error.response?.status === 404) {
            message = 'API endpoint not found - deploy to Vercel first';
        } else if (error.message) {
            message = error.message;
        }
        return { data: null, error: message };
    }
}

// Unified fetch function
export async function fetchContributions(username, platform = 'github') {
    if (platform === 'gitlab') {
        return fetchGitLabContributions(username);
    }
    return fetchGitHubContributions(username);
}

// Normalize GitHub data (has level included)
function normalizeGitHubData(flatContributions) {
    if (!Array.isArray(flatContributions)) return null;

    const contributionMap = new Map();
    flatContributions.forEach(item => {
        contributionMap.set(item.date, item);
    });

    const today = new Date();
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 0 });
    const weeks = [];

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

// Normalize GitLab data (only has count, need to calculate level)
function normalizeGitLabData(calendarData) {
    if (!calendarData || typeof calendarData !== 'object') return null;

    // GitLab format: { "2024-01-01": 5, "2024-01-02": 3, ... }
    const contributionMap = new Map();

    // Find max for level calculation
    const counts = Object.values(calendarData);
    const maxCount = Math.max(...counts, 1);

    Object.entries(calendarData).forEach(([date, count]) => {
        // Calculate level (0-4) based on count relative to max
        let level = 0;
        if (count > 0) {
            const ratio = count / maxCount;
            if (ratio > 0.75) level = 4;
            else if (ratio > 0.5) level = 3;
            else if (ratio > 0.25) level = 2;
            else level = 1;
        }
        contributionMap.set(date, { count, level });
    });

    const today = new Date();
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 0 });
    const weeks = [];

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
