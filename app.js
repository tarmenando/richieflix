// ============================================================
//  RichieFlix — app.js
// ============================================================

const API_BASE       = window.location.origin;
const EXTERNAL_DOMAIN = "https://a.111477.xyz";

// State
let allMovies    = [];
let searchTimeout;
let currentVideoUrl = '';
let searchOpen   = false;

// ─── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    fetchMovies();
    initNavScroll();
    initScrollTopBtn();
    initKeyboardShortcuts();
    // Close search dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#search-wrapper')) closeSearchDropdown();
    });
});

// ─── Navbar scroll effect ───────────────────────────────────
function initNavScroll() {
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
        navbar.classList.toggle('scrolled', window.scrollY > 60);
    }, { passive: true });
}

// ─── Scroll-to-top button ───────────────────────────────────
function initScrollTopBtn() {
    const btn = document.getElementById('scroll-top-btn');
    window.addEventListener('scroll', () => {
        btn.classList.toggle('hidden', window.scrollY < 300);
    }, { passive: true });
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── Keyboard shortcuts ─────────────────────────────────────
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const overlay = document.getElementById('player-overlay');
            if (!overlay.classList.contains('hidden')) { closePlayer(); return; }
            clearSearch();
        }
        // '/' to focus search
        if (e.key === '/' && document.activeElement !== document.getElementById('search-input')) {
            e.preventDefault();
            document.getElementById('search-input').focus();
        }
    });
}

// ─── Loader ─────────────────────────────────────────────────
function showLoader(text = "Memuat...") {
    const loader = document.getElementById('loader');
    const loaderText = document.getElementById('loader-text');
    if (loader) {
        if (loaderText) loaderText.textContent = text;
        loader.classList.remove('hidden');
    }
}

function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) loader.classList.add('hidden');
}

// ─── Fetch movies ────────────────────────────────────────────
async function fetchMovies() {
    showLoader("Mengambil data film terbaru...");
    try {
        const ts = Date.now();
        const response = await fetch(`${API_BASE}/api/movies?_=${ts}`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
        });
        if (!response.ok) throw new Error("Server response not OK");
        allMovies = await response.json();
        console.log(`✅ Loaded ${allMovies.length} movies.`);
        renderApp(allMovies);
    } catch (err) {
        console.error("Failed to fetch movies:", err);
        document.getElementById('genres-container').innerHTML =
            `<div style="padding:80px 48px;text-align:center;color:#888">
                <div style="font-size:3rem;margin-bottom:16px">⚠️</div>
                <h2 style="margin-bottom:8px">Gagal memuat data film</h2>
                <p style="font-size:0.9rem">Periksa koneksi internet Anda, lalu <a href="javascript:location.reload()" style="color:#e50914">muat ulang halaman</a>.</p>
             </div>`;
    } finally {
        hideLoader();
    }
}

// ─── Search ──────────────────────────────────────────────────
function onSearchFocus() {
    const q = document.getElementById('search-input').value.trim();
    if (q.length >= 2) showSearchDropdown(q);
}

function onSearchBlur() {
    // Delay so dropdown click fires first
    setTimeout(() => {
        if (!document.querySelector('#search-dropdown:hover')) {
            // keep dropdown open while hovering it
        }
    }, 120);
}

function handleSearch() {
    const q = document.getElementById('search-input').value;
    const clearBtn = document.getElementById('clear-search');
    clearBtn.classList.toggle('hidden', q.length === 0);

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const query = q.trim().toLowerCase();
        if (query.length === 0) {
            closeSearchDropdown();
            hideSearchOverlay();
            return;
        }
        if (query.length >= 2) {
            const results = searchMovies(query);
            showSearchDropdown(query, results);
        }
    }, 220);
}

function searchMovies(query) {
    return allMovies.filter(m =>
        m.fullName.toLowerCase().includes(query) ||
        (m.genre && m.genre.toLowerCase().includes(query))
    );
}

