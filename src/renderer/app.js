// ===== STATE MANAGEMENT =====
let allGames = [];
let filteredGames = [];
let currentView = 'all';
let currentLauncher = 'all';
let currentSort = 'name';
let selectedGame = null;
let gridSize = 'medium';
let currentTheme = localStorage.getItem('app-theme') || 'default';
let customBackground = localStorage.getItem('app-background') || null;
let currentHoveredGameId = null;
let lastBgUpdateTime = 0;
let bgUpdateTimeout = null;
let appDetectionEnabled = localStorage.getItem('app-detection') !== 'false'; // Default to true

// ===== SOUND MANAGER =====
const SoundManager = {
    sounds: {
        hover: new Audio('../../assets/Button Hover.mp3'),
        click: new Audio('../../assets/Button Click.mp3'),
        launch: new Audio('../../assets/Starting.mp3'),
        start: new Audio('../../assets/Starting.mp3')
    },
    play(name, volume = 0.3) {
        if (this.sounds[name]) {
            const sound = this.sounds[name];
            sound.volume = volume;
            sound.currentTime = 0;
            sound.play().catch(e => { });
        }
    }
};

// ===== DOM ELEMENTS =====
const gamesGrid = document.getElementById('gamesGrid');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const gameModal = document.getElementById('gameModal');
const modalBackground = document.getElementById('modalBackground');
const backgroundImage = document.getElementById('backgroundImage');
const toastContainer = document.getElementById('toastContainer');

// ===== LAUNCHER CONFIG =====
const launcherConfig = {
    steam: { name: 'Steam', color: '#66c0f4' },
    epic: { name: 'Epic Games', color: '#ffffff' },
    xbox: { name: 'Xbox', color: '#107C10' },
    ea: { name: 'EA App', color: '#ff4747' },
    ubisoft: { name: 'Ubisoft', color: '#0070ff' },
    gog: { name: 'GOG', color: '#86328A' },
    desktop: { name: 'Desktop Apps', color: '#3b82f6' },
    manual: { name: 'Manual', color: '#6b7280' }
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
    SoundManager.play('start', 0.4);
    applyTheme(currentTheme);
    applyBackground(customBackground);
    updateAppDetectionUI();
    setupEventListeners();
    await loadGames();

    // Listen for real-time updates from main process
    window.electronAPI.onGamesUpdated((updatedGame) => {
        const index = allGames.findIndex(g => g.id === updatedGame.id);
        if (index !== -1) {
            allGames[index] = updatedGame;
            if (selectedGame && selectedGame.id === updatedGame.id) {
                selectedGame = updatedGame;
                updateStatsDisplay(updatedGame);
            }
            filterAndRenderGames(true);
        }
    });
});

