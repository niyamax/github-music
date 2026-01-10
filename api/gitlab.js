export default async function handler(req, res) {
    const { username } = req.query;

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    try {
        const response = await fetch(`https://gitlab.com/users/${username}/calendar.json`);

        if (!response.ok) {
            return res.status(response.status).json({
                error: response.status === 404
                    ? `User "${username}" not found on GitLab`
                    : 'Failed to fetch GitLab data'
            });
        }

        const data = await response.json();

        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch GitLab data' });
    }
}
