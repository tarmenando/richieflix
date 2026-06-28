// functions/api/stream.js
// Cloudflare Pages Function proxy for streaming movie files from CDN (bypassing 429 & CORS issues)

const cdnUrlCache = new Map();
const CDN_CACHE_TTL_MS = 4 * 60 * 1000; // 4 minutes

async function resolveCdnUrl(videoPath) {
    const cacheKey = videoPath;
    const now = Date.now();
    const cached = cdnUrlCache.get(cacheKey);
    if (cached && (now - cached.ts) < CDN_CACHE_TTL_MS) {
        return cached.url;
    }

    const sourceUrl = `https://a.111477.xyz${videoPath}`;
    const baseHdrs = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
    };

    // Step 1: a.111477.xyz → 307 → p.111477.xyz/bulk
    const r1 = await fetch(sourceUrl, {
        method: 'HEAD',
        headers: { ...baseHdrs, 'Referer': 'https://a.111477.xyz/' },
        redirect: 'manual'
    });
    let bulkUrl = r1.headers.get('location');
    if (!bulkUrl) return sourceUrl;

    // Step 2: p.111477.xyz/bulk → 302 → workers.dev CDN URL
    const r2 = await fetch(bulkUrl, {
        method: 'HEAD',
        headers: { ...baseHdrs, 'Referer': 'https://a.111477.xyz/' },
        redirect: 'manual'
    });
    let cdnUrl = r2.headers.get('location') || bulkUrl;

    // Step 3 (optional deep hop)
    if (cdnUrl !== bulkUrl) {
        const r3 = await fetch(cdnUrl, {
            method: 'HEAD',
            headers: { ...baseHdrs, 'Referer': 'https://p.111477.xyz/' },
            redirect: 'manual'
        });
        const deepUrl = r3.headers.get('location');
        if (deepUrl) cdnUrl = deepUrl;
    }

    cdnUrlCache.set(cacheKey, { url: cdnUrl, ts: now });
    return cdnUrl;
}

export async function onRequest(context) {
    const url = new URL(context.request.url);
    const videoPath = url.searchParams.get('path');

    if (!videoPath) {
        return new Response('Missing path parameter', { status: 400 });
    }

    const rangeHeader = context.request.headers.get('Range');
    
    // Determine MIME type based on extension
    const ext = videoPath.split('.').pop().toLowerCase();
    let mimeType = 'video/mp4';
    if (ext === 'mkv') mimeType = 'video/x-matroska';
    else if (ext === 'webm') mimeType = 'video/webm';
    else if (ext === 'avi') mimeType = 'video/x-msvideo';
    else if (ext === 'ts') mimeType = 'video/mp2t';

    try {
        let cdnUrl = await resolveCdnUrl(videoPath);

        const fetchHdrs = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Referer':    'https://p.111477.xyz/',
            'Accept':     '*/*',
            'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
        };
        if (rangeHeader) fetchHdrs['Range'] = rangeHeader;

        let upstream = await fetch(cdnUrl, { headers: fetchHdrs });

        // Retry once if expired CDN URL
        if (upstream.status >= 400) {
            cdnUrlCache.delete(videoPath);
            cdnUrl = await resolveCdnUrl(videoPath);
            upstream = await fetch(cdnUrl, { headers: fetchHdrs });
        }

        if (!upstream.ok && upstream.status !== 206) {
            return new Response(`CDN error: ${upstream.status}`, { status: upstream.status });
        }

        // Forward headers to browser
        const responseHeaders = new Headers({
            'Access-Control-Allow-Origin': '*',
            'Accept-Ranges': 'bytes',
            'Content-Type': mimeType
        });

        const headersToForward = ['content-length', 'content-range'];
        headersToForward.forEach(h => {
            const val = upstream.headers.get(h);
            if (val) responseHeaders.set(h, val);
        });

        // Cloudflare Workers streams the response body automatically
        return new Response(upstream.body, {
            status: upstream.status,
            headers: responseHeaders
        });

    } catch (err) {
        return new Response(err.message, {
            status: 500,
            headers: {
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}