function showSearchDropdown(query, results) {
    if (!results) results = searchMovies(query);
    const dropdown = document.getElementById('search-dropdown');
    const content  = document.getElementById('search-dropdown-content');
    const top5     = results.slice(0, 6);

    if (results.length === 0) {
        content.innerHTML = `<div class="dropdown-empty">Tidak ada film untuk "<strong>${escHtml(query)}</strong>"</div>`;
    } else {
        content.innerHTML = `
            <div class="dropdown-section-title">Film ditemukan</div>
            ${top5.map(m => `
                <div class="dropdown-item" onclick="openMovie(${JSON.stringify(m).replace(/"/g, '&quot;')})">
                    <div class="dropdown-poster" style="${m.poster ? `background-image:url(${m.poster})` : ''}"></div>
                    <div class="dropdown-info">
                        <div class="dropdown-title">${escHtml(m.fullName)}</div>
                        <div class="dropdown-meta">${m.year || ''} ${m.genre ? '· ' + m.genre : ''}</div>
                    </div>
                    <button class="dropdown-play" onclick="event.stopPropagation();openMovie(${JSON.stringify(m).replace(/"/g, '&quot;')})">
                        <svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>
                    </button>
                </div>
            `).join('')}
            ${results.length > 6 ? `
                <div class="dropdown-footer" onclick="showAllResults('${escHtml(query)}')">
                    Lihat semua ${results.length} hasil →
                </div>
            ` : ''}
        `;
    }

    dropdown.classList.remove('hidden');
}

function closeSearchDropdown() {
    document.getElementById('search-dropdown').classList.add('hidden');
}

function showAllResults(query) {
    closeSearchDropdown();
    const results = searchMovies(query.toLowerCase());
    renderSearchOverlay(query, results);
}

function renderSearchOverlay(query, results) {
    const overlay = document.getElementById('search-overlay');
    const grid    = document.getElementById('search-results-grid');
    const title   = document.getElementById('search-overlay-title');

    title.textContent = `${results.length} hasil untuk "${query}"`;
    grid.innerHTML = '';

    if (results.length === 0) {
        grid.innerHTML = `<div style="padding:40px;color:#888;font-size:0.9rem">Tidak ada film yang cocok.</div>`;
    } else {
        results.forEach(m => grid.appendChild(createMovieCard(m)));
    }

    overlay.classList.remove('hidden');
    overlay.scrollTop = 0;
}

function hideSearchOverlay() {
    document.getElementById('search-overlay').classList.add('hidden');
}

function clearSearch() {
    const input = document.getElementById('search-input');
    input.value = '';
    document.getElementById('clear-search').classList.add('hidden');
    closeSearchDropdown();
    hideSearchOverlay();
    input.focus();
}

// ─── Navigation filters ──────────────────────────────────────
function showHome(e) {
    e.preventDefault();
    setActiveNavLink(e.target);
    hideSearchOverlay();
    renderApp(allMovies);
    scrollToTop();
}

function showGenreFilter(e, genre) {
    e.preventDefault();
    setActiveNavLink(e.target);
    hideSearchOverlay();
    const results = allMovies.filter(m =>
        m.genre && m.genre.toLowerCase().includes(genre.toLowerCase())
    );
    renderApp(results, false, genre);
    scrollToTop();
}

function setActiveNavLink(el) {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    el.classList.add('active');
}

// ─── Render ──────────────────────────────────────────────────
function createMovieCard(movie) {
    const card = document.createElement('div');
    card.className = 'movie-card';
    if (movie.poster) card.style.backgroundImage = `url(${movie.poster})`;

    const badgeHTML = movie.isRecent
        ? `<div class="new-badge">${movie.year}</div>`
        : '';

    card.innerHTML = `
        ${badgeHTML}
        <div class="card-play-overlay">
            <div class="card-play-btn">
                <svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>
            </div>
        </div>
        <div class="movie-card-body">
            <h3>${escHtml(movie.fullName)}</h3>
            <div class="movie-card-meta">${movie.year || ''} ${movie.genre && movie.genre !== 'General' ? '· ' + movie.genre : ''}</div>
        </div>
    `;
    card.addEventListener('click', () => openMovie(movie));
    return card;
}

