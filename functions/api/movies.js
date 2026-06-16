// functions/api/movies.js

export async function onRequest(context) {
  const MOVIE_ROOT = "https://a.111477.xyz/movies/";
  const OMDB_API_KEY = "e5665ae9"; // In production, use environment variables

  // Helper to fetch metadata from OMDb
  async function getMetadata(title, year) {
    try {
      const query = year ? `t=${encodeURIComponent(title)}&y=${year}` : `t=${encodeURIComponent(title)}`;
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
    const response = await fetch(MOVIE_ROOT, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to fetch source: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const allMovieFolders = [];

    // Using Regex to parse the HTML table rows since we don't have Cheerio in Workers
    // Looking for: <tr data-entry="true" data-name="Name" data-url="Url">...Directory...</tr>
    const rowRegex = /<tr data-entry="true" data-name="([^"]+)" data-url="([^"]+)">[\s\S]*?<span class="type-label">Directory<\/span>[\s\S]*?<\/tr>/g;
    
    let match;
    while ((match = rowRegex.exec(html)) !== null) {
      const name = match[1];
      const url = match[2];
      
      const yearMatch = name.match(/\((\d{4})\)/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : 0;
      const cleanTitle = name.replace(/\s\(\d{4}\)/, '').replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
      
      // Simple base64 encode for ID
      const id = btoa(url);

      allMovieFolders.push({
        id: id,
        title: cleanTitle,
        fullName: name,
        year: year,
        url: url
      });
    }

    // Sort by year newest first
    allMovieFolders.sort((a, b) => b.year - a.year);

    // Fetch posters for top 40 to stay within time/rate limits
    const topMovies = allMovieFolders.slice(0, 40);
    const remainingMovies = allMovieFolders.slice(40);

    const topMoviesWithMeta = await Promise.all(topMovies.map(async (m) => {
        try {
            const meta = await getMetadata(m.title, m.year);
            return { ...m, ...meta };
        } catch(e) {
            return { ...m, poster: null, genre: "General" };
        }
    }));

    const finalResults = [
        ...topMoviesWithMeta,
        ...remainingMovies.map(m => ({ ...m, poster: null, genre: "General" }))
    ];

    return new Response(JSON.stringify(finalResults), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' // Essential for local testing
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
