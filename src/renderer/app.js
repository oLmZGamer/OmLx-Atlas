// ===== STATE MANAGEMENT =====
let allGames = [];
let filteredGames = [];
let currentView = 'all';
let currentLauncher = 'all';
let currentCategory = 'all';
let currentSort = 'name';
let selectedGame = null;
let gridSize = 'medium';
let currentTheme = localStorage.getItem('app-theme') || 'default';
let customBackground = localStorage.getItem('app-background') || null;
let currentHoveredGameId = null;
let lastBgUpdateTime = 0;
let bgUpdateTimeout = null;
let appDetectionEnabled = localStorage.getItem('app-detection') === 'true'; // Default to false
let multiSelectMode = false;
let selectedGameIds = new Set();

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
    // Critical UI setup first (fast)
    applyTheme(currentTheme);
    applyBackground(customBackground);
    updateAppDetectionUI();
    setupEventListeners();

    // Load games immediately (critical for app startup speed)
    await loadGames();

    // Defer non-critical tasks to speed up initial render
    setTimeout(() => {
        SoundManager.play('start', 0.4);
        updateSidebarCategories();
    }, 100);

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
    document.getElementById('minimizeBtn').addEventListener('click', () => window.electronAPI.minimizeWindow());
    document.getElementById('maximizeBtn').addEventListener('click', () => window.electronAPI.maximizeWindow());
    document.getElementById('closeBtn').addEventListener('click', () => window.electronAPI.closeWindow());

    // Discord button
    document.getElementById('discordBtn').addEventListener('click', () => {
        SoundManager.play('click');
        window.electronAPI.openExternal('https://discord.com/invite/D2eZYQvfW7');
    });

    document.getElementById('scanBtn').addEventListener('click', () => {
        SoundManager.play('click');
        scanGames();
    });
    document.getElementById('scanAppsBtn').addEventListener('click', async () => {
        SoundManager.play('click');
        await scanApps();
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

            // Block navigation if multi-select mode is active
            if (multiSelectMode) {
                showToast('Please close multi-select mode before switching pages', 'info');
                return;
            }

            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            currentView = btn.dataset.view;
            document.getElementById('sectionTitle').textContent = btn.querySelector('span').textContent;

            // NEW: Toggle between Grid and Special Views (Stats/Categories)
            const statsContainer = document.getElementById('statisticsContainer');
            const categoriesContainer = document.getElementById('categoriesContainer');
            const viewControls = document.querySelector('.view-controls');
            const sidebarFilters = document.getElementById('categoryFiltersContainer');

            // Hide all first
            gamesGrid.style.display = 'none';
            if (statsContainer) statsContainer.style.display = 'none';
            if (categoriesContainer) categoriesContainer.style.display = 'none';

            if (currentView === 'statistics') {
                if (statsContainer) statsContainer.style.display = 'block';
                if (viewControls) viewControls.style.display = 'none';
                if (sidebarFilters) sidebarFilters.style.display = 'none';
                renderStatistics();
            } else if (currentView === 'categories') {
                if (categoriesContainer) categoriesContainer.style.display = 'block';
                if (viewControls) viewControls.style.display = 'none';
                if (sidebarFilters) sidebarFilters.style.display = 'none';
                renderCategories();
            } else {
                gamesGrid.style.display = 'grid';
                if (viewControls) viewControls.style.display = 'flex';
                if (sidebarFilters) sidebarFilters.style.display = (currentView === 'programs' ? 'none' : 'block');
                filterAndRenderGames();
            }
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
    document.getElementById('searchArtworkBtn').addEventListener('click', () => {
        searchArtworkOnline(selectedGame);
    });
    document.getElementById('openLocationBtn').addEventListener('click', () => openGameLocation(selectedGame));
    document.getElementById('openStoreBtn').addEventListener('click', () => openInStore(selectedGame));
    document.getElementById('changeCoverBtn').addEventListener('click', () => changeCover(selectedGame.id));
    document.getElementById('deleteGameBtn').addEventListener('click', () => deleteGame(selectedGame.id));
    document.getElementById('updateLauncherBtn').addEventListener('click', () => updateLauncher(selectedGame.id));
    document.getElementById('refreshStatsBtn').addEventListener('click', () => fetchAchievements(selectedGame));
    document.getElementById('updateCategoriesBtn').addEventListener('click', updateGameCategories);

    // Keyboard navigation
    document.addEventListener('keydown', handleKeyboard);

    // Settings Modal
    document.getElementById('settingsBtn').addEventListener('click', openSettings);
    document.getElementById('closeSettings').addEventListener('click', closeSettings);
    document.getElementById('settingsOverlay').addEventListener('click', closeSettings);

    // NEW: Feedback button
    const feedbackBtn = document.getElementById('feedbackBtn');
    if (feedbackBtn) {
        feedbackBtn.addEventListener('click', () => {
            SoundManager.play('click');
            window.electronAPI.openExternal('https://omlxstudios.xyz/#contact');
        });
    }

    // NEW: View Logs button
    const viewLogsBtn = document.getElementById('viewLogsBtn');
    if (viewLogsBtn) {
        viewLogsBtn.addEventListener('click', async () => {
            SoundManager.play('click');
            await window.electronAPI.openLogsFolder();
            showToast('Logs folder opened');
        });
    }

    // NEW: Restore default categories button
    const restoreDefaultCategoriesBtn = document.getElementById('restoreDefaultCategoriesBtn');
    if (restoreDefaultCategoriesBtn) {
        restoreDefaultCategoriesBtn.addEventListener('click', async () => {
            SoundManager.play('click');
            if (confirm('Are you sure you want to restore the default categories? Your custom categories will be lost.')) {
                try {
                    await window.electronAPI.restoreDefaultCategories();
                    showToast('Default categories restored!');
                    await updateSidebarCategories();
                    renderCategories();
                    closeSettings();
                } catch (error) {
                    showToast('Failed to restore categories', 'error');
                }
            }
        });
    }

    // NEW: Add Category button in categories view
    const addCategoryBtn = document.getElementById('addCategoryBtn');
    if (addCategoryBtn) {
        addCategoryBtn.addEventListener('click', createCategory);
    }
    const sidebarAddCategoryBtn = document.getElementById('sidebarAddCategoryBtn');
    if (sidebarAddCategoryBtn) {
        sidebarAddCategoryBtn.addEventListener('click', createCategory);
    }

    // NEW: Clear all games button
    const clearAllGamesBtn = document.getElementById('clearAllGamesBtn');
    if (clearAllGamesBtn) {
        clearAllGamesBtn.addEventListener('click', async () => {
            SoundManager.play('click');
            const result = await window.electronAPI.clearAllGames();
            if (result.cleared) {
                allGames = [];
                filterAndRenderGames();
                showToast('All games removed from library', 'success');
            } else {
                showToast('Cancelled', 'info');
            }
        });
    }

    // NEW: Search artwork for all games button
    const searchAllArtworkBtn = document.getElementById('searchAllArtworkBtn');
    if (searchAllArtworkBtn) {
        searchAllArtworkBtn.addEventListener('click', async () => {
            SoundManager.play('click');

            // Removed confirmation as requested
            if (false) return;

            try {
                // Disable button and show loading
                searchAllArtworkBtn.disabled = true;
                searchAllArtworkBtn.innerHTML = `
                    <svg class="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    <span>Searching...</span>
                `;

                showToast('Searching for artwork... This may take a while');

                const result = await window.electronAPI.searchAllArtwork();

                // Re-enable button
                searchAllArtworkBtn.disabled = false;
                searchAllArtworkBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span>Search for Covers</span>
                `;

                if (result.success) {
                    showToast(`Artwork search complete! Updated: ${result.updated}, Failed: ${result.failed}, Skipped: ${result.skipped}`);
                    // Reload games to show new artwork
                    await loadGames();
                } else {
                    showToast('Failed to search artwork: ' + (result.error || 'Unknown error'));
                }
            } catch (error) {
                console.error('Error searching artwork:', error);
                showToast('Error searching artwork');

                // Re-enable button
                searchAllArtworkBtn.disabled = false;
                searchAllArtworkBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span>Search for Covers</span>
                `;
            }
        });
    }

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
    const uploadBgBtn = document.getElementById('uploadBgBtn');
    if (uploadBgBtn) {
        uploadBgBtn.addEventListener('click', () => {
            SoundManager.play('click');
            uploadBackground();
        });
    }

    const resetBgBtn = document.getElementById('resetBgBtn');
    if (resetBgBtn) {
        resetBgBtn.addEventListener('click', () => {
            SoundManager.play('click');
            resetBackground();
        });
    }

    // ===== STEAM API INTEGRATION =====

    // Load existing Steam credentials on settings open
    loadSteamCredentials();
    loadBackupsList();

    // Steam API Link click
    const steamApiLink = document.getElementById('steamApiLink');
    if (steamApiLink) {
        steamApiLink.addEventListener('click', (e) => {
            e.preventDefault();
            window.electronAPI.openExternal('https://steamcommunity.com/dev/apikey');
        });
    }

    const steamIdLink = document.getElementById('steamIdLink');
    if (steamIdLink) {
        steamIdLink.addEventListener('click', (e) => {
            e.preventDefault();
            window.electronAPI.openExternal('https://steamid.io/');
        });
    }

    // Save Steam Credentials
    const saveSteamCredentialsBtn = document.getElementById('saveSteamCredentialsBtn');
    if (saveSteamCredentialsBtn) {
        saveSteamCredentialsBtn.addEventListener('click', async () => {
            SoundManager.play('click');
            const apiKey = document.getElementById('steamApiKeyInput').value.trim();
            const steamId64 = document.getElementById('steamId64Input').value.trim();

            if (!apiKey || !steamId64) {
                showToast('Please enter both API Key and Steam ID64');
                return;
            }

            if (steamId64.length !== 17 || !/^\d+$/.test(steamId64)) {
                showToast('Steam ID64 should be 17 digits');
                return;
            }

            try {
                const result = await window.electronAPI.setSteamCredentials(apiKey, steamId64);
                if (result.success) {
                    showToast('Steam credentials saved!');
                    showSteamStatus('Credentials saved. Click "Test Connection" to verify.', 'info');
                } else {
                    showToast('Failed to save credentials');
                }
            } catch (error) {
                showToast('Error saving credentials');
            }
        });
    }

    // Test Steam Connection
    const testSteamConnectionBtn = document.getElementById('testSteamConnectionBtn');
    if (testSteamConnectionBtn) {
        testSteamConnectionBtn.addEventListener('click', async () => {
            SoundManager.play('click');
            showSteamStatus('Testing connection...', 'info');

            try {
                const result = await window.electronAPI.testSteamConnection();
                if (result.valid) {
                    showSteamStatus(`✓ Connected as: ${result.username}`, 'success');
                    showToast('Steam connected successfully!');
                } else {
                    showSteamStatus(`✗ ${result.error || 'Connection failed'}`, 'error');
                    showToast('Steam connection failed');
                }
            } catch (error) {
                showSteamStatus('✗ Connection error', 'error');
                showToast('Error testing connection');
            }
        });
    }

    // Sync Steam Playtime
    const syncSteamPlaytimeBtn = document.getElementById('syncSteamPlaytimeBtn');
    if (syncSteamPlaytimeBtn) {
        syncSteamPlaytimeBtn.addEventListener('click', async () => {
            SoundManager.play('click');

            syncSteamPlaytimeBtn.disabled = true;
            syncSteamPlaytimeBtn.innerHTML = '<svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg><span>Syncing...</span>';

            try {
                const result = await window.electronAPI.syncSteamPlaytime();
                if (result.success) {
                    showToast(`Synced playtime for ${result.synced} games!`);
                    showSteamStatus(`✓ Synced ${result.synced} of ${result.total} Steam games`, 'success');
                    await loadGames(); // Refresh game cards
                } else {
                    showToast('Sync failed: ' + (result.error || 'Unknown error'));
                    showSteamStatus(`✗ ${result.error}`, 'error');
                }
            } catch (error) {
                showToast('Error syncing playtime');
            }

            syncSteamPlaytimeBtn.disabled = false;
            syncSteamPlaytimeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg><span>Sync Playtime</span>';
        });
    }

    // Epic Login
    const epicLoginBtn = document.getElementById('epicLoginBtn');
    if (epicLoginBtn) {
        epicLoginBtn.addEventListener('click', async () => {
            SoundManager.play('click');
            const email = prompt('Enter Epic Games Email:');
            if (!email) return;
            const password = prompt('Enter Epic Games Password:');
            if (!password) return;

            showToast('Logging in to Epic Games...', 'info');
            try {
                const result = await window.electronAPI.epicLogin({ email, password });
                if (result.success) {
                    showToast(`Logged in as ${result.user.displayName}!`, 'success');
                } else {
                    showToast('Epic login failed: ' + result.error, 'error');
                }
            } catch (error) {
                showToast('Epic login error', 'error');
            }
        });
    }

    // Xbox Login
    const xboxLoginBtn = document.getElementById('xboxLoginBtn');
    if (xboxLoginBtn) {
        xboxLoginBtn.addEventListener('click', async () => {
            SoundManager.play('click');
            const apiKey = prompt('Enter your xbl.io API Key:');
            if (!apiKey) return;

            showToast('Configuring Xbox connection...', 'info');
            try {
                const result = await window.electronAPI.xboxSetApiKey(apiKey);
                if (result.success) {
                    showToast('Xbox API Key saved!', 'success');
                    // Trigger initial sync
                    await window.electronAPI.xboxSync();
                } else {
                    showToast('Failed to save Xbox API Key', 'error');
                }
            } catch (error) {
                showToast('Xbox config error', 'error');
            }
        });
    }

    // All Games Filter
    const allFilter = document.getElementById('allGamesFilter');
    if (allFilter) {
        allFilter.addEventListener('click', () => {
            document.querySelectorAll('.launcher-filter').forEach(b => b.classList.remove('active'));
            allFilter.classList.add('active');
            currentCategory = 'all';
            currentLauncher = 'all';
            filterAndRenderGames();
        });
    }

    // ===== DATABASE BACKUP =====

    // Create Backup
    const createBackupBtn = document.getElementById('createBackupBtn');
    if (createBackupBtn) {
        createBackupBtn.addEventListener('click', async () => {
            SoundManager.play('click');

            try {
                const result = await window.electronAPI.createDatabaseBackup();
                if (result.success) {
                    showToast('Backup created successfully!');
                    loadBackupsList(); // Refresh backup list
                } else {
                    showToast('Backup failed: ' + result.error);
                }
            } catch (error) {
                showToast('Error creating backup');
            }
        });
    }

    // Restore Backup
    const restoreBackupBtn = document.getElementById('restoreBackupBtn');
    if (restoreBackupBtn) {
        restoreBackupBtn.addEventListener('click', async () => {
            SoundManager.play('click');

            const backupSelect = document.getElementById('backupSelect');
            const backupPath = backupSelect.value;

            if (!backupPath) {
                showToast('Please select a backup to restore');
                return;
            }

            const confirmed = confirm('Are you sure you want to restore this backup? Your current library will be replaced.');
            if (!confirmed) return;

            try {
                const result = await window.electronAPI.restoreDatabaseBackup(backupPath);
                if (result.success) {
                    showToast('Library restored successfully!');
                    await loadGames(); // Refresh game cards
                } else {
                    showToast('Restore failed: ' + result.error);
                }
            } catch (error) {
                showToast('Error restoring backup');
            }
        });
    }

    // Open Backup Folder
    const openBackupFolderBtn = document.getElementById('openBackupFolderBtn');
    if (openBackupFolderBtn) {
        openBackupFolderBtn.addEventListener('click', () => {
            SoundManager.play('click');
            window.electronAPI.openBackupsFolder();
        });
    }

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

    // Multi-select controls
    document.getElementById('toggleMultiSelectBtn').addEventListener('click', () => {
        SoundManager.play('click');
        toggleMultiSelectMode();
    });

    document.getElementById('selectAllBtn').addEventListener('click', () => {
        SoundManager.play('click');
        selectAllGames();
    });

    document.getElementById('deselectAllBtn').addEventListener('click', () => {
        SoundManager.play('click');
        deselectAllGames();
    });

    // Bulk action buttons
    document.getElementById('bulkFavoriteBtn').addEventListener('click', () => {
        SoundManager.play('click');
        bulkFavorite(true);
    });

    document.getElementById('bulkUnfavoriteBtn').addEventListener('click', () => {
        SoundManager.play('click');
        bulkFavorite(false);
    });

    document.getElementById('bulkChangeCategoriesBtn').addEventListener('click', () => {
        SoundManager.play('click');
        openBulkCategoriesModal();
    });

    document.getElementById('bulkDeleteBtn').addEventListener('click', () => {
        SoundManager.play('click');
        bulkDelete();
    });

    // Bulk launcher modal
    document.getElementById('closeBulkLauncher').addEventListener('click', closeBulkLauncherModal);
    document.getElementById('bulkLauncherOverlay').addEventListener('click', closeBulkLauncherModal);
    document.getElementById('confirmBulkLauncherBtn').addEventListener('click', () => {
        SoundManager.play('click');
        confirmBulkLauncherChange();
    });

    // Bulk categories modal
    document.getElementById('closeBulkCategories').addEventListener('click', closeBulkCategoriesModal);
    document.getElementById('bulkCategoriesOverlay').addEventListener('click', closeBulkCategoriesModal);
    document.getElementById('confirmBulkCategoriesBtn').addEventListener('click', () => {
        SoundManager.play('click');
        confirmBulkCategoriesChange();
    });
}

function updateAppDetectionUI() {
    const desktopFilter = document.querySelector('.launcher-filter[data-launcher="desktop"]');
    const programsNav = document.querySelector('.nav-item[data-view="programs"]');
    const scanAppsBtn = document.getElementById('scanAppsBtn');

    if (appDetectionEnabled) {
        if (desktopFilter) desktopFilter.style.display = 'flex';
        if (programsNav) programsNav.style.display = 'flex';
        if (scanAppsBtn) scanAppsBtn.style.display = 'flex';
    } else {
        if (desktopFilter) desktopFilter.style.display = 'none';
        if (programsNav) programsNav.style.display = 'none';
        if (scanAppsBtn) scanAppsBtn.style.display = 'none';

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
    // Show confirmation dialog before starting scan
    const proceed = confirm('Scanning for games may take a few minutes.\n\nPlease don\'t close the application during this process.\n\nClick OK to start scanning.');

    if (!proceed) {
        return; // User cancelled
    }

    toggleGlobalLoading(true, 'Scanning for Games... (This may take a few minutes)');
    try {
        const games = await window.electronAPI.scanGames();
        allGames = await window.electronAPI.getAllGames();
        updateCounts();
        filterAndRenderGames();
        showToast(`✅ Found ${games.length} games with updated artwork!`, 'success');
    } catch (error) {
        console.error('Failed to scan games:', error);
        showToast('Scan failed. Check launcher paths.', 'error');
    }
    toggleGlobalLoading(false);
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
    toggleGlobalLoading(true, 'Scanning Folder...');
    try {
        const apps = await window.electronAPI.scanCustomFolder();
        if (apps && apps.length > 0) {
            allGames = await window.electronAPI.getAllGames();
            updateCounts();
            filterAndRenderGames();
            showToast(`Found ${apps.length} matches in folder!`, 'success');
        }
    } catch (error) {
        console.error('Folder scan failed:', error);
        showToast('Folder scan failed', 'error');
    }
    toggleGlobalLoading(false);
}

async function scanApps() {
    toggleGlobalLoading(true, 'Scanning for Applications...');
    try {
        const apps = await window.electronAPI.scanApps();
        if (apps && apps.length > 0) {
            allGames = await window.electronAPI.getAllGames();
            updateCounts();
            filterAndRenderGames();
            showToast(`Found ${apps.length} new applications!`, 'success');
        } else {
            showToast('No new applications found.', 'info');
        }
    } catch (error) {
        console.error('App scan failed:', error);
        showToast('Application scan failed.', 'error');
    }
    toggleGlobalLoading(false);
}

// Global Loading Helper
function toggleGlobalLoading(show, message = 'Scanning...') {
    const overlay = document.getElementById('globalLoadingOverlay');
    const text = document.getElementById('loadingText');
    if (overlay) {
        if (show) {
            text.textContent = message;
            overlay.classList.add('active');
        } else {
            overlay.classList.remove('active');
        }
    }
}

// ===== FILTERING & SORTING =====
function filterAndRenderGames(preserveScroll = false) {
    const savedScrollTop = gamesGrid.scrollTop;

    // Only reset displayed count if we're not preserving scroll
    if (!preserveScroll) {
        displayedCount = 60;
    }

    // NEW: Handle 'taste' view separately (analytics, not a filter)
    if (currentView === 'taste') {
        renderYourTasteView();
        return;
    }

    let games = [...allGames];

    if (currentView === 'favorites') {
        games = games.filter(g => g.isFavorite);
    } else if (currentView === 'recent') {
        games = games.filter(g => g.lastPlayed).sort((a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed));
    } else if (currentView === 'programs') {
        // NEW: Filter by itemType='app' instead of launcher
        games = games.filter(g => g.itemType === 'app');
    }

    if (!appDetectionEnabled) {
        // Filter out desktop apps dynamically if detection is OFF
        games = games.filter(g => g.launcher !== 'desktop');
    }

    if (currentLauncher !== 'all') {
        games = games.filter(g => g.launcher === currentLauncher);
    }

    if (currentCategory && currentCategory !== 'all') {
        games = games.filter(game => game.categories && game.categories.includes(currentCategory));
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
    card.setAttribute('data-game-id', game.id);
    card.style.animationDelay = `${Math.min(index * 0.05, 0.3)}s`;

    const launcher = launcherConfig[game.launcher] || launcherConfig.manual;
    const hasCover = game.coverImage && !game.coverImage.startsWith('null');

    let displayCover = game.coverImage;
    if (displayCover && !displayCover.startsWith('http') && !displayCover.startsWith('data:')) {
        displayCover = 'file://' + displayCover.replace(/\\/g, '/');
    }

    const isSelected = selectedGameIds.has(game.id);
    if (isSelected) {
        card.classList.add('selected');
    }

    card.innerHTML = `
        ${multiSelectMode ? `
            <div class="game-select-checkbox" data-action="select">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <path d="M20 6L9 17l-5-5"/>
                </svg>
            </div>
        ` : ''}
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

        // Handle multi-select mode
        if (multiSelectMode) {
            e.stopPropagation();
            toggleGameSelection(game.id);
            return;
        }

        if (e.target.closest('[data-action="favorite"]')) {
            e.stopPropagation();
            toggleFavorite(game.id);
            return;
        }
        openGameModal(game);
    });

    card.addEventListener('dblclick', () => {
        if (!multiSelectMode) {
            SoundManager.play('launch');
            launchGame(game);
        }
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

    // Populate categories list with checkboxes
    populateModalCategories(game);

    gameModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

async function populateModalCategories(game) {
    const container = document.getElementById('modalCategoriesList');
    if (!container) return;

    try {
        const categories = await window.electronAPI.getCategories();
        container.innerHTML = '';

        categories.forEach(cat => {
            const isChecked = game.categories && game.categories.includes(cat);
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.alignItems = 'center';
            wrapper.style.gap = '6px';
            wrapper.style.background = 'rgba(255,255,255,0.05)';
            wrapper.style.padding = '4px 10px';
            wrapper.style.borderRadius = '15px';
            wrapper.style.fontSize = '12px';

            wrapper.innerHTML = `
                <input type="checkbox" value="${cat}" ${isChecked ? 'checked' : ''} id="cat_${cat}">
                <label for="cat_${cat}" style="cursor: pointer;">${cat}</label>
            `;
            container.appendChild(wrapper);
        });
    } catch (error) {
        console.error('Failed to populate modal categories', error);
    }
}

async function updateGameCategories() {
    if (!selectedGame) return;

    const container = document.getElementById('modalCategoriesList');
    const checked = Array.from(container.querySelectorAll('input:checked')).map(cb => cb.value);

    try {
        const updatedGame = await window.electronAPI.updateGameCategories(selectedGame.id, checked);
        if (updatedGame) {
            selectedGame = updatedGame;
            const index = allGames.findIndex(g => g.id === updatedGame.id);
            if (index !== -1) allGames[index] = updatedGame;
            showToast('Categories updated!', 'success');
            filterAndRenderGames(true);
        }
    } catch (error) {
        showToast('Failed to update categories', 'error');
    }
}

function updateStatsDisplay(game) {
    const playtimeH = Math.round((game.playTime?.totalMinutes || 0) / 60);
    const ach = game.achievements || { unlocked: 0, total: 0 };
    const progress = ach.total > 0 ? (ach.unlocked / ach.total) * 100 : 0;

    // Build Stats Grid
    const detailsContainer = document.querySelector('.modal-details');
    // Remove old stats if they exist
    const oldStats = document.querySelector('.stats-panel');
    if (oldStats) oldStats.remove();

    const statsPanel = document.createElement('div');
    statsPanel.className = 'stats-panel';
    statsPanel.innerHTML = `
        <div class="stats-header">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
            Game Statistics
        </div>
        <div class="stats-grid">
            <div class="stat-card">
                <span class="stat-icon">🕒</span>
                <span class="stat-value">${playtimeH}h</span>
                <span class="stat-label">Play Time</span>
            </div>
            <div class="stat-card">
                <span class="stat-icon">🏆</span>
                <div class="stat-value">${ach.unlocked}/${ach.total}</div>
                <span class="stat-label">Achievements</span>
                ${ach.total > 0 ? `
                <div class="achievement-progress-container">
                    <div class="achievement-progress-bar" style="width: ${progress}%"></div>
                </div>` : ''}
            </div>
            <div class="stat-card">
                <span class="stat-icon">📅</span>
                <span class="stat-value">${game.lastPlayed ? new Date(game.lastPlayed).toLocaleDateString() : 'Never'}</span>
                <span class="stat-label">Last Played</span>
            </div>
            <div class="stat-card">
                <span class="stat-icon">🏷️</span>
                <span class="stat-value" title="${game.launcher}">${launcherConfig[game.launcher]?.name || game.launcher}</span>
                <span class="stat-label">Platform</span>
            </div>
        </div>
    `;

    // Insert after path
    const pathElem = document.querySelector('.modal-path');
    if (pathElem) {
        pathElem.insertAdjacentElement('afterend', statsPanel);
    } else {
        detailsContainer.appendChild(statsPanel);
    }
}

async function fetchAchievements(game) {
    if (!game || !game.id) {
        return; // Guard against undefined game data
    }
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

async function searchAllArtwork() {
    let updated = 0;
    const gamesToProcess = allGames.filter(g => !g.coverImage || g.coverImage.includes('placeholder'));

    if (gamesToProcess.length === 0) {
        showToast('All games already have covers!', 'info');
        return;
    }

    showToast(`Starting bulk search for ${gamesToProcess.length} games...`, 'info');

    for (const game of gamesToProcess) {
        try {
            const updatedGame = await window.electronAPI.searchArtwork(game.name, game.id);
            if (updatedGame && updatedGame.coverImage) {
                const index = allGames.findIndex(g => g.id === game.id);
                if (index !== -1) {
                    allGames[index] = updatedGame;
                }
                updated++;
            }
        } catch (e) {
            console.error(`Failed to find artwork for ${game.name}:`, e);
        }
    }

    filterAndRenderGames();
    showToast(`Bulk search complete! Updated ${updated} covers.`, 'success');
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

// ===== STEAM & BACKUP HELPERS =====

// Show Steam connection status
function showSteamStatus(message, type) {
    const statusDiv = document.getElementById('steamConnectionStatus');
    if (!statusDiv) return;

    statusDiv.style.display = 'block';
    statusDiv.textContent = message;

    statusDiv.style.backgroundColor = type === 'success' ? 'rgba(16, 185, 129, 0.2)' :
        type === 'error' ? 'rgba(239, 68, 68, 0.2)' :
            'rgba(59, 130, 246, 0.2)';
    statusDiv.style.color = type === 'success' ? '#10b981' :
        type === 'error' ? '#ef4444' :
            '#3b82f6';
    statusDiv.style.border = `1px solid ${statusDiv.style.color}`;
}

// Load existing Steam credentials
async function loadSteamCredentials() {
    try {
        const creds = await window.electronAPI.getSteamCredentials();
        if (creds) {
            if (creds.apiKey) {
                document.getElementById('steamApiKeyInput').value = creds.apiKey;
            }
            if (creds.steamId64) {
                document.getElementById('steamId64Input').value = creds.steamId64;
            }
        }
    } catch (e) {
        console.error('Failed to load Steam credentials:', e);
    }
}

// Load backups list
async function loadBackupsList() {
    try {
        const backups = await window.electronAPI.getDatabaseBackups();
        const select = document.getElementById('backupSelect');
        if (!select) return;

        // Clear existing options except first
        while (select.options.length > 1) {
            select.remove(1);
        }

        // Add backup options
        backups.forEach(backup => {
            const option = document.createElement('option');
            option.value = backup.path;
            const date = new Date(backup.date);
            option.textContent = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
            select.appendChild(option);
        });
    } catch (e) {
        console.error('Failed to load backups:', e);
    }
}


// ===== YOUR TASTE ANALYTICS =====
// Get top 3 most-played games
function getTopGamesByPlaytime() {
    return [...allGames]
        .filter(g => g.playTime && g.playTime.totalMinutes > 0)
        .sort((a, b) => (b.playTime?.totalMinutes || 0) - (a.playTime?.totalMinutes || 0))
        .slice(0, 3);
}

// Get top launchers by playtime
function getTopLaunchersByPlaytime() {
    const launcherStats = {};

    allGames.forEach(game => {
        const launcher = game.launcher || 'Unknown';
        const playtime = game.playTime?.totalMinutes || 0;
        if (!launcherStats[launcher]) {
            launcherStats[launcher] = { playtime: 0, gameCount: 0 };
        }
        launcherStats[launcher].playtime += playtime;
        launcherStats[launcher].gameCount += 1;
    });

    return Object.entries(launcherStats)
        .map(([launcher, stats]) => ({ launcher, ...stats }))
        .filter(l => l.playtime > 0)
        .sort((a, b) => b.playtime - a.playtime)
        .slice(0, 5);
}

// Render Your Taste view (analytics overview)
function renderYourTasteView() {
    gamesGrid.innerHTML = '';
    gamesGrid.style.display = 'grid';

    const tasteContainer = document.createElement('div');
    tasteContainer.style.gridColumn = '1 / -1';
    tasteContainer.style.padding = '20px';
    tasteContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
    tasteContainer.style.borderRadius = '12px';
    tasteContainer.style.border = '1px solid rgba(255, 255, 255, 0.1)';

    const topGames = getTopGamesByPlaytime();
    const topLaunchers = getTopLaunchersByPlaytime();

    // Top Games Section
    if (topGames.length > 0) {
        const gamesSection = document.createElement('div');
        gamesSection.style.marginBottom = '30px';

        const gamesTitle = document.createElement('h3');
        gamesTitle.textContent = '🎮 Your Most Played Games';
        gamesTitle.style.color = 'var(--accent-color)';
        gamesTitle.style.marginBottom = '15px';
        gamesTitle.style.fontSize = '14px';
        gamesSection.appendChild(gamesTitle);

        const gamesList = document.createElement('div');
        gamesList.style.display = 'flex';
        gamesList.style.flexDirection = 'column';
        gamesList.style.gap = '10px';

        topGames.forEach((game, idx) => {
            const gameItem = document.createElement('div');
            gameItem.style.display = 'flex';
            gameItem.style.alignItems = 'center';
            gameItem.style.padding = '12px';
            gameItem.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
            gameItem.style.borderRadius = '8px';
            gameItem.style.cursor = 'pointer';
            gameItem.style.transition = 'all 0.3s ease';

            gameItem.addEventListener('mouseenter', () => {
                gameItem.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                gameItem.style.transform = 'translateX(5px)';
            });

            gameItem.addEventListener('mouseleave', () => {
                gameItem.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                gameItem.style.transform = 'translateX(0)';
            });

            gameItem.addEventListener('click', () => openGameModal(game));

            const rank = document.createElement('span');
            rank.textContent = `#${idx + 1}`;
            rank.style.marginRight = '12px';
            rank.style.color = 'var(--accent-color)';
            rank.style.fontWeight = 'bold';
            rank.style.minWidth = '30px';

            const gameInfo = document.createElement('div');
            gameInfo.style.flex = '1';

            const gameName = document.createElement('div');
            gameName.textContent = game.name;
            gameName.style.fontWeight = '500';
            gameName.style.marginBottom = '4px';

            const gameTime = document.createElement('div');
            gameTime.textContent = formatPlayTime(game.playTime?.totalMinutes || 0);
            gameTime.style.fontSize = '12px';
            gameTime.style.color = 'var(--text-secondary)';

            gameInfo.appendChild(gameName);
            gameInfo.appendChild(gameTime);

            gameItem.appendChild(rank);
            gameItem.appendChild(gameInfo);
            gamesList.appendChild(gameItem);
        });

        gamesSection.appendChild(gamesList);
        tasteContainer.appendChild(gamesSection);
    }

    // Top Launchers Section
    if (topLaunchers.length > 0) {
        const launchersSection = document.createElement('div');

        const launchersTitle = document.createElement('h3');
        launchersTitle.textContent = '🚀 Favorite Platforms';
        launchersTitle.style.color = 'var(--accent-color)';
        launchersTitle.style.marginBottom = '15px';
        launchersTitle.style.fontSize = '14px';
        launchersSection.appendChild(launchersTitle);

        const launchersList = document.createElement('div');
        launchersList.style.display = 'grid';
        launchersList.style.gridTemplateColumns = 'repeat(auto-fit, minmax(150px, 1fr))';
        launchersList.style.gap = '10px';

        topLaunchers.forEach((item) => {
            const launcherItem = document.createElement('div');
            launcherItem.style.padding = '12px';
            launcherItem.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
            launcherItem.style.borderRadius = '8px';
            launcherItem.style.textAlign = 'center';
            launcherItem.style.transition = 'all 0.3s ease';

            launcherItem.addEventListener('mouseenter', () => {
                launcherItem.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                launcherItem.style.transform = 'translateY(-3px)';
            });

            launcherItem.addEventListener('mouseleave', () => {
                launcherItem.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                launcherItem.style.transform = 'translateY(0)';
            });

            const launcherName = document.createElement('div');
            launcherName.textContent = launcherConfig[item.launcher]?.name || item.launcher;
            launcherName.style.fontWeight = '500';
            launcherName.style.marginBottom = '8px';

            const launcherStats = document.createElement('div');
            launcherStats.style.fontSize = '12px';
            launcherStats.style.color = 'var(--text-secondary)';
            launcherStats.innerHTML = `${formatPlayTime(item.playtime)} <br> ${item.gameCount} game${item.gameCount > 1 ? 's' : ''}`;

            launcherItem.appendChild(launcherName);
            launcherItem.appendChild(launcherStats);
            launchersList.appendChild(launcherItem);
        });

        launchersSection.appendChild(launchersList);
        tasteContainer.appendChild(launchersSection);
    }

    gamesGrid.appendChild(tasteContainer);
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

// ===== MULTI-SELECT FUNCTIONALITY =====
function toggleMultiSelectMode() {
    multiSelectMode = !multiSelectMode;
    selectedGameIds.clear();

    const toggleBtn = document.getElementById('toggleMultiSelectBtn');
    const multiSelectControls = document.getElementById('multiSelectControls');
    const bulkActionsBar = document.getElementById('bulkActionsBar');

    if (multiSelectMode) {
        toggleBtn.style.backgroundColor = 'var(--accent-color)';
        toggleBtn.style.color = 'white';
        multiSelectControls.style.display = 'flex';
        bulkActionsBar.style.display = 'block';
    } else {
        toggleBtn.style.backgroundColor = '';
        toggleBtn.style.color = '';
        multiSelectControls.style.display = 'none';
        bulkActionsBar.style.display = 'none';
    }

    updateSelectedCount();
    filterAndRenderGames(true);
}

function selectAllGames() {
    selectedGameIds.clear();
    filteredGames.forEach(game => selectedGameIds.add(game.id));
    updateSelectedCount();
    filterAndRenderGames(true);
}

function deselectAllGames() {
    selectedGameIds.clear();
    updateSelectedCount();
    filterAndRenderGames(true);
}

function updateSelectedCount() {
    const count = selectedGameIds.size;
    document.getElementById('selectedCount').textContent = `${count} selected`;
    document.getElementById('bulkSelectedCount').textContent = `${count} game${count !== 1 ? 's' : ''} selected`;
}

function toggleGameSelection(gameId) {
    if (selectedGameIds.has(gameId)) {
        selectedGameIds.delete(gameId);
    } else {
        selectedGameIds.add(gameId);
    }
    updateSelectedCount();

    // Update the visual state of the card
    const card = document.querySelector(`.game-card[data-game-id="${gameId}"]`);
    if (card) {
        card.classList.toggle('selected', selectedGameIds.has(gameId));
    }
}

async function bulkFavorite(isFavorite) {
    if (selectedGameIds.size === 0) {
        showToast('No games selected', 'info');
        return;
    }

    const gameIds = Array.from(selectedGameIds);
    let updated = 0;

    for (const gameId of gameIds) {
        try {
            const game = allGames.find(g => g.id === gameId);
            if (game && game.isFavorite !== isFavorite) {
                await window.electronAPI.toggleFavorite(gameId);
                const index = allGames.findIndex(g => g.id === gameId);
                if (index !== -1) {
                    allGames[index].isFavorite = isFavorite;
                }
                updated++;
            }
        } catch (error) {
            console.error(`Failed to update favorite for game ${gameId}:`, error);
        }
    }

    updateCounts();
    filterAndRenderGames(true);
    showToast(`${updated} game${updated !== 1 ? 's' : ''} ${isFavorite ? 'favorited' : 'unfavorited'}`, 'success');

    // Auto-close multi-select mode after action
    if (multiSelectMode) {
        toggleMultiSelectMode();
    }
}

function openBulkLauncherModal() {
    if (selectedGameIds.size === 0) {
        showToast('No games selected', 'info');
        return;
    }

    document.getElementById('bulkLauncherModal').classList.add('active');
}

function closeBulkLauncherModal() {
    document.getElementById('bulkLauncherModal').classList.remove('active');
}

// Bulk Categories Modal
async function openBulkCategoriesModal() {
    if (selectedGameIds.size === 0) {
        showToast('No games selected', 'info');
        return;
    }

    // Populate categories checkboxes
    const container = document.getElementById('bulkCategoriesList');
    if (!container) return;

    try {
        const categories = await window.electronAPI.getCategories();
        container.innerHTML = '';

        categories.forEach(cat => {
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.alignItems = 'center';
            wrapper.style.gap = '8px';
            wrapper.style.background = 'rgba(255,255,255,0.05)';
            wrapper.style.padding = '8px 12px';
            wrapper.style.borderRadius = '8px';
            wrapper.style.marginBottom = '6px';

            wrapper.innerHTML = `
                <input type="checkbox" value="${cat}" id="bulk_cat_${cat}" style="cursor: pointer;">
                <label for="bulk_cat_${cat}" style="cursor: pointer; flex: 1; font-size: 13px;">${cat}</label>
            `;
            container.appendChild(wrapper);
        });

        if (categories.length === 0) {
            container.innerHTML = '<p style="color: var(--text-tertiary); font-size: 13px;">No categories available. Create some first!</p>';
        }

        document.getElementById('bulkCategoriesModal').classList.add('active');
    } catch (error) {
        showToast('Failed to load categories', 'error');
    }
}

function closeBulkCategoriesModal() {
    document.getElementById('bulkCategoriesModal').classList.remove('active');
}

async function confirmBulkCategoriesChange() {
    const container = document.getElementById('bulkCategoriesList');
    const checked = Array.from(container.querySelectorAll('input:checked')).map(cb => cb.value);
    const gameIds = Array.from(selectedGameIds);

    if (gameIds.length === 0) {
        closeBulkCategoriesModal();
        return;
    }

    let updated = 0;

    for (const gameId of gameIds) {
        try {
            const game = allGames.find(g => g.id === gameId);
            if (game) {
                // Merge existing categories with new ones
                const existingCategories = game.categories || [];
                const mergedCategories = [...new Set([...existingCategories, ...checked])];

                const updatedGame = await window.electronAPI.updateGameCategories(gameId, mergedCategories);
                if (updatedGame) {
                    const index = allGames.findIndex(g => g.id === gameId);
                    if (index !== -1) {
                        allGames[index] = updatedGame;
                    }
                    updated++;
                }
            }
        } catch (error) {
            console.error(`Failed to update categories for game ${gameId}:`, error);
        }
    }

    closeBulkCategoriesModal();
    filterAndRenderGames(true);
    showToast(`Updated categories for ${updated} game${updated !== 1 ? 's' : ''}`, 'success');

    // Auto-close multi-select mode after action
    if (multiSelectMode) {
        toggleMultiSelectMode();
    }
}

async function confirmBulkLauncherChange() {
    const newLauncher = document.getElementById('bulkLauncherSelect').value;
    const gameIds = Array.from(selectedGameIds);

    if (gameIds.length === 0) {
        closeBulkLauncherModal();
        return;
    }

    let updated = 0;

    for (const gameId of gameIds) {
        try {
            const updatedGame = await window.electronAPI.updateLauncher(gameId, newLauncher);
            if (updatedGame) {
                const index = allGames.findIndex(g => g.id === gameId);
                if (index !== -1) {
                    allGames[index] = updatedGame;
                }
                updated++;
            }
        } catch (error) {
            console.error(`Failed to update launcher for game ${gameId}:`, error);
        }
    }

    closeBulkLauncherModal();
    filterAndRenderGames(true);
    showToast(`Updated launcher for ${updated} game${updated !== 1 ? 's' : ''}`, 'success');
}

async function bulkDelete() {
    if (selectedGameIds.size === 0) {
        showToast('No games selected', 'info');
        return;
    }

    const count = selectedGameIds.size;
    if (!confirm(`Remove ${count} game${count !== 1 ? 's' : ''} from your library?`)) return;

    const gameIds = Array.from(selectedGameIds);
    let deleted = 0;

    for (const gameId of gameIds) {
        try {
            await window.electronAPI.deleteGame(gameId);
            allGames = allGames.filter(g => g.id !== gameId);
            deleted++;
        } catch (error) {
            console.error(`Failed to delete game ${gameId}:`, error);
        }
    }

    selectedGameIds.clear();
    updateSelectedCount();
    updateCounts();
    filterAndRenderGames();
    showToast(`${deleted} game${deleted !== 1 ? 's' : ''} removed`, 'success');

    // Auto-close multi-select mode after action
    if (multiSelectMode) {
        toggleMultiSelectMode();
    }
}

// ===== STATISTICS & RECOMMENDATIONS =====

function renderStatistics() {
    const games = allGames.filter(g => g.itemType !== 'app');

    // 1. Total Games Count
    const totalGamesEl = document.getElementById('totalGamesCount');
    if (totalGamesEl) totalGamesEl.textContent = games.length;

    // 2. Total Playtime - Calculate properly
    let totalMinutes = 0;
    games.forEach(g => {
        // Handle different playtime formats
        if (g.playTime && typeof g.playTime === 'object') {
            totalMinutes += g.playTime.totalMinutes || 0;
        } else if (typeof g.playTime === 'number') {
            totalMinutes += g.playTime;
        } else if (g.playtime) {
            // Alternative property name
            totalMinutes += g.playtime || 0;
        }
    });
    const totalHours = Math.floor(totalMinutes / 60);
    const totalPlaytimeEl = document.getElementById('totalPlaytime');
    if (totalPlaytimeEl) {
        if (totalHours >= 1000) {
            totalPlaytimeEl.textContent = `${(totalHours / 1000).toFixed(1)}k h`;
        } else {
            totalPlaytimeEl.textContent = `${totalHours}h`;
        }
    }

    // 3. Most Played Game - Better extraction
    const sortedByPlaytime = [...games].sort((a, b) => {
        const aTime = a.playTime?.totalMinutes || a.playTime || a.playtime || 0;
        const bTime = b.playTime?.totalMinutes || b.playTime || b.playtime || 0;
        return bTime - aTime;
    });
    const mostPlayedEl = document.getElementById('mostPlayedGame');
    if (mostPlayedEl && sortedByPlaytime.length > 0) {
        const topGame = sortedByPlaytime[0];
        const topPlaytime = topGame.playTime?.totalMinutes || topGame.playTime || topGame.playtime || 0;
        if (topPlaytime > 0) {
            mostPlayedEl.textContent = topGame.name.length > 15
                ? topGame.name.substring(0, 15) + '...'
                : topGame.name;
        } else {
            mostPlayedEl.textContent = 'No data';
        }
    }

    // 4. Recently Added (This Month)
    const now = new Date();
    const thisMonth = games.filter(g => {
        if (!g.addedAt) return false;
        const addedDate = new Date(g.addedAt);
        return addedDate.getMonth() === now.getMonth() && addedDate.getFullYear() === now.getFullYear();
    });
    const recentlyAddedEl = document.getElementById('recentlyAddedCount');
    if (recentlyAddedEl) recentlyAddedEl.textContent = thisMonth.length;

    // 5. Launcher Breakdown
    const launcherBreakdown = document.getElementById('launcherBreakdown');
    if (launcherBreakdown) {
        const launcherCounts = {};
        games.forEach(g => {
            const launcher = launcherConfig[g.launcher]?.name || g.launcher || 'Unknown';
            launcherCounts[launcher] = (launcherCounts[launcher] || 0) + 1;
        });

        const sortedLaunchers = Object.entries(launcherCounts)
            .sort((a, b) => b[1] - a[1]);

        launcherBreakdown.innerHTML = sortedLaunchers.map(([launcher, count]) => `
            <div class="launcher-row">
                <span class="launcher-name">${launcher}</span>
                <div class="launcher-bar-container">
                    <div class="launcher-bar" style="width: ${(count / games.length) * 100}%"></div>
                </div>
                <span class="launcher-count">${count}</span>
            </div>
        `).join('');
    }

    // 6. Top 5 Most Played
    const topPlayedList = document.getElementById('topPlayedList');
    if (topPlayedList) {
        const top5 = sortedByPlaytime.filter(g => {
            const time = g.playTime?.totalMinutes || g.playTime || g.playtime || 0;
            return time > 0;
        }).slice(0, 5);

        if (top5.length === 0) {
            topPlayedList.innerHTML = '<div style="color: var(--text-tertiary); padding: 12px; font-size: 13px;">No playtime data yet. Play some games!</div>';
        } else {
            topPlayedList.innerHTML = top5.map((game, index) => {
                const minutes = game.playTime?.totalMinutes || game.playTime || game.playtime || 0;
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                const timeDisplay = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                let displayCover = game.coverImage || '';
                if (displayCover && !displayCover.startsWith('http') && !displayCover.startsWith('data:')) {
                    displayCover = 'file://' + displayCover.replace(/\\/g, '/');
                }
                return `
                    <div class="top-played-row" onclick="openGameModal('${game.id}')">
                        <span class="top-rank">#${index + 1}</span>
                        <div class="top-cover" style="background-image: url('${displayCover}')"></div>
                        <span class="top-name">${game.name}</span>
                        <span class="top-hours">${timeDisplay}</span>
                    </div>
                `;
            }).join('');
        }
    }

    // 7. Recently Played Games
    renderRecentlyPlayedStats();

    // 8. Next Up Recommendations
    renderNextUp();
}

function renderRecentlyPlayedStats() {
    const recentlyPlayedContainer = document.getElementById('recentlyPlayedList');
    if (!recentlyPlayedContainer) return;

    const games = allGames.filter(g => g.itemType !== 'app' && g.lastPlayed);
    const sortedByLastPlayed = [...games].sort((a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed)).slice(0, 5);

    if (sortedByLastPlayed.length === 0) {
        recentlyPlayedContainer.innerHTML = '<div style="color: var(--text-tertiary); padding: 12px; font-size: 13px;">No recently played games yet.</div>';
        return;
    }

    recentlyPlayedContainer.innerHTML = sortedByLastPlayed.map(game => {
        const minutes = game.playTime?.totalMinutes || game.playTime || game.playtime || 0;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        const timeDisplay = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        let displayCover = game.coverImage || '';
        if (displayCover && !displayCover.startsWith('http') && !displayCover.startsWith('data:')) {
            displayCover = 'file://' + displayCover.replace(/\\/g, '/');
        }
        const lastPlayedText = formatRelativeTime(game.lastPlayed);
        return `
            <div class="recently-played-row" onclick="openGameModal('${game.id}')">
                <div class="recently-played-cover" style="background-image: url('${displayCover}')"></div>
                <div class="recently-played-info">
                    <span class="recently-played-name">${game.name}</span>
                    <span class="recently-played-time">${lastPlayedText} • ${timeDisplay}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderNextUp() {
    const nextUpList = document.getElementById('nextUpGames');
    if (!nextUpList) return;
    nextUpList.innerHTML = '';

    const games = allGames.filter(g => g.itemType !== 'app');

    // 1. "Short & Sweet" - Games you can finish quickly (Estimated < 5h or low playTime)
    const shortAndSweet = games
        .filter(g => {
            const mins = g.playTime?.totalMinutes || 0;
            return mins < 300 && mins > 0;
        })
        .slice(0, 2);

    // 2. "Backlog Boss" - Owned but never played (0 playtime)
    const backlogBoss = games
        .filter(g => (g.playTime?.totalMinutes || 0) === 0)
        .sort((a, b) => new Date(a.addedAt || 0) - new Date(b.addedAt || 0))
        .slice(0, 2);

    // 3. "One More Turn" - Most played genre / Most Played recently
    const oneMoreTurn = games
        .filter(g => (g.playTime?.totalMinutes || 0) > 600) // > 10h
        .sort((a, b) => (b.playTime?.totalMinutes || 0) - (a.playTime?.totalMinutes || 0))
        .slice(0, 2);

    const recommendations = [
        { title: 'Short & Sweet', games: shortAndSweet, sub: 'Quick sessions' },
        { title: 'Backlog Boss', games: backlogBoss, sub: 'Start your journey' },
        { title: 'One More Turn', games: oneMoreTurn, sub: 'Your favorites' }
    ];

    recommendations.forEach(rec => {
        if (rec.games.length === 0) return;

        const section = document.createElement('div');
        section.className = 'next-up-section';
        section.innerHTML = `
            <div class="next-up-header">
                <span class="next-up-title">${rec.title}</span>
                <span class="next-up-sub">${rec.sub}</span>
            </div>
            <div class="next-up-row">
                ${rec.games.map(g => {
            let displayCover = g.coverImage || '';
            if (displayCover && !displayCover.startsWith('http') && !displayCover.startsWith('data:')) {
                displayCover = 'file://' + displayCover.replace(/\\/g, '/');
            } else if (!displayCover) {
                displayCover = '../../assets/placeholder.png';
            }
            return `
                    <div class="next-up-card" onclick="openGameModal('${g.id}')">
                        <img src="${displayCover}" alt="${g.name}">
                        <div class="next-up-name">${g.name}</div>
                    </div>
                `;
        }).join('')}
            </div>
        `;
        nextUpList.appendChild(section);
    });
}

async function renderCategories() {
    const grid = document.getElementById('categoriesGrid');
    if (!grid) return;

    try {
        const categories = await window.electronAPI.getCategories();
        grid.innerHTML = '';

        if (categories.length === 0) {
            grid.innerHTML = '<div style="color: var(--text-secondary); padding: 20px;">No custom categories yet.</div>';
        }

        categories.forEach(cat => {
            const count = allGames.filter(g => g.categories && g.categories.includes(cat)).length;
            const card = document.createElement('div');
            card.className = 'category-card';
            card.innerHTML = `
                <div class="category-name">${cat}</div>
                <div class="category-count">${count} Games</div>
                <div class="category-actions">
                    <button class="text-btn rename-cat-btn" data-category="${cat}">Rename</button>
                    <button class="text-btn danger delete-cat-btn" data-category="${cat}">Delete</button>
                </div>
            `;

            // Rename listener
            const renameBtn = card.querySelector('.rename-cat-btn');
            renameBtn.onclick = (e) => {
                e.stopPropagation();
                renameCategory(cat);
            };

            // Delete listener
            const deleteBtn = card.querySelector('.delete-cat-btn');
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                deleteCategory(cat);
            };

            card.onclick = (e) => {
                currentView = 'all';
                currentLauncher = 'all';
                currentCategory = cat;
                document.getElementById('sectionTitle').textContent = cat;

                // Update sidebar to show active category badge and clear button
                updateSidebarCategories();

                // Switch to All Games view and filter
                document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
                document.querySelector('[data-view="all"]').classList.add('active');

                // Show the games grid
                const gamesGrid = document.getElementById('gamesGrid');
                const statsContainer = document.getElementById('statisticsContainer');
                const categoriesContainer = document.getElementById('categoriesContainer');
                const viewControls = document.querySelector('.view-controls');

                gamesGrid.style.display = 'grid';
                if (statsContainer) statsContainer.style.display = 'none';
                if (categoriesContainer) categoriesContainer.style.display = 'none';
                if (viewControls) viewControls.style.display = 'flex';

                filterAndRenderGames();
            };
            grid.appendChild(card);
        });

        // Add "Create New" card
        const addCard = document.createElement('div');
        addCard.className = 'category-card create-new';
        addCard.id = 'createNewCategoryCard';
        addCard.style.border = '2px dashed rgba(255,255,255,0.1)';
        addCard.style.background = 'transparent';
        addCard.innerHTML = `
            <div class="create-new-content" id="createCatPlaceholder">
                <div style="font-size: 24px; margin-bottom: 8px;">+</div>
                <div class="category-name">Create Category</div>
            </div>
            <div class="create-new-input-container" id="createCatInputRow" style="display: none; width: 100%;">
                <input type="text" id="newCatNameInput" placeholder="Category Name..." 
                    style="width: 100%; padding: 10px; background: rgba(0,0,0,0.3); border: 1px solid var(--accent-primary); border-radius: 8px; color: white; margin-bottom: 10px;">
                <div style="display: flex; gap: 8px;">
                    <button class="action-btn primary" id="saveNewCatBtn" style="flex: 1; padding: 6px;">Save</button>
                    <button class="action-btn" id="cancelNewCatBtn" style="flex: 1; padding: 6px;">Cancel</button>
                </div>
            </div>
        `;

        addCard.onclick = (e) => {
            const placeholder = document.getElementById('createCatPlaceholder');
            const inputRow = document.getElementById('createCatInputRow');
            const input = document.getElementById('newCatNameInput');

            if (placeholder.style.display !== 'none') {
                placeholder.style.display = 'none';
                inputRow.style.display = 'block';
                input.focus();
            }
        };

        grid.appendChild(addCard);

        // Attach listeners for the inline creation
        document.getElementById('cancelNewCatBtn').onclick = (e) => {
            e.stopPropagation();
            renderCategories();
        };

        document.getElementById('saveNewCatBtn').onclick = async (e) => {
            e.stopPropagation();
            const name = document.getElementById('newCatNameInput').value;
            if (name && name.trim()) {
                await window.electronAPI.addCategory(name.trim());
                showToast(`Category "${name}" created!`, 'success');
                renderCategories();
                updateSidebarCategories();
            }
        };

        // Allow Enter key
        document.getElementById('newCatNameInput').onkeydown = (e) => {
            if (e.key === 'Enter') document.getElementById('saveNewCatBtn').click();
            if (e.key === 'Escape') document.getElementById('cancelNewCatBtn').click();
        };

    } catch (error) {
        console.error('Failed to render categories', error);
    }
}

async function createCategory() {
    // If we're in the categories view, just focus the inline input
    if (currentView === 'categories') {
        const card = document.getElementById('createNewCategoryCard');
        if (card) {
            card.click(); // Trigger the inline expansion
            return;
        }
    }

    // Otherwise (from sidebar or elsewhere), use the prompt as a fallback
    const name = prompt('Enter name for the new category:');
    if (name && name.trim()) {
        try {
            await window.electronAPI.addCategory(name.trim());
            showToast(`Category "${name}" created!`, 'success');
            if (currentView === 'categories') renderCategories();
            updateSidebarCategories();
        } catch (error) {
            showToast('Failed to create category', 'error');
        }
    }
}

async function deleteCategory(name) {
    if (!confirm(`Are you sure you want to delete the category "${name}"? Games will not be deleted.`)) return;
    try {
        await window.electronAPI.deleteCategory(name);
        showToast(`Category "${name}" deleted.`, 'success');
        renderCategories();
        updateSidebarCategories();
    } catch (error) {
        showToast('Failed to delete category', 'error');
    }
}

async function renameCategory(oldName) {
    const newName = prompt(`Enter new name for category "${oldName}":`, oldName);
    if (newName && newName.trim() && newName.trim() !== oldName) {
        try {
            await window.electronAPI.renameCategory(oldName, newName.trim());
            showToast('Category renamed!', 'success');
            renderCategories();
            updateSidebarCategories();
        } catch (error) {
            showToast('Failed to rename category', 'error');
        }
    }
}

async function updateSidebarCategories() {
    const container = document.getElementById('categoryFilters');
    const filtersSection = document.getElementById('categoryFiltersContainer');
    if (!container) return;

    try {
        container.innerHTML = '';

        // Only show categories section if a category is currently selected
        if (currentCategory && currentCategory !== 'all') {
            if (filtersSection) filtersSection.style.display = 'block';

            // Show current category as styled badge/bubble
            const activeBadge = document.createElement('div');
            activeBadge.className = 'active-category-badge';
            activeBadge.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <span>${currentCategory}</span>
            `;
            container.appendChild(activeBadge);

            // Add prominent "Clear Category" button 
            const clearBtn = document.createElement('button');
            clearBtn.className = 'clear-category-btn';
            clearBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
                <span>Clear Category</span>
            `;
            clearBtn.onclick = () => {
                SoundManager.play('click');
                currentCategory = 'all';
                document.getElementById('sectionTitle').textContent = 'All Games';
                updateSidebarCategories();
                filterAndRenderGames();
            };
            container.appendChild(clearBtn);
        } else {
            // Hide the categories section when no category is selected
            if (filtersSection) filtersSection.style.display = 'none';
        }
    } catch (error) {
        console.error('Failed to update sidebar categories', error);
    }
}