// ===== EVENT LISTENERS =====
function setupEventListeners() {
    // Window controls
    document.getElementById('minimizeBtn').addEventListener('click', () => window.electronAPI.minimizeWindow());
    document.getElementById('maximizeBtn').addEventListener('click', () => window.electronAPI.maximizeWindow());
    document.getElementById('closeBtn').addEventListener('click', () => window.electronAPI.closeWindow());
    document.getElementById('fullscreenBtn').addEventListener('click', () => window.electronAPI.toggleFullscreen());

    // Scan and add buttons
    document.getElementById('scanBtn').addEventListener('click', () => {
        SoundManager.play('click');
        scanGames();
    });
    document.getElementById('scanFolderBtn').addEventListener('click', async () => {
        SoundManager.play('click');
        await scanCustomFolder();
    });
    document.getElementById('addManualBtn').addEventListener('click', () => {
        SoundManager.play('click');
        addManualGame();
    });
    document.getElementById('emptyStateBtn').addEventListener('click', () => {
        SoundManager.play('click');
        scanGames();
    });

    // Search
    searchInput.addEventListener('input', debounce(handleSearch, 300));

    // Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('mouseenter', () => SoundManager.play('hover', 0.1));
        btn.addEventListener('click', () => {
            SoundManager.play('click');
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentView = btn.dataset.view;
            document.getElementById('sectionTitle').textContent = btn.querySelector('span').textContent;
            filterAndRenderGames();
        });
    });

    // Launcher filters
    document.querySelectorAll('.launcher-filter').forEach(btn => {
        btn.addEventListener('mouseenter', () => SoundManager.play('hover', 0.1));
        btn.addEventListener('click', () => {
            SoundManager.play('click');
            document.querySelectorAll('.launcher-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentLauncher = btn.dataset.launcher;
            filterAndRenderGames();
        });
    });

    // View size controls
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('mouseenter', () => SoundManager.play('hover', 0.1));
        btn.addEventListener('click', () => {
            SoundManager.play('click');
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            gridSize = btn.dataset.size;
            gamesGrid.classList.toggle('large', gridSize === 'large');
        });
    });

    // Handle generic button hovers
    document.querySelectorAll('.title-btn, .action-btn, .modal-btn, .text-btn').forEach(btn => {
        btn.addEventListener('mouseenter', () => SoundManager.play('hover', 0.1));
        btn.addEventListener('click', () => {
            if (!['scanBtn', 'scanFolderBtn', 'addManualBtn', 'emptyStateBtn'].includes(btn.id)) {
                SoundManager.play('click');
            }
        });
    });

    // Sort select
    document.getElementById('sortSelect').addEventListener('change', (e) => {
        currentSort = e.target.value;
        filterAndRenderGames();
    });

    // Modal controls
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('gameModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('gameModal') || e.target.classList.contains('modal-overlay')) {
            closeModal();
        }
    });

    // Modal action buttons
    document.getElementById('launchBtn').addEventListener('click', () => launchGame(selectedGame));
    document.getElementById('favoriteBtn').addEventListener('click', () => toggleFavorite(selectedGame.id));
    document.getElementById('searchArtworkBtn').addEventListener('click', () => searchArtworkOnline(selectedGame));
    document.getElementById('openLocationBtn').addEventListener('click', () => openGameLocation(selectedGame));
    document.getElementById('openStoreBtn').addEventListener('click', () => openInStore(selectedGame));
    document.getElementById('changeCoverBtn').addEventListener('click', () => changeCover(selectedGame.id));
    document.getElementById('deleteGameBtn').addEventListener('click', () => deleteGame(selectedGame.id));
    document.getElementById('updateLauncherBtn').addEventListener('click', () => updateLauncher(selectedGame.id));
    document.getElementById('refreshStatsBtn').addEventListener('click', () => fetchAchievements(selectedGame));

    // Keyboard navigation
    document.addEventListener('keydown', handleKeyboard);

    // Settings Modal
    document.getElementById('settingsBtn').addEventListener('click', openSettings);
    document.getElementById('closeSettings').addEventListener('click', closeSettings);
    document.getElementById('settingsOverlay').addEventListener('click', closeSettings);

    // Theme options
    document.querySelectorAll('.theme-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.theme-option').forEach(o => o.classList.remove('active'));
            option.classList.add('active');
            const theme = option.dataset.theme;
            applyTheme(theme);
        });
    });

    // Background settings
    // Universal App Detection Toggle
    const detectionToggle = document.getElementById('appDetectionToggle');
    if (detectionToggle) {
        detectionToggle.checked = appDetectionEnabled;
        detectionToggle.addEventListener('change', (e) => {
            appDetectionEnabled = e.target.checked;
            localStorage.setItem('app-detection', appDetectionEnabled);
            updateAppDetectionUI();
            filterAndRenderGames();
        });
    }
}

function updateAppDetectionUI() {
    const desktopFilter = document.querySelector('.launcher-filter[data-launcher="desktop"]');
    const programsNav = document.querySelector('.nav-item[data-view="programs"]');
    const scanFolderBtn = document.getElementById('scanFolderBtn');

    if (appDetectionEnabled) {
        if (desktopFilter) desktopFilter.style.display = 'flex';
        if (programsNav) programsNav.style.display = 'flex';
        if (scanFolderBtn) scanFolderBtn.style.display = 'flex';
    } else {
        if (desktopFilter) desktopFilter.style.display = 'none';
        if (programsNav) programsNav.style.display = 'none';
        if (scanFolderBtn) scanFolderBtn.style.display = 'none';

        // If current view is programs, switch to all
        if (currentView === 'programs') {
            const allBtn = document.querySelector('.nav-item[data-view="all"]');
            if (allBtn) allBtn.click();
        }
        // If current launcher is desktop, switch to all
        if (currentLauncher === 'desktop') {
            const allLaunchersBtn = document.querySelector('.launcher-filter[data-launcher="all"]');
            if (allLaunchersBtn) allLaunchersBtn.click();
        }
    }
}

