// server.js - Local Express server for RichieFlix
const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

const MOVIE_ROOT = "https://a.111477.xyz/movies/";
const OMDB_API_KEY = "e5665ae9";

// Helper to decode HTML entities
function decodeHTMLEntities(text) {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
}

// Helper to fetch metadata from OMDb
async function getMetadata(title, year) {
    try {
        const cleanTitle = title.replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
        const query = year ? `t=${encodeURIComponent(cleanTitle)}&y=${year}` : `t=${encodeURIComponent(cleanTitle)}`;
        const response = await fetch(`https://www.omdbapi.com/?${query}&apikey=${OMDB_API_KEY}`, {
            signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) return { poster: null, genre: "General" };

        const data = await response.json();
        if (data && data.Response === "True") {
            return {
                poster: data.Poster !== "N/A" ? data.Poster : null,
                genre: data.Genre !== "N/A" ? data.Genre.split(',')[0].trim() : "General"
            };
        }
    } catch (e) {
        // silently fail
    }
    return { poster: null, genre: "General" };
}

// Serve static files
app.use(express.static(path.join(__dirname)));

// API: Get all movies
app.get('/api/movies', async (req, res) => {
    // Prevent caching so fresh data is always fetched
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    });

    try {
        // Add cache-buster to source URL
        const cacheBuster = Date.now();
        const response = await fetch(`${MOVIE_ROOT}?_=${cacheBuster}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch source: ${response.status} ${response.statusText}`);
        }

        const html = await response.text();
        const allMovieFolders = [];

        // Parse all directory entries
        const rowRegex = /<tr data-entry="true" data-name="([^"]+)" data-url="([^"]+)">([\s\S]*?)<\/tr>/g;

        let match;
        while ((match = rowRegex.exec(html)) !== null) {
            const rawName = decodeHTMLEntities(match[1]);
            const url = match[2];
            const rowContent = match[3];

            // Only include directories (skip loose files at root level)
            if (!rowContent.includes('Directory') && !rawName.match(/\(\d{4}\)/)) continue;

            const yearMatch = rawName.match(/\((\d{4})\)/);
            const year = yearMatch ? parseInt(yearMatch[1], 10) : 0;
            const cleanTitle = rawName
                .replace(/\s\(\d{4}\)/, '')
                .replace(/[^\w\s]/gi, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            const id = Buffer.from(url).toString('base64');

            allMovieFolders.push({
                id,
                title: cleanTitle,
                fullName: rawName,
                year,
                url
            });
        }

        // Sort: newest year first, then alphabetically
        allMovieFolders.sort((a, b) => {
            if (b.year !== a.year) return b.year - a.year;
            return a.fullName.localeCompare(b.fullName);
        });

        // Get current year for "recently updated" detection
        const currentYear = new Date().getFullYear();
        const recentYears = [currentYear, currentYear - 1]; // e.g. 2026, 2025

        // Separate recent films (2025/2026) and older ones
        const recentMovies = allMovieFolders.filter(m => recentYears.includes(m.year));
        const olderMovies = allMovieFolders.filter(m => !recentYears.includes(m.year));

        console.log(`Total movies: ${allMovieFolders.length}`);
        console.log(`Recent (${recentYears.join('/')}): ${recentMovies.length}`);
        console.log(`Fetching OMDb metadata for top ${Math.min(recentMovies.length, 60)} recent films...`);

        // Fetch posters for top recent movies (up to 60) and some older ones
        const topRecent = recentMovies.slice(0, 60);
        const topOlder = olderMovies.slice(0, 20);
        const needsMeta = [...topRecent, ...topOlder];
        const noMeta = [...recentMovies.slice(60), ...olderMovies.slice(20)];

        const withMeta = await Promise.all(
            needsMeta.map(async (m) => {
                try {
                    const meta = await getMetadata(m.title, m.year);
                    return { ...m, ...meta, isRecent: recentYears.includes(m.year) };
                } catch (e) {
                    return { ...m, poster: null, genre: "General", isRecent: recentYears.includes(m.year) };
                }
            })
        );

        const withoutMeta = noMeta.map(m => ({
            ...m,
            poster: null,
            genre: "General",
            isRecent: recentYears.includes(m.year)
        }));

        const finalResults = [...withMeta, ...withoutMeta];

        console.log(`Responding with ${finalResults.length} movies.`);
        res.json(finalResults);

    } catch (error) {
        console.error("Error in /api/movies:", error);
        res.status(500).json({ error: error.message });
    }
});