function renderApp(data, isFiltered = false, filterLabel = '') {
    const heroSection = document.getElementById('hero');
    const container   = document.getElementById('genres-container');
    container.innerHTML = '';

    // Hero
    heroSection.style.display = 'flex';
    const heroCandidates = data.filter(m => m.isRecent && m.poster);
    const hero = heroCandidates[Math.floor(Math.random() * Math.max(heroCandidates.length, 1))] ||
                 data.find(m => m.poster) || data[0];

    if (hero) {
        document.getElementById('hero-title').textContent = hero.title || hero.fullName;
        document.getElementById('hero-desc').textContent  = `${hero.year || ''} ${hero.genre && hero.genre !== 'General' ? '· ' + hero.genre : ''}`;
        const heroBg = document.getElementById('hero-bg');
        heroBg.style.backgroundImage = hero.poster ? `url(${hero.poster})` : 'none';
        heroBg.style.backgroundColor = hero.poster ? '' : '#111';
        document.getElementById('hero-badge').style.display = hero.isRecent ? '' : 'none';
        window.heroMovie = hero;
    }

    if (data.length === 0) {
        container.innerHTML = `<div style="padding:60px 48px;text-align:center;color:#888">Tidak ada film ditemukan.</div>`;
        return;
    }

    // Section 1 — Baru Ditambahkan (2025/2026)
    const currentYear = new Date().getFullYear();
    const recentMovies = data.filter(m => m.isRecent);

    if (recentMovies.length > 0 && !isFiltered) {
        renderRow(container, recentMovies, `Baru Ditambahkan`, true, currentYear);
    }

    // Section 2 — Group by genre
    const olderMovies = isFiltered ? data : data.filter(m => !m.isRecent);
    const genres = [...new Set(olderMovies.map(m => m.genre || 'General'))];
    genres.sort((a, b) => {
        if (a === 'General') return 1;
        if (b === 'General') return -1;
        return a.localeCompare(b);
    });

    if (isFiltered && filterLabel) {
        renderRow(container, olderMovies, filterLabel, false);
    } else {
        genres.forEach(genre => {
            const gMovies = olderMovies.filter(m => (m.genre || 'General') === genre);
            if (gMovies.length === 0) return;
            renderRow(container, gMovies, genre, false);
        });
    }
}

function renderRow(container, movies, label, isRecent = false, year = null) {
    const row = document.createElement('section');
    row.className = 'genre-row';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'genre-row-header';

    const titleEl = document.createElement('h2');
    titleEl.className = 'genre-title' + (isRecent ? ' recently-added-title' : '');
    titleEl.textContent = isRecent ? `🆕 ${label}` : label;
    if (isRecent) {
        const tag = document.createElement('span');
        tag.className = 'hot-tag';
        tag.textContent = 'TERBARU';
        titleEl.appendChild(tag);
    }
    headerDiv.appendChild(titleEl);

    const countEl = document.createElement('span');
    countEl.className = 'genre-count';
    countEl.textContent = movies.length;
    headerDiv.appendChild(countEl);

    row.appendChild(headerDiv);

    // Wrapper + scroll arrows
    const wrapper = document.createElement('div');
    wrapper.className = 'movie-list-wrapper';

    const arrowLeft = document.createElement('button');
    arrowLeft.className = 'scroll-arrow scroll-arrow-left';
    arrowLeft.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15,18 9,12 15,6"/></svg>`;

    const arrowRight = document.createElement('button');
    arrowRight.className = 'scroll-arrow scroll-arrow-right';
    arrowRight.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9,18 15,12 9,6"/></svg>`;

    const list = document.createElement('div');
    list.className = 'movie-list';

    const scrollAmt = 700;
    arrowLeft.addEventListener('click',  () => list.scrollBy({ left: -scrollAmt, behavior: 'smooth' }));
    arrowRight.addEventListener('click', () => list.scrollBy({ left:  scrollAmt, behavior: 'smooth' }));

    movies.forEach(m => list.appendChild(createMovieCard(m)));

    wrapper.appendChild(arrowLeft);
    wrapper.appendChild(list);
    wrapper.appendChild(arrowRight);
    row.appendChild(wrapper);
    container.appendChild(row);
}