// Helper to reset rendering count
function resetRenderView(forceScrollTop = true) {
    displayedCount = 60; // Increased from 40 for better initial fill
    if (forceScrollTop) {
        gamesGrid.scrollTop = 0;
    }
}

// ===== GAME LOADING =====
async function loadGames() {
    showLoading(true);
    try {
        allGames = await window.electronAPI.getAllGames();
        updateCounts();
        filterAndRenderGames();
    } catch (error) {
        console.error('Failed to load games:', error);
        showToast('Failed to load games', 'error');
    }
    showLoading(false);
}

async function scanGames() {
    showLoading(true);
    showToast('Scanning and fetching artwork (this may take a minute)...', 'info');
    try {
        const games = await window.electronAPI.scanGames();
        allGames = await window.electronAPI.getAllGames();
        updateCounts();
        filterAndRenderGames();
        showToast(`Found ${games.length} games with updated artwork!`, 'success');
    } catch (error) {
        console.error('Failed to scan games:', error);
        showToast('Scan failed. Check launcher paths.', 'error');
    }
    showLoading(false);
}

async function addManualGame() {
    try {
        const game = await window.electronAPI.addManualGame();
        if (game) {
            allGames.push(game);
            updateCounts();
            filterAndRenderGames();
            showToast(`Added ${game.name}!`, 'success');
        }
    } catch (error) {
        console.error('Failed to add game:', error);
        showToast('Failed to add game', 'error');
    }
}

async function scanCustomFolder() {
    showLoading(true);
    showToast('Scanning selected folder...', 'info');
    try {
        const apps = await window.electronAPI.scanCustomFolder();
        if (apps && apps.length > 0) {
            allGames = await window.electronAPI.getAllGames();
            updateCounts();
            filterAndRenderGames();
            showToast(`Found ${apps.length} apps in folder!`, 'success');
        } else {
            showToast('No valid apps found in this folder', 'info');
        }
    } catch (error) {
        console.error('Folder scan failed:', error);
        showToast('Folder scan failed', 'error');
    }
    showLoading(false);
}

// ===== FILTERING & SORTING =====
function filterAndRenderGames(preserveScroll = false) {
    const savedScrollTop = gamesGrid.scrollTop;

    // Only reset displayed count if we're not preserving scroll
    if (!preserveScroll) {
        displayedCount = 60;
    }

    let games = [...allGames];

    if (currentView === 'favorites') {
        games = games.filter(g => g.isFavorite);
    } else if (currentView === 'recent') {
        games = games.filter(g => g.lastPlayed).sort((a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed));
    } else if (currentView === 'programs') {
        games = games.filter(g => g.launcher === 'desktop' || g.launcher === 'manual');
    }

    if (!appDetectionEnabled) {
        // Filter out desktop apps dynamically if detection is OFF
        games = games.filter(g => g.launcher !== 'desktop');
    }

    if (currentLauncher !== 'all') {
        games = games.filter(g => g.launcher === currentLauncher);
    }

    const searchTerm = searchInput.value.toLowerCase().trim();
    if (searchTerm) {
        // Simple fuzzy search: check if each word in search is present in name
        const searchWords = searchTerm.split(/\s+/);
        games = games.filter(g => {
            const name = g.name.toLowerCase();
            return searchWords.every(word => name.includes(word));
        });
    }

    switch (currentSort) {
        case 'name':
            games.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'name-desc':
            games.sort((a, b) => b.name.localeCompare(a.name));
            break;
        case 'recent':
            games.sort((a, b) => {
                if (!a.lastPlayed && !b.lastPlayed) return 0;
                if (!a.lastPlayed) return 1;
                if (!b.lastPlayed) return -1;
                return new Date(b.lastPlayed) - new Date(a.lastPlayed);
            });
            break;
        case 'launcher':
            games.sort((a, b) => a.launcher.localeCompare(b.launcher) || a.name.localeCompare(b.name));
            break;
    }

    filteredGames = games;
    renderGames();

    if (preserveScroll) {
        gamesGrid.scrollTop = savedScrollTop;
    }
}

function handleSearch() {
    filterAndRenderGames();
}

