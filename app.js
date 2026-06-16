// Configuration
const API_BASE = window.location.origin; // Points to our Node.js server
const EXTERNAL_DOMAIN = "https://a.111477.xyz";

// State Management
let allMovies = [];
let searchTimeout;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    fetchMovies();
});

function showLoader(text = "Loading...") {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.querySelector('p').innerText = text;
        loader.classList.remove('hidden');
    }
}

function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) loader.classList.add('hidden');
}

async function fetchMovies() {
    showLoader("Fetching movie library...");
    try {
        const response = await fetch(`${API_BASE}/api/movies`);
        if (!response.ok) throw new Error("Server response not OK");
        allMovies = await response.json();
        console.log(`Loaded ${allMovies.length} movies.`);
        renderApp(allMovies);
    } catch (error) {
        console.error("Failed to fetch movies:", error);
        document.getElementById('genres-container').innerHTML = '<h2>Error loading movies. Please try again later.</h2>';
    } finally {
        hideLoader();
    }
}

function handleSearch() {
    const query = document.getElementById('search-input').value.toLowerCase();
    const clearBtn = document.getElementById('clear-search');
    
    if (query) {
        clearBtn.classList.remove('hidden');
    } else {
        clearBtn.classList.add('hidden');
    }

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        console.log("Searching for:", query);
        const filteredMovies = allMovies.filter(movie => 
            movie.fullName.toLowerCase().includes(query) ||
            movie.genre.toLowerCase().includes(query)
        );
        renderApp(filteredMovies, query !== "");
    }, 300);
}

function clearSearch() {
    const input = document.getElementById('search-input');
    input.value = '';
    handleSearch();
    input.focus();
}

// Helper to create movie card safely
function createMovieCard(movie) {
    const card = document.createElement('div');
    card.className = 'movie-card';
    if (movie.poster) {
        card.style.backgroundImage = `url(${movie.poster})`;
    }
    card.innerHTML = `<h3>${movie.fullName}</h3>`;
    card.onclick = () => openMovie(movie);
    return card;
}

function renderApp(data, isSearching = false) {
    const heroSection = document.getElementById('hero');
    const container = document.getElementById('genres-container');

    container.innerHTML = '';

    if (isSearching) {
        heroSection.style.display = 'none';
        if (data.length === 0) {
            container.innerHTML = '<div style="padding: 100px; text-align: center;"><h2>No movies found matching your search.</h2></div>';
            return;
        }

        const row = document.createElement('section');
        row.className = 'genre-row';
        row.innerHTML = `<h2 class="genre-title">Search Results</h2>`;
        
        const grid = document.createElement('div');
        grid.className = 'search-results-grid';
        data.forEach(movie => {
            grid.appendChild(createMovieCard(movie));
        });
        
        row.appendChild(grid);
        container.appendChild(row);
        return;
    }

    // Default view
    heroSection.style.display = 'flex';
    const newestWithPoster = data.find(m => m.poster) || data[0];
    if (newestWithPoster) {
        document.getElementById('hero-title').innerText = newestWithPoster.title;
        document.getElementById('hero-desc').innerText = `Year: ${newestWithPoster.year} | Genre: ${newestWithPoster.genre}`;
        if (newestWithPoster.poster) {
            heroSection.style.backgroundImage = `url(${newestWithPoster.poster})`;
        } else {
            heroSection.style.backgroundImage = 'none';
        }
        window.heroMovie = newestWithPoster;
    }

    if (data.length === 0) {
        container.innerHTML = '<h2>No movies available.</h2>';
        return;
    }

    // Group by Genre
    const genres = [...new Set(data.map(m => m.genre))];
    genres.sort((a, b) => {
        if (a === "General") return 1;
        if (b === "General") return -1;
        return a.localeCompare(b);
    });

    genres.forEach(genre => {
        const genreMovies = data.filter(m => m.genre === genre);
        if (genreMovies.length === 0) return;

        const row = document.createElement('section');
        row.className = 'genre-row';
        row.innerHTML = `<h2 class="genre-title">${genre}</h2>`;
        
        const list = document.createElement('div');
        list.className = 'movie-list';
        genreMovies.forEach(movie => {
            list.appendChild(createMovieCard(movie));
        });
        
        row.appendChild(list);
        container.appendChild(row);
    });
}