// ─── Open / play movie ───────────────────────────────────────
async function openMovie(movie) {
    showLoader(`Memuat ${movie.title || movie.fullName}...`);
    try {
        // 1. Dapatkan daftar file dalam folder film
        const res   = await fetch(`${API_BASE}/api/movie-files?url=${encodeURIComponent(movie.url)}`);
        const files = await res.json();

        const videoFile = files.find(f =>
            f.name.endsWith('.mp4') || f.name.endsWith('.mkv') ||
            f.name.endsWith('.avi') || f.name.endsWith('.ts')
        );
        const subFile = files.find(f => f.name.endsWith('.srt') || f.name.endsWith('.vtt'));

        if (!videoFile) {
            hideLoader();
            showPlayerError('File video tidak ditemukan dalam folder ini.');
            return;
        }

        // 2. Gunakan URL direct ke sumber asli
        //    Ini memastikan film-film lain terputar dengan lancar langsung di browser,
        //    sementara error 429/MKV akan ditangani otomatis oleh modal error dengan tombol VLC & Salin Link.
        const videoUrl = `${EXTERNAL_DOMAIN}${videoFile.url}`;
        const subUrl   = subFile ? `${EXTERNAL_DOMAIN}${subFile.url}` : null;

        console.log(`[player] Direct stream: ${videoUrl}`);
        playVideo({ ...movie, videoUrl, subUrl });

    } catch (err) {
        console.error("Error opening movie:", err);
        hideLoader();
        showPlayerError('Terjadi kesalahan saat membuka film. Silakan coba lagi.');
    } finally {
        hideLoader();
    }
}

function playVideo(movie) {
    const overlay    = document.getElementById('player-overlay');
    const videoEl    = document.getElementById('video-player');
    const track      = document.getElementById('player-subtitle');
    const extBtn     = document.getElementById('external-player-btn');
    const titleText  = document.getElementById('player-title');

    // Hapus handler lama DULU sebelum set src baru
    videoEl.onerror = null;
    videoEl.removeAttribute('src');
    videoEl.load(); // batalkan semua request jaringan yang pending

    videoEl.src      = movie.videoUrl;
    currentVideoUrl  = movie.videoUrl;
    window._currentMovie = movie;
    if (titleText) titleText.textContent = movie.fullName || movie.title || '';

    if (movie.subUrl) { track.src = movie.subUrl; track.mode = 'showing'; }
    else              { track.src = ''; }

    // Handle video load error — pastikan handler ini hanya jalan SEKALI
    // dan null-kan dirinya sendiri sebelum memanggil closePlayer
    // agar tidak terjadi loop: onerror → closePlayer → src='' → onerror → ...
    videoEl.onerror = () => {
        const err = videoEl.error;
        videoEl.onerror = null;
        console.error('[video] Media error code:', err ? err.code : 'unknown');
        closePlayer();

        const isMkv = movie.fullName && movie.fullName.toLowerCase().endsWith('.mkv');
        let msg = `Gagal memuat video (kode ${err ? err.code : '?'}).\n`;
        if (err && err.code === 4 && isMkv) {
            msg += `Format file (.mkv) tidak didukung secara langsung oleh browser Anda.\n\nSilakan gunakan tombol opsi di bawah untuk memutar di VLC Player atau menyalin link streaming.`;
        } else {
            msg += `Kemungkinan server CDN membatasi request (429) atau format audio/video tidak didukung.`;
        }

        showPlayerError(msg, movie);
    };

    extBtn.classList.remove('hidden');
    overlay.classList.remove('hidden');
    videoEl.play().catch(e => console.warn('[video] Autoplay blocked:', e));
    document.body.style.overflow = 'hidden';
}