// ===== RENDERING =====
let displayedCount = 60;
const INCREMENT = 30; // Increased increment for smoother loading

function renderGames() {
    if (filteredGames.length === 0 && allGames.length === 0) {
        gamesGrid.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }

    emptyState.style.display = 'none';
    gamesGrid.style.display = 'grid';
    gamesGrid.innerHTML = '';

    // Slice for virtual-like scrolling
    const gamesToShow = filteredGames.slice(0, displayedCount);

    gamesToShow.forEach((game, index) => {
        const card = createGameCard(game, index);
        gamesGrid.appendChild(card);
    });

    if (displayedCount < filteredGames.length) {
        const loadMore = document.createElement('div');
        loadMore.className = 'load-more-trigger';
        loadMore.innerHTML = '<span>Scroll for more...</span>';
        gamesGrid.appendChild(loadMore);

        // Use IntersectionObserver for smoother infinite scroll
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                displayedCount += INCREMENT;
                observer.disconnect();
                renderGames();
            }
        }, { root: gamesGrid, rootMargin: '400px' });
        observer.observe(loadMore);
    }
}

// Removed manual scroll listener in favor of IntersectionObserver


function createGameCard(game, index) {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.tabIndex = 0;
    card.style.animationDelay = `${Math.min(index * 0.05, 0.3)}s`;

    const launcher = launcherConfig[game.launcher] || launcherConfig.manual;
    const hasCover = game.coverImage && !game.coverImage.startsWith('null');

    let displayCover = game.coverImage;
    if (displayCover && !displayCover.startsWith('http') && !displayCover.startsWith('data:')) {
        displayCover = 'file://' + displayCover.replace(/\\/g, '/');
    }

    card.innerHTML = `
        <div class="game-cover-container">
            ${hasCover ?
            `<img class="game-cover" src="${displayCover}" alt="${game.name}" loading="lazy" onerror="this.style.display='none'; this.parentElement.querySelector('.game-cover-placeholder').style.display='flex';">` :
            ''
        }
            <div class="game-cover-placeholder" style="${hasCover ? 'display:none;' : 'display:flex;'}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <rect x="2" y="6" width="20" height="12" rx="2"/>
                    <circle cx="17" cy="12" r="2"/>
                </svg>
                <span>${game.name}</span>
            </div>
        </div>
        <div class="game-favorite-badge ${game.isFavorite ? 'active' : ''}" data-action="favorite">
            <svg viewBox="0 0 24 24" fill="${game.isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
        </div>
        <div class="game-card-overlay">
            <h3 class="game-card-title">${game.name}</h3>
            <div class="game-card-launcher">
                <span class="dot" style="background: ${launcher.color}"></span>
                <span>${launcher.name}</span>
            </div>
        </div>
    `;

    card.addEventListener('click', (e) => {
        SoundManager.play('click');
        if (e.target.closest('[data-action="favorite"]')) {
            e.stopPropagation();
            toggleFavorite(game.id);
            return;
        }
        openGameModal(game);
    });

    card.addEventListener('dblclick', () => {
        SoundManager.play('launch');
        launchGame(game);
    });

    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') openGameModal(game);
        if (e.key === ' ') { e.preventDefault(); launchGame(game); }
    });

    card.addEventListener('mouseenter', () => {
        SoundManager.play('hover', 0.15);
        currentHoveredGameId = game.id;

        // Throttled background update
        const now = Date.now();
        if (now - lastBgUpdateTime > 150) {
            updateGlobalBackground(game);
        } else {
            clearTimeout(bgUpdateTimeout);
            bgUpdateTimeout = setTimeout(() => {
                if (currentHoveredGameId === game.id) {
                    updateGlobalBackground(game);
                }
            }, 150);
        }
    });

    card.addEventListener('mouseleave', () => {
        if (currentHoveredGameId === game.id) {
            currentHoveredGameId = null;
            if (!selectedGame) {
                requestAnimationFrame(() => {
                    backgroundImage.style.opacity = '0';
                });
            }
        }
    });

    return card;
}

function updateGlobalBackground(game) {
    if (!game) return;

    requestAnimationFrame(() => {
        if (game.backgroundImage || game.coverImage) {
            let bgUrl = game.backgroundImage || game.coverImage;
            if (bgUrl && !bgUrl.startsWith('http') && !bgUrl.startsWith('data:')) {
                bgUrl = 'file://' + bgUrl.replace(/\\/g, '/');
            }
            backgroundImage.style.backgroundImage = `url("${bgUrl}")`;
            backgroundImage.style.opacity = '0.3';
            lastBgUpdateTime = Date.now();
        }
    });
}

