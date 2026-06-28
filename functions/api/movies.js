// functions/api/movies.js

export async function onRequest(context) {
  const MOVIE_ROOT = "https://a.111477.xyz/movies/";
  const OMDB_API_KEY = "e5665ae9"; // In production, use environment variables

  // Helper to decode HTML entities
  function decodeHTMLEntities(text) {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec)));
  }

  // Helper to fetch metadata from OMDb
  async function getMetadata(title, year) {
    try {
      const cleanTitle = title.replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
      const query = year ? `t=${encodeURIComponent(cleanTitle)}&y=${year}` : `t=${encodeURIComponent(cleanTitle)}`;
      const response = await fetch(`https://www.omdbapi.com/?${query}&apikey=${OMDB_API_KEY}`);
      if (!response.ok) return { poster: null, genre: "General" };
      
      const data = await response.json();
      if (data && data.Response === "True") {
        return {
          poster: data.Poster !== "N/A" ? data.Poster : null,
          genre: data.Genre !== "N/A" ? data.Genre.split(',')[0].trim() : "General"
        };
      }
    } catch (e) {
      console.error(`OMDb error for ${title}:`, e.message);
    }
    return { poster: null, genre: "General" };
  }

  try {
    // Use cache-busting to always get fresh data from the source
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

    // Using Regex to parse the HTML table rows
    // Looking for: <tr data-entry="true" data-name="Name" data-url="Url">...Directory...</tr>
    const rowRegex = /<tr data-entry="true" data-name="([^"]+)" data-url="([^"]+)">([\s\S]*?)<\/tr>/g;
    
    let match;
    while ((match = rowRegex.exec(html)) !== null) {
      const rawName = decodeHTMLEntities(match[1]);
      const url = match[2];
      const rowContent = match[3];

      // Only include directories (skip loose files)
      if (!rowContent.includes('Directory') && !rawName.match(/\(\d{4}\)/)) continue;

      const yearMatch = rawName.match(/\((\d{4})\)/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : 0;
      const cleanTitle = rawName
        .replace(/\s\(\d{4}\)/, '')
        .replace(/[^\w\s]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Simple base64 encode for ID
      const id = btoa(url);

      allMovieFolders.push({
        id: id,
        title: cleanTitle,
        fullName: rawName,
        year: year,
        url: url
      });
    }

    // Sort: newest year first, then alphabetically within same year
    allMovieFolders.sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return a.fullName.localeCompare(b.fullName);
    });

    // Current year detection for "recently added" flag
    const currentYear = new Date().getFullYear();
    const recentYears = [currentYear, currentYear - 1];

    // Separate recent films and older ones
    const recentMovies = allMovieFolders.filter(m => recentYears.includes(m.year));
    const olderMovies = allMovieFolders.filter(m => !recentYears.includes(m.year));

    // Fetch posters for top recent movies (up to 60) + top 20 older movies
    const topRecent = recentMovies.slice(0, 60);
    const topOlder = olderMovies.slice(0, 20);
    const needsMeta = [...topRecent, ...topOlder];
    const noMeta = [...recentMovies.slice(60), ...olderMovies.slice(20)];

    const withMeta = await Promise.all(needsMeta.map(async (m) => {
        try {
            const meta = await getMetadata(m.title, m.year);
            return { ...m, ...meta, isRecent: recentYears.includes(m.year) };
        } catch(e) {
            return { ...m, poster: null, genre: "General", isRecent: recentYears.includes(m.year) };
        }
    }));

    const withoutMeta = noMeta.map(m => ({
      ...m,
      poster: null,
      genre: "General",
      isRecent: recentYears.includes(m.year)
    }));

    const finalResults = [...withMeta, ...withoutMeta];

    return new Response(JSON.stringify(finalResults), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        // Prevent Cloudflare from caching this response
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'CDN-Cache-Control': 'no-store',
        'Cloudflare-CDN-Cache-Control': 'no-store'
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
