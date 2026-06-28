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

    try {
        // Resolve CDN URL (server-side, cached 4 menit)
        const cdnUrl = await resolveCdnUrl(videoPath);
        
        // Kembalikan redirect 302 langsung ke CDN
        // Browser akan mem-follow redirect dan mengunduh langsung dari CDN ke IP user (bebas 429 Cloudflare Workers)
        return new Response(null, {
            status: 302,
            headers: {
                'Location': cdnUrl,
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store'
            }
        });

    } catch (err) {
        console.error('[stream] Error:', err.message);
        // Fallback ke source URL asli jika terjadi kegagalan
        return new Response(null, {
            status: 302,
            headers: {
                'Location': `https://a.111477.xyz${videoPath}`,
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store'
            }
        });
    }
}