// API: Get files in a movie folder
app.get('/api/movie-files', async (req, res) => {
    res.set({
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    });

    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).json({ error: "Missing url parameter" });
    }

    try {
        const fullUrl = `https://a.111477.xyz${targetUrl}`;
        const response = await fetch(fullUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status}`);
        }

        const html = await response.text();
        const files = [];
        const rowRegex = /<tr data-entry="true" data-name="([^"]+)" data-url="([^"]+)">/g;
        let match;
        while ((match = rowRegex.exec(html)) !== null) {
            files.push({ name: match[1], url: match[2] });
        }

        res.json(files);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =============================================================
//  Video Streaming — Robust Proxy with Per-Path URL Caching
//
//  Masalah: a.111477.xyz → p.111477.xyz/bulk → workers.dev/d/HASH
//           Hash URL bersifat IP-bound & time-limited (~5 menit).
//           Browser (IP berbeda dari server) tidak bisa pakai URL yg
//           di-resolve server. Solusi: server jadi full proxy.
//           Browser ← server ← (resolve fresh) ← CDN
// =============================================================

// Cache resolved CDN URL per video path, TTL 4 menit
const cdnUrlCache = new Map();
const CDN_CACHE_TTL_MS = 4 * 60 * 1000;

async function resolveCdnUrl(videoPath) {
    const cacheKey = videoPath;
    const now = Date.now();
    const cached = cdnUrlCache.get(cacheKey);
    if (cached && (now - cached.ts) < CDN_CACHE_TTL_MS) {
        console.log(`[stream] Cache hit for: ${videoPath.slice(0, 60)}...`);
        return cached.url;
    }

    const sourceUrl = `https://a.111477.xyz${videoPath}`;
    const baseHdrs = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
    };

    // Step 1: a.111477.xyz → 307 → p.111477.xyz/bulk?u=...
    const r1 = await fetch(sourceUrl, {
        method: 'HEAD',
        headers: { ...baseHdrs, 'Referer': 'https://a.111477.xyz/' },
        redirect: 'manual',
        signal: AbortSignal.timeout(12000)
    });
    let bulkUrl = r1.headers.get('location');
    if (!bulkUrl) return sourceUrl; // served directly

    // Step 2: p.111477.xyz/bulk → 302 → workers.dev/d/HASH/file
    // Gunakan Referer a.111477.xyz agar p.111477.xyz mau generate hash URL
    const r2 = await fetch(bulkUrl, {
        method: 'HEAD',
        headers: { ...baseHdrs, 'Referer': 'https://a.111477.xyz/' },
        redirect: 'manual',
        signal: AbortSignal.timeout(12000)
    });
    let cdnUrl = r2.headers.get('location') || bulkUrl;

    // Step 3 (optional extra hop dari beberapa workers.dev)
    if (cdnUrl !== bulkUrl) {
        const r3 = await fetch(cdnUrl, {
            method: 'HEAD',
            headers: { ...baseHdrs, 'Referer': 'https://p.111477.xyz/' },
            redirect: 'manual',
            signal: AbortSignal.timeout(8000)
        });
        const deepUrl = r3.headers.get('location');
        if (deepUrl) cdnUrl = deepUrl;
    }

    console.log(`[stream] Resolved → ${cdnUrl.slice(0, 90)}...`);
    cdnUrlCache.set(cacheKey, { url: cdnUrl, ts: now });
    return cdnUrl;
}

app.get('/api/stream', async (req, res) => {
    const videoPath = req.query.path;
    if (!videoPath) return res.status(400).send('Missing path parameter');

    res.set({
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
    });

    try {
        // Resolve CDN URL (server-side, cached 4 menit)
        const cdnUrl = await resolveCdnUrl(videoPath);
        
        console.log(`[stream] Redirecting user directly to CDN: ${cdnUrl.slice(0, 80)}...`);
        res.redirect(302, cdnUrl);

    } catch (err) {
        console.error('[stream] Error:', err.message);
        // Fallback ke source URL asli jika terjadi kegagalan
        res.redirect(302, `https://a.111477.xyz${videoPath}`);
    }
});

app.listen(PORT, () => {
    console.log(`\n🎬 RichieFlix server running at http://localhost:${PORT}`);
    console.log(`📡 Fetching fresh data from: ${MOVIE_ROOT}`);
    console.log(`\nPress Ctrl+C to stop.\n`);
});