async function openMovie(movie) {
    showLoader(`Opening ${movie.title}...`);
    try {
        const response = await fetch(`${API_BASE}/api/movie-files?url=${encodeURIComponent(movie.url)}`);
        const files = await response.json();
        const videoFile = files.find(f => f.name.endsWith('.mp4') || f.name.endsWith('.mkv'));
        const subFile = files.find(f => f.name.endsWith('.srt'));

        if (videoFile) {
            const videoUrl = EXTERNAL_DOMAIN + videoFile.url;
            const subUrl = subFile ? EXTERNAL_DOMAIN + subFile.url : null;
            playVideo({ ...movie, videoUrl, subUrl });
        } else {
            alert("No video file found in this folder.");
        }
    } catch (error) {
        console.error("Error opening movie:", error);
    } finally {
        hideLoader();
    }
}

let currentVideoUrl = '';

function playVideo(movie) {
    const overlay = document.getElementById('player-overlay');
    const video = document.getElementById('video-player');
    const track = document.getElementById('player-subtitle');
    const extBtn = document.getElementById('external-player-btn');

    video.src = movie.videoUrl;
    currentVideoUrl = movie.videoUrl;
    
    if (movie.subUrl) {
        track.src = movie.subUrl;
        track.mode = 'showing';
    } else {
        track.src = '';
    }

    // Always show the external options button now (for Desktop and Mobile)
    extBtn.classList.remove('hidden');

    overlay.classList.remove('hidden');
    video.play();
}

function openExternalPlayer() {
    // This function is no longer used directly, keeping for safety, but we use showExternalMenu now
}

function showExternalMenu() {
    document.getElementById('video-player').pause();
    document.getElementById('external-menu').classList.remove('hidden');
}

function hideExternalMenu() {
    document.getElementById('external-menu').classList.add('hidden');
    document.getElementById('video-player').play();
}

function launchExternal(player) {
    if (!currentVideoUrl) return;

    const isAndroid = /Android/i.test(navigator.userAgent);
    const cleanUrl = currentVideoUrl.replace(/^https?:\/\//i, '');
    let intentUrl = '';

    if (player === 'vlc') {
        if (isAndroid) {
            intentUrl = `intent://${cleanUrl}#Intent;package=org.videolan.vlc;type=video/*;scheme=https;end;`;
        } else {
            intentUrl = `vlc://${currentVideoUrl}`;
        }
    } else if (player === 'mx') {
        if (isAndroid) {
            intentUrl = `intent://${cleanUrl}#Intent;package=com.mxtech.videoplayer.ad;type=video/*;scheme=https;end;`;
        } else {
             alert("MX Player deep linking is primarily supported on Android.");
             return;
        }
    }

    if (intentUrl) {
        window.location.href = intentUrl;
        // Optionally hide the menu after launch
        hideExternalMenu();
    }
}

async function copyVideoUrl() {
    if (!currentVideoUrl) return;
    try {
        await navigator.clipboard.writeText(currentVideoUrl);
        alert("Video link copied to clipboard!");
        hideExternalMenu();
    } catch (err) {
        console.error('Failed to copy: ', err);
        // Fallback for older browsers
        prompt("Copy this link:", currentVideoUrl);
    }
}

function playHero() {
    if (window.heroMovie) openMovie(window.heroMovie);
}

function closePlayer() {
    const overlay = document.getElementById('player-overlay');
    const video = document.getElementById('video-player');
    const extMenu = document.getElementById('external-menu');
    
    video.pause();
    video.src = '';
    overlay.classList.add('hidden');
    if (extMenu) {
        extMenu.classList.add('hidden');
    }
}