function updateCounts() {
    document.getElementById('allCount').textContent = allGames.length;
    document.getElementById('favCount').textContent = allGames.filter(g => g.isFavorite).length;
    document.getElementById('programsCount').textContent = allGames.filter(g => g.launcher === 'desktop' || g.launcher === 'manual').length;
}

// ===== MODAL =====
function openGameModal(game) {
    selectedGame = game;
    const launcher = launcherConfig[game.launcher] || launcherConfig.manual;

    document.getElementById('modalTitle').textContent = game.name;
    document.getElementById('modalPath').textContent = game.installPath || game.executablePath || 'Location unknown';

    const modalCover = document.getElementById('modalCover');
    if (game.coverImage) {
        let coverUrl = game.coverImage;
        if (coverUrl && !coverUrl.startsWith('http') && !coverUrl.startsWith('data:')) {
            coverUrl = 'file://' + coverUrl.replace(/\\/g, '/');
        }
        modalCover.style.backgroundImage = `url("${coverUrl}")`;
    } else {
        modalCover.style.backgroundImage = '';
    }

    const launcherBadge = document.getElementById('modalLauncher');
    launcherBadge.querySelector('.launcher-icon').style.background = launcher.color;
    launcherBadge.querySelector('.launcher-name').textContent = launcher.name;

    if (game.backgroundImage || game.coverImage) {
        let bgUrl = game.backgroundImage || game.coverImage;
        if (bgUrl && !bgUrl.startsWith('http') && !bgUrl.startsWith('data:')) {
            bgUrl = 'file://' + bgUrl.replace(/\\/g, '/');
        }
        modalBackground.style.backgroundImage = `url("${bgUrl}")`;
    }

    updateFavoriteButton(game.isFavorite);

    // Set statistics
    updateStatsDisplay(game);

    // Fetch fresh achievements
    fetchAchievements(game);

    // Set launcher dropdown value
    const launcherSelect = document.getElementById('launcherSelect');
    launcherSelect.value = game.launcher;

    gameModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function updateStatsDisplay(game) {
    document.getElementById('statPlayTime').textContent = formatPlayTime(game.playTime?.totalMinutes || 0);
    document.getElementById('statLastPlayed').textContent = formatRelativeTime(game.lastPlayed);

    const ach = game.achievements || { unlocked: 0, total: 0 };
    document.getElementById('statAchievements').textContent = `${ach.unlocked} / ${ach.total}`;

    const progress = ach.total > 0 ? (ach.unlocked / ach.total) * 100 : 0;
    document.getElementById('achievementProgress').style.width = `${progress}%`;
}

async function fetchAchievements(game) {
    try {
        const stats = await window.electronAPI.getAchievements(game);
        if (stats && stats.total > 0) {
            // Update local game object
            const index = allGames.findIndex(g => g.id === game.id);
            if (index !== -1) {
                allGames[index].achievements = stats;
                if (selectedGame && selectedGame.id === game.id) {
                    updateStatsDisplay(allGames[index]);
                }
            }
        }
    } catch (e) {
        console.error('Failed to fetch achievements:', e);
    }
}

function closeModal() {
    gameModal.classList.remove('active');
    document.body.style.overflow = '';
    backgroundImage.style.opacity = '0';
    selectedGame = null;
}

function updateFavoriteButton(isFavorite) {
    const btn = document.getElementById('favoriteBtn');
    const svg = btn.querySelector('svg');
    if (isFavorite) {
        svg.setAttribute('fill', 'currentColor');
        btn.querySelector('span').textContent = 'Unfavorite';
    } else {
        svg.setAttribute('fill', 'none');
        btn.querySelector('span').textContent = 'Favorite';
    }
}

// ===== GAME ACTIONS =====
async function launchGame(game) {
    try {
        SoundManager.play('launch');
        showToast(`Launching ${game.name}...`, 'info');
        const result = await window.electronAPI.launchGame(game);
        if (result.success) {
            closeModal();
        } else {
            showToast(`Failed to launch: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast('Failed to launch game', 'error');
    }
}

async function toggleFavorite(gameId) {
    try {
        const updatedGame = await window.electronAPI.toggleFavorite(gameId);
        const index = allGames.findIndex(g => g.id === gameId);
        if (index !== -1) {
            allGames[index] = updatedGame;
        }
        updateCounts();
        filterAndRenderGames(true); // Preserve scroll position

        if (selectedGame && selectedGame.id === gameId) {
            selectedGame = updatedGame;
            updateFavoriteButton(updatedGame.isFavorite);
        }
    } catch (error) {
        showToast('Failed to update favorite', 'error');
    }
}

async function openGameLocation(game) {
    try {
        await window.electronAPI.openGameLocation(game.executablePath || game.installPath);
    } catch (error) {
        showToast('Failed to open location', 'error');
    }
}

async function openInStore(game) {
    try {
        await window.electronAPI.openInStore(game);
    } catch (error) {
        showToast('Failed to open store', 'error');
    }
}

async function changeCover(gameId) {
    try {
        const updatedGame = await window.electronAPI.updateCover(gameId);
        if (updatedGame) {
            const index = allGames.findIndex(g => g.id === gameId);
            if (index !== -1) {
                allGames[index] = updatedGame;
            }
            filterAndRenderGames();
            if (selectedGame && selectedGame.id === gameId) {
                selectedGame = updatedGame;
                let coverUrl = updatedGame.coverImage;
                if (coverUrl && !coverUrl.startsWith('http') && !coverUrl.startsWith('data:')) {
                    coverUrl = 'file://' + coverUrl.replace(/\\/g, '/');
                }
                document.getElementById('modalCover').style.backgroundImage = `url("${coverUrl}")`;
            }
            showToast('Cover updated!', 'success');
        }
    } catch (error) {
        showToast('Failed to update cover', 'error');
    }
}

async function searchArtworkOnline(game) {
    try {
        showToast(`Searching for ${game.name} artwork...`, 'info');
        const updatedGame = await window.electronAPI.searchArtwork(game.name, game.id);
        if (updatedGame && updatedGame.coverImage) {
            const index = allGames.findIndex(g => g.id === game.id);
            if (index !== -1) {
                allGames[index] = updatedGame;
            }
            selectedGame = updatedGame;
            openGameModal(updatedGame); // Refresh modal
            filterAndRenderGames(true); // Preserve scroll
            showToast('Artwork updated successfully!', 'success');
        } else {
            showToast('No artwork found online.', 'error');
        }
    } catch (error) {
        showToast('Search failed.', 'error');
    }
}

async function updateLauncher(gameId) {
    const newLauncher = document.getElementById('launcherSelect').value;
    try {
        const updatedGame = await window.electronAPI.updateLauncher(gameId, newLauncher);
        if (updatedGame) {
            const index = allGames.findIndex(g => g.id === gameId);
            if (index !== -1) {
                allGames[index] = updatedGame;
            }
            selectedGame = updatedGame;
            filterAndRenderGames(true);
            showToast(`Launcher updated to ${launcherConfig[newLauncher].name}`, 'success');
        }
    } catch (error) {
        showToast('Failed to update launcher', 'error');
    }
}

async function deleteGame(gameId) {
    if (!confirm('Remove this game from your library?')) return;
    try {
        await window.electronAPI.deleteGame(gameId);
        allGames = allGames.filter(g => g.id !== gameId);
        updateCounts();
        filterAndRenderGames();
        closeModal();
        showToast('Game removed', 'success');
    } catch (error) {
        showToast('Failed to remove game', 'error');
    }
}

// ===== KEYBOARD NAVIGATION =====
function handleKeyboard(e) {
    if (e.key === 'Escape') {
        if (gameModal.classList.contains('active')) closeModal();
        if (document.getElementById('settingsModal').classList.contains('active')) closeSettings();
    }
    if (e.key === 'f' && e.ctrlKey) {
        e.preventDefault();
        searchInput.focus();
    }

    // Grid Navigation
    if (!gameModal.classList.contains('active') && !document.getElementById('settingsModal').classList.contains('active') && document.activeElement.classList.contains('game-card')) {
        const cards = Array.from(document.querySelectorAll('.game-card'));
        const currentIndex = cards.indexOf(document.activeElement);
        const gridComputed = getComputedStyle(gamesGrid);
        const columns = gridComputed.gridTemplateColumns.split(' ').length;

        let nextIndex = -1;
        if (e.key === 'ArrowRight') nextIndex = currentIndex + 1;
        if (e.key === 'ArrowLeft') nextIndex = currentIndex - 1;
        if (e.key === 'ArrowDown') nextIndex = currentIndex + columns;
        if (e.key === 'ArrowUp') nextIndex = currentIndex - columns;

        if (nextIndex >= 0 && nextIndex < cards.length) {
            e.preventDefault();
            cards[nextIndex].focus();
            cards[nextIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

// ===== THEME & SETTINGS =====
function openSettings() {
    // Set active class on current theme option
    document.querySelectorAll('.theme-option').forEach(option => {
        if (option.dataset.theme === currentTheme) {
            option.classList.add('active');
        } else {
            option.classList.remove('active');
        }
    });

    document.getElementById('settingsModal').classList.add('active');
}

function closeSettings() {
    document.getElementById('settingsModal').classList.remove('active');
}

function applyTheme(theme) {
    currentTheme = theme;
    localStorage.setItem('app-theme', theme);

    // Remove all theme classes
    document.body.classList.remove('theme-emerald', 'theme-amber', 'theme-crimson', 'theme-azure', 'theme-midnight');

    // Add selected theme class
    if (theme !== 'default') {
        document.body.classList.add(`theme-${theme}`);
    }
}

async function uploadBackground() {
    try {
        const filePath = await window.electronAPI.selectBackground();
        if (filePath) {
            applyBackground(filePath);
            showToast('Background updated!', 'success');
        }
    } catch (error) {
        showToast('Failed to upload background', 'error');
    }
}

function resetBackground() {
    applyBackground(null);
    showToast('Background reset to default', 'info');
}

function applyBackground(path) {
    customBackground = path;
    const dynamicBg = document.getElementById('dynamicBackground');
    const preview = document.getElementById('selectedBgPreview');

    if (path) {
        localStorage.setItem('app-background', path);
        let bgUrl = path;
        if (!bgUrl.startsWith('http') && !bgUrl.startsWith('data:')) {
            bgUrl = 'file://' + bgUrl.replace(/\\/g, '/');
        }
        dynamicBg.style.backgroundImage = `url("${bgUrl}")`;
        dynamicBg.style.backgroundSize = 'cover';
        dynamicBg.style.backgroundPosition = 'center';

        preview.style.backgroundImage = `url("${bgUrl}")`;
        preview.querySelector('span').style.display = 'none';
    } else {
        localStorage.removeItem('app-background');
        dynamicBg.style.backgroundImage = '';
        preview.style.backgroundImage = '';
        preview.querySelector('span').style.display = 'block';
    }
}

// ===== UTILITIES =====
function showLoading(show) {
    loadingState.classList.toggle('active', show);
    if (show) {
        gamesGrid.innerHTML = ''; // Clear actual games but keep grid visible
        gamesGrid.style.display = 'grid';
        renderSkeletons();
    }
}

function renderSkeletons() {
    gamesGrid.innerHTML = '';
    for (let i = 0; i < 12; i++) {
        const skeleton = document.createElement('div');
        skeleton.className = 'game-card skeleton';
        skeleton.innerHTML = `
            <div class="skeleton-shimmer"></div>
            <div class="game-cover-placeholder"></div>
        `;
        gamesGrid.appendChild(skeleton);
    }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function formatPlayTime(minutes) {
    if (!minutes || minutes <= 0) return '0 minutes';
    if (minutes < 60) return `${minutes} minutes`;
    const hours = (minutes / 60).toFixed(1);
    return `${hours} hours`;
}

function formatRelativeTime(date) {
    if (!date) return 'Never played';
    const now = new Date();
    const then = new Date(date);
    const diffMs = now - then;
    const diffMin = Math.round(diffMs / 60000);
    const diffHr = Math.round(diffMin / 60);
    const diffDay = Math.round(diffHr / 24);

    if (diffMin < 60) return `${diffMin} minutes ago`;
    if (diffHr < 24) return `${diffHr} hours ago`;
    if (diffDay < 7) return `${diffDay} days ago`;
    if (diffDay < 30) {
        const weeks = Math.round(diffDay / 7);
        return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
    }
    return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