// Show error modal with retry & external player options
function showPlayerError(msg, movie = null) {
    const existing = document.getElementById('player-error-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'player-error-modal';
    modal.style.cssText = `
        position:fixed; inset:0; background:rgba(0,0,0,0.85); z-index:4000;
        display:flex; align-items:center; justify-content:center;
        font-family: 'Inter', sans-serif;
    `;

    // Action buttons inside modal
    let actionButtons = '';
    if (movie) {
        actionButtons += `
            <button onclick="document.getElementById('player-error-modal').remove(); openMovie(window._retryMovie);"
                style="background:#e50914;color:#fff;border:none;padding:12px 20px;border-radius:8px;
                       font-size:0.9rem;font-weight:700;cursor:pointer;margin:5px;">
                🔄 Coba Lagi
            </button>
        `;
        
        // VLC Deep link option
        const isAndroid = /Android/i.test(navigator.userAgent);
        const videoUrl = movie.videoUrl || '';
        const cleanUrl = videoUrl.replace(/^https?:\/\//i, '');
        const vlcUrl = isAndroid 
            ? `intent://${cleanUrl}#Intent;package=org.videolan.vlc;type=video/*;scheme=https;end;`
            : `vlc://${videoUrl}`;

        actionButtons += `
            <button onclick="window.location.href='${vlcUrl}'; document.getElementById('player-error-modal').remove();"
                style="background:#ff6b35;color:#fff;border:none;padding:12px 20px;border-radius:8px;
                       font-size:0.9rem;font-weight:700;cursor:pointer;margin:5px;display:inline-flex;align-items:center;gap:6px;">
                🧡 Buka di VLC
            </button>
            <button onclick="navigator.clipboard.writeText('${videoUrl}'); alert('Link video disalin!');"
                style="background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.15);
                       padding:12px 20px;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer;margin:5px;">
                📋 Salin Link
            </button>
        `;
    }

    modal.innerHTML = `
        <div style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.1);border-radius:16px;
                    padding:36px 40px;max-width:460px;width:90%;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.5);">
            <div style="font-size:3rem;margin-bottom:16px">📺</div>
            <h3 style="margin:0 0 12px;font-size:1.2rem;color:#fff;font-weight:700;">Gagal Memutar Video</h3>
            <p style="font-size:0.87rem;color:#aaa;line-height:1.6;margin-bottom:28px;white-space:pre-line">${escHtml(msg)}</p>
            <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:4px;">
                ${actionButtons}
                <button onclick="document.getElementById('player-error-modal').remove();"
                    style="background:rgba(255,255,255,0.05);color:#999;border:none;
                           padding:12px 20px;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer;margin:5px;">
                    Tutup
                </button>
            </div>
        </div>
    `;
    if (movie) window._retryMovie = movie;
    document.body.appendChild(modal);
}

function closePlayer() {
    const videoEl   = document.getElementById('video-player');
    const overlay   = document.getElementById('player-overlay');
    const extMenu   = document.getElementById('external-menu');

    // Null-kan onerror PERTAMA — mencegah loop saat src dikosongkan
    videoEl.onerror = null;
    videoEl.onended = null;

    videoEl.pause();
    videoEl.removeAttribute('src'); // lebih bersih dari src = ''
    videoEl.load();                 // abort semua request jaringan pending → stop console log

    overlay.classList.add('hidden');
    extMenu.classList.add('hidden');
    document.body.style.overflow = '';
    currentVideoUrl = '';
}

// ─── Hero ────────────────────────────────────────────────────
function playHero() {
    if (window.heroMovie) openMovie(window.heroMovie);
}

// ─── External player ─────────────────────────────────────────
function showExternalMenu() {
    document.getElementById('video-player').pause();
    document.getElementById('external-menu').classList.remove('hidden');
}

function hideExternalMenu() {
    document.getElementById('external-menu').classList.add('hidden');
    document.getElementById('video-player').play().catch(() => {});
}

function launchExternal(player) {
    if (!currentVideoUrl) return;
    const isAndroid = /Android/i.test(navigator.userAgent);
    const cleanUrl  = currentVideoUrl.replace(/^https?:\/\//i, '');
    let url = '';

    if (player === 'vlc') {
        url = isAndroid
            ? `intent://${cleanUrl}#Intent;package=org.videolan.vlc;type=video/*;scheme=https;end;`
            : `vlc://${currentVideoUrl}`;
    } else if (player === 'mx') {
        if (isAndroid) {
            url = `intent://${cleanUrl}#Intent;package=com.mxtech.videoplayer.ad;type=video/*;scheme=https;end;`;
        } else { alert("MX Player hanya didukung di Android."); return; }
    }

    if (url) { window.location.href = url; hideExternalMenu(); }
}

async function copyVideoUrl() {
    if (!currentVideoUrl) return;
    try {
        await navigator.clipboard.writeText(currentVideoUrl);
        alert("Link video berhasil disalin!");
        hideExternalMenu();
    } catch {
        prompt("Salin link berikut:", currentVideoUrl);
    }
}

// ─── Helpers ─────────────────────────────────────────────────
function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
