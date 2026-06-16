const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;
const MOVIE_ROOT = "https://a.111477.xyz/movies/";
const OMDB_API_KEY = "e5665ae9";

app.use(cors());
app.use(express.static(path.join(__dirname, 'streamweb')));

// Helper to fetch metadata from OMDb
async function getMetadata(title, year) {
    try {
        const query = year ? `t=${encodeURIComponent(title)}&y=${year}` : `t=${encodeURIComponent(title)}`;
        const response = await axios.get(`https://www.omdbapi.com/?${query}&apikey=${OMDB_API_KEY}`);
        if (response.data && response.data.Response === "True") {
            return {
                poster: response.data.Poster !== "N/A" ? response.data.Poster : null,
                genre: response.data.Genre !== "N/A" ? response.data.Genre.split(',')[0].trim() : "General"
            };
        }
    } catch (e) {
        console.error(`OMDb error for ${title}:`, e.message);
    }
    return { poster: null, genre: "General" };
}

// Endpoint to fetch movie list
app.get('/api/movies', async (req, res) => {
    try {
        console.log("Scraping all movies from source...");
        const response = await axios.get(MOVIE_ROOT);
        const $ = cheerio.load(response.data);
        const allMovieFolders = [];

        // Scrape EVERYTHING for searching
        $('tr[data-entry="true"]').each((i, el) => {
            const type = $(el).find('.type-label').text().trim();
            if (type === 'Directory') {
                const name = $(el).attr('data-name');
                const url = $(el).attr('data-url');
                
                const yearMatch = name.match(/\((\d{4})\)/);
                const year = yearMatch ? parseInt(yearMatch[1]) : 0;
                const cleanTitle = name.replace(/\s\(\d{4}\)/, '').replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
                
                allMovieFolders.push({
                    id: Buffer.from(url).toString('base64'),
                    title: cleanTitle,
                    fullName: name,
                    year: year,
                    url: url
                });
            }
        });

        // Sort by year newest first
        allMovieFolders.sort((a, b) => b.year - a.year);

        // ONLY fetch posters for the first 40 movies to avoid OMDb limits and slow loading
        // The rest will load titles only (can be searched)
        const topMovies = allMovieFolders.slice(0, 40);
        const remainingMovies = allMovieFolders.slice(40);

        console.log(`Fetching posters for top ${topMovies.length} movies...`);
        const topMoviesWithMeta = await Promise.all(topMovies.map(async (m) => {
            try {
                const meta = await getMetadata(m.title, m.year);
                return { ...m, ...meta };
            } catch (e) {
                return { ...m, poster: null, genre: "General" };
            }
        }));

        // Combine back. Rest of movies get default "General" genre and no poster
        const finalResults = [
            ...topMoviesWithMeta,
            ...remainingMovies.map(m => ({ ...m, poster: null, genre: "General" }))
        ];

        console.log(`Sending ${finalResults.length} movies to client.`);
        res.json(finalResults);
    } catch (error) {
        console.error("Error fetching movies:", error.message);
        res.status(500).json({ error: "Failed to fetch movie list" });
    }
});

// Endpoint to fetch files within a movie folder
app.get('/api/movie-files', async (req, res) => {
    const movieUrl = req.query.url;
    if (!movieUrl) return res.status(400).json({ error: "Missing url" });

    try {
        const fullUrl = `https://a.111477.xyz${movieUrl}`;
        const response = await axios.get(fullUrl);
        const $ = cheerio.load(response.data);
        const files = [];

        $('tr[data-entry="true"]').each((i, el) => {
            const name = $(el).attr('data-name');
            const url = $(el).attr('data-url');
            files.push({ name, url });
        });

        res.json(files);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch files" });
    }
});

app.listen(PORT, () => {
    console.log(`Proxy server running at http://localhost:${PORT}`);
});
