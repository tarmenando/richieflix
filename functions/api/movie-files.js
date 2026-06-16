// functions/api/movie-files.js

export async function onRequest(context) {
    const url = new URL(context.request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
        return new Response(JSON.stringify({ error: "Missing url parameter" }), {
            status: 400,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }

    try {
        const fullUrl = `https://a.111477.xyz${targetUrl}`;
        const response = await fetch(fullUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch source: ${response.status} ${response.statusText}`);
        }

        const html = await response.text();
        const files = [];

        // Parse rows using Regex
        // Looking for: <tr data-entry="true" data-name="Name" data-url="Url">
        const rowRegex = /<tr data-entry="true" data-name="([^"]+)" data-url="([^"]+)">/g;
        let match;

        while ((match = rowRegex.exec(html)) !== null) {
            const name = match[1];
            const fileUrl = match[2];
            files.push({ name, url: fileUrl });
        }

        return new Response(JSON.stringify(files), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}