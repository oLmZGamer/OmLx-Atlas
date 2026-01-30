const fs = require('fs');
const path = require('path');

class GameDatabase {
    constructor(userDataPath) {
        this.dataDir = userDataPath;
        this.gamesFile = path.join(userDataPath, 'games.json');
        this.settingsFile = path.join(userDataPath, 'settings.json');
        this.initialize();
    }

    initialize() {
        // Ensure data directory exists
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }

        // Initialize games file if it doesn't exist
        if (!fs.existsSync(this.gamesFile)) {
            this.saveGames([]);
        } else {
            // MIGRATION: Add missing fields to legacy games
            this.migrateGamesSchema();
        }

        // Initialize settings file with defaults
        if (!fs.existsSync(this.settingsFile)) {
            const defaultSettings = {
                theme: 'dark',
                showFavoritesFirst: true,
                defaultView: 'grid',
                gridSize: 'medium',
                backgroundMusic: false,
                autoScan: true,
                categories: ['Steam', 'Epic Games', 'Xbox', 'EA App', 'Ubisoft Connect', 'GOG', 'Desktop Apps', 'Uncategorized']
            };
            this.saveSettings(defaultSettings);
        }
    }

    // MIGRATION: Ensure all games have new fields (itemType, statsSource)
    migrateGamesSchema() {
        try {
            const games = this.loadGames();
            let needsSave = false;

            for (const game of games) {
                // Add itemType if missing (based on launcher)
                if (!game.itemType) {
                    if (['steam', 'epic', 'xbox', 'ea', 'ubisoft', 'gog'].includes(game.launcher)) {
                        game.itemType = 'game';
                    } else if (['desktop', 'manual'].includes(game.launcher)) {
                        game.itemType = 'app';
                    } else {
                        game.itemType = 'game'; // Default to game if unsure
                    }
                    needsSave = true;
                }

                // Add statsSource if missing
                if (!game.statsSource) {
                    game.statsSource = {
                        playtimeSource: game.launcher === 'steam' ? 'unknown' : 'atlas', // Steam could have launcher data
                        lastPlayedSource: 'atlas',
                        achievementsSource: game.launcher === 'steam' ? 'unknown' : 'atlas'
                    };
                    needsSave = true;
                }
            }

            if (needsSave) {
                console.log('Migrating games.json schema to include itemType and statsSource...');
                this.saveGames(games);
            }
        } catch (error) {
            console.error('Migration error:', error);
        }
    }

    // Games operations
    loadGames() {
        try {
            const data = fs.readFileSync(this.gamesFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading games:', error);
            return [];
        }
    }

    saveGames(games) {
        try {
            fs.writeFileSync(this.gamesFile, JSON.stringify(games, null, 2), 'utf8');
        } catch (error) {
            console.error('Error saving games:', error);
        }
    }

    getAllGames() {
        const games = this.loadGames();
        return games.map(game => ({
            ...game,
            lastPlayed: game.lastPlayed ? new Date(game.lastPlayed) : null
        })).sort((a, b) => a.name.localeCompare(b.name));
    }

    addGame(game) {
        const games = this.loadGames();
        const existingIndex = games.findIndex(g => g.id === game.id);

        const gameToSave = {
            ...game,
            lastPlayed: game.lastPlayed ? new Date(game.lastPlayed).toISOString() : null,
            addedAt: game.addedAt || new Date().toISOString(),
            playTime: game.playTime || { totalMinutes: 0, sessions: [] },
            achievements: game.achievements || { unlocked: 0, total: 0, list: [], lastUpdated: null }
        };

        if (existingIndex !== -1) {
            games[existingIndex] = gameToSave;
        } else {
            games.push(gameToSave);
        }

        this.saveGames(games);
        return game;
    }

    addGames(gamesList) {
        const games = this.loadGames();

        // Launcher to category mapping for auto-assignment
        const launcherCategoryMap = {
            'steam': 'Steam',
            'epic': 'Epic Games',
            'xbox': 'Xbox',
            'ea': 'EA App',
            'ubisoft': 'Ubisoft Connect',
            'gog': 'GOG',
            'desktop': 'Desktop Apps',
            'manual': 'Uncategorized'
        };

        for (const game of gamesList) {
            const existingIndex = games.findIndex(g => g.id === game.id);
            const isNewGame = existingIndex === -1;

            // Auto-assign category based on launcher for NEW games only
            let autoCategories = game.categories || [];
            if (isNewGame && game.launcher && launcherCategoryMap[game.launcher]) {
                const autoCategory = launcherCategoryMap[game.launcher];
                if (!autoCategories.includes(autoCategory)) {
                    autoCategories = [...autoCategories, autoCategory];
                }
            }

            const gameToSave = {
                ...game,
                lastPlayed: game.lastPlayed ? new Date(game.lastPlayed).toISOString() : null,
                addedAt: game.addedAt || new Date().toISOString(),
                playTime: game.playTime || { totalMinutes: 0, sessions: [] },
                achievements: game.achievements || { unlocked: 0, total: 0, list: [], lastUpdated: null },
                // Auto-assigned categories for new games
                categories: autoCategories,
                // NEW: Stats source tracking (where data comes from)
                statsSource: {
                    playtimeSource: game.statsSource?.playtimeSource || 'unknown', // 'launcher' | 'atlas' | 'unknown'
                    lastPlayedSource: game.statsSource?.lastPlayedSource || 'unknown',
                    achievementsSource: game.statsSource?.achievementsSource || 'unknown'
                },
                // NEW: Playtime status fields (official vs tracked_locally)
                playtimeData: {
                    official: game.playtimeData?.official || 0,
                    tracked_locally: game.playtimeData?.tracked_locally || 0,
                    status: game.playtimeData?.status || 'unavailable' // 'official' | 'tracked_locally' | 'unavailable'
                },
                // NEW: Platform-specific IDs
                platformIds: {
                    steam: game.platformIds?.steam || (game.launcher === 'steam' ? game.id.replace('steam_', '') : null),
                    epic: game.platformIds?.epic || (game.launcher === 'epic' ? game.epicAppName : null),
                    xbox: game.platformIds?.xbox || (game.launcher === 'xbox' ? game.packageFamilyName : null),
                    ea: game.platformIds?.ea || (game.launcher === 'ea' ? game.eaId : null),
                    ubisoft: game.platformIds?.ubisoft || (game.launcher === 'ubisoft' ? game.uplayId : null)
                },
                // NEW: itemType field (game vs app)
                itemType: game.itemType || 'game'
            };

            if (existingIndex !== -1) {
                // IMPORTANT: Preserve user overrides
                const existing = games[existingIndex];
                gameToSave.isFavorite = existing.isFavorite !== undefined ? existing.isFavorite : false;
                gameToSave.coverImage = existing.coverImage || gameToSave.coverImage;
                gameToSave.backgroundImage = existing.backgroundImage || gameToSave.backgroundImage;
                gameToSave.itemType = existing.itemType || gameToSave.itemType; // Preserve user's itemType override
                gameToSave.categories = existing.categories || gameToSave.categories; // Preserve user's category choices

                // Preserve playtime and achievements if user has already tracked them
                gameToSave.playTime = existing.playTime || gameToSave.playTime;
                gameToSave.achievements = existing.achievements || gameToSave.achievements;
                gameToSave.lastPlayed = existing.lastPlayed || gameToSave.lastPlayed;

                games[existingIndex] = gameToSave;
            } else {
                games.push(gameToSave);
            }
        }

        this.saveGames(games);
    }

    getGame(id) {
        const games = this.loadGames();
        const game = games.find(g => g.id === id);
        if (game) {
            return {
                ...game,
                lastPlayed: game.lastPlayed ? new Date(game.lastPlayed) : null
            };
        }
        return null;
    }

    updatePlayTime(gameId, minutesToAdd) {
        const games = this.loadGames();
        const index = games.findIndex(g => g.id === gameId);

        if (index !== -1) {
            if (!games[index].playTime) games[index].playTime = { totalMinutes: 0, sessions: [] };
            games[index].playTime.totalMinutes += minutesToAdd;
            games[index].playTime.sessions.push({
                date: new Date().toISOString(),
                duration: minutesToAdd
            });
            games[index].lastPlayed = new Date().toISOString();
            this.saveGames(games);
            return this.getGame(gameId);
        }
        return null;
    }

    updateAchievements(gameId, data) {
        const games = this.loadGames();
        const index = games.findIndex(g => g.id === gameId);

        if (index !== -1) {
            games[index].achievements = {
                unlocked: data.unlocked,
                total: data.total,
                list: data.list || [],
                lastUpdated: new Date().toISOString()
            };
            this.saveGames(games);
            return this.getGame(gameId);
        }
        return null;
    }

    updateLastPlayed(gameId) {
        const games = this.loadGames();
        const index = games.findIndex(g => g.id === gameId);

        if (index !== -1) {
            games[index].lastPlayed = new Date().toISOString();
            this.saveGames(games);
            return this.getGame(gameId);
        }
        return null;
    }

    toggleFavorite(gameId) {
        const games = this.loadGames();
        const index = games.findIndex(g => g.id === gameId);

        if (index !== -1) {
            games[index].isFavorite = !games[index].isFavorite;
            this.saveGames(games);
            return this.getGame(gameId);
        }
        return null;
    }

    deleteGame(gameId) {
        const games = this.loadGames();
        const filteredGames = games.filter(g => g.id !== gameId);
        this.saveGames(filteredGames);
        return { changes: games.length - filteredGames.length };
    }

    updateCoverImage(gameId, imagePath) {
        const games = this.loadGames();
        const index = games.findIndex(g => g.id === gameId);

        if (index !== -1) {
            games[index].coverImage = imagePath;
            this.saveGames(games);
            return this.getGame(gameId);
        }
        return null;
    }

    updateBackgroundImage(gameId, imagePath) {
        const games = this.loadGames();
        const index = games.findIndex(g => g.id === gameId);

        if (index !== -1) {
            games[index].backgroundImage = imagePath;
            this.saveGames(games);
            return this.getGame(gameId);
        }
        return null;
    }

    updateGameLauncher(gameId, newLauncher) {
        const games = this.loadGames();
        const index = games.findIndex(g => g.id === gameId);

        if (index !== -1) {
            games[index].launcher = newLauncher;
            games[index].manualLauncherOverride = true; // Track manual changes
            this.saveGames(games);
            return this.getGame(gameId);
        }
        return null;
    }

    // NEW: Update itemType (game vs app)
    updateItemType(gameId, itemType) {
        const games = this.loadGames();
        const index = games.findIndex(g => g.id === gameId);

        if (index !== -1) {
            games[index].itemType = itemType; // 'game' | 'app'
            this.saveGames(games);
            return this.getGame(gameId);
        }
        return null;
    }

    // NEW: Update game categories
    updateGameCategories(gameId, categories) {
        const games = this.loadGames();
        const index = games.findIndex(g => g.id === gameId);

        if (index !== -1) {
            games[index].categories = Array.isArray(categories) ? categories : [];
            this.saveGames(games);
            return this.getGame(gameId);
        }
        return null;
    }

    // NEW: Update stats source labels
    updateStatsSource(gameId, sourceInfo) {
        const games = this.loadGames();
        const index = games.findIndex(g => g.id === gameId);

        if (index !== -1) {
            if (!games[index].statsSource) {
                games[index].statsSource = {
                    playtimeSource: 'unknown',
                    lastPlayedSource: 'unknown',
                    achievementsSource: 'unknown'
                };
            }
            games[index].statsSource = { ...games[index].statsSource, ...sourceInfo };
            this.saveGames(games);
            return this.getGame(gameId);
        }
        return null;
    }

    // NEW: Update game stats from Steam API or other sources
    updateGameStats(gameId, stats) {
        const games = this.loadGames();
        const index = games.findIndex(g => g.id === gameId);

        if (index !== -1) {
            // Update playtime
            if (stats.playTime !== undefined) {
                if (!games[index].playTime) {
                    games[index].playTime = { totalMinutes: 0, sessions: [] };
                }
                games[index].playTime.totalMinutes = stats.playTime;
            }

            // Update last played
            if (stats.lastPlayed) {
                games[index].lastPlayed = stats.lastPlayed;
            }

            // Update stats source
            if (stats.statsSource) {
                games[index].statsSource = {
                    ...games[index].statsSource,
                    playtimeSource: stats.statsSource,
                    lastPlayedSource: stats.statsSource
                };
            }

            this.saveGames(games);
            return true;
        }
        return false;
    }

    // NEW: Steam credentials storage
    getSteamCredentials() {
        const settings = this.loadSettings();
        return {
            apiKey: settings.steamApiKey || null,
            steamId64: settings.steamId64 || null
        };
    }

    setSteamCredentials(apiKey, steamId64) {
        const settings = this.loadSettings();
        if (!settings.accounts) settings.accounts = {};
        settings.accounts.steam = { apiKey, steamId64 };
        // Keep legacy fields for compatibility for now
        settings.steamApiKey = apiKey;
        settings.steamId64 = steamId64;
        this.saveSettings(settings);
        return true;
    }

    // NEW: Multi-account management
    getPlatformAccount(platform) {
        const settings = this.loadSettings();
        if (!settings.accounts) return null;
        return settings.accounts[platform] || null;
    }

    setPlatformAccount(platform, accountData) {
        const settings = this.loadSettings();
        if (!settings.accounts) settings.accounts = {};
        settings.accounts[platform] = accountData;
        this.saveSettings(settings);
        return true;
    }

    // NEW: Detailed playtime update
    updateGamePlaytime(gameId, minutes, type = 'tracked_locally') {
        const games = this.loadGames();
        const index = games.findIndex(g => g.id === gameId);

        if (index !== -1) {
            const game = games[index];
            if (!game.playtimeData) {
                game.playtimeData = { official: 0, tracked_locally: 0, status: 'unavailable' };
            }

            if (type === 'official') {
                game.playtimeData.official = minutes;
                game.playtimeData.status = 'official';
            } else {
                game.playtimeData.tracked_locally += minutes;
                // Only upgrade status to tracked_locally if it was unavailable
                if (game.playtimeData.status === 'unavailable') {
                    game.playtimeData.status = 'tracked_locally';
                }
            }

            // Also update the main playTime object for compatibility with legacy UI
            if (!game.playTime) game.playTime = { totalMinutes: 0, sessions: [] };
            game.playTime.totalMinutes = game.playtimeData.official + game.playtimeData.tracked_locally;

            this.saveGames(games);
            return true;
        }
        return false;
    }

    // NEW: Database backup methods
    createBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(this.dataDir, 'backups');

        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const backupPath = path.join(backupDir, `games-backup-${timestamp}.json`);

        try {
            const gamesData = fs.readFileSync(this.gamesFile, 'utf8');
            fs.writeFileSync(backupPath, gamesData, 'utf8');

            // Cleanup old backups (keep last 5)
            this.cleanupOldBackups(backupDir, 5);

            return { success: true, path: backupPath, timestamp };
        } catch (error) {
            console.error('Backup failed:', error);
            return { success: false, error: error.message };
        }
    }

    cleanupOldBackups(backupDir, keepCount) {
        try {
            const files = fs.readdirSync(backupDir)
                .filter(f => f.startsWith('games-backup-') && f.endsWith('.json'))
                .map(f => ({
                    name: f,
                    path: path.join(backupDir, f),
                    time: fs.statSync(path.join(backupDir, f)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time);

            for (let i = keepCount; i < files.length; i++) {
                fs.unlinkSync(files[i].path);
            }
        } catch (e) {
            console.error('Cleanup failed:', e);
        }
    }

    getBackupsList() {
        const backupDir = path.join(this.dataDir, 'backups');

        if (!fs.existsSync(backupDir)) {
            return [];
        }

        try {
            return fs.readdirSync(backupDir)
                .filter(f => f.startsWith('games-backup-') && f.endsWith('.json'))
                .map(f => ({
                    name: f,
                    path: path.join(backupDir, f),
                    date: fs.statSync(path.join(backupDir, f)).mtime
                }))
                .sort((a, b) => b.date - a.date);
        } catch (e) {
            return [];
        }
    }

    restoreFromBackup(backupPath) {
        try {
            if (!fs.existsSync(backupPath)) {
                return { success: false, error: 'Backup file not found' };
            }

            // Validate JSON
            const data = fs.readFileSync(backupPath, 'utf8');
            JSON.parse(data); // Will throw if invalid

            // Create a backup of current state before restoring
            this.createBackup();

            // Restore
            fs.writeFileSync(this.gamesFile, data, 'utf8');

            return { success: true, restored: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    clearAllGames() {
        this.saveGames([]);
    }

    // Settings operations
    loadSettings() {
        try {
            const data = fs.readFileSync(this.settingsFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading settings:', error);
            return {};
        }
    }

    saveSettings(settings) {
        try {
            fs.writeFileSync(this.settingsFile, JSON.stringify(settings, null, 2), 'utf8');
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    getSettings() {
        return this.loadSettings();
    }

    updateSettings(newSettings) {
        const settings = this.loadSettings();
        const merged = { ...settings, ...newSettings };
        this.saveSettings(merged);
        return merged;
    }

    // NEW: Categories operations
    getCategories() {
        const settings = this.loadSettings();
        // Return default if missing
        if (!settings.categories) {
            settings.categories = ['Steam', 'Epic Games', 'Xbox', 'EA App', 'Ubisoft Connect', 'GOG', 'Desktop Apps', 'Uncategorized'];
            this.saveSettings(settings);
        }
        return settings.categories;
    }

    saveCategories(categories) {
        const settings = this.loadSettings();
        settings.categories = categories;
        this.saveSettings(settings);
    }

    addCategory(categoryName) {
        const categories = this.getCategories();
        if (!categories.includes(categoryName)) {
            categories.push(categoryName);
            this.saveCategories(categories);
            return true;
        }
        return false;
    }

    deleteCategory(categoryName) {
        let categories = this.getCategories();
        categories = categories.filter(c => c !== categoryName);
        this.saveCategories(categories);

        // Also remove this category from all games
        const games = this.loadGames();
        let changed = false;
        games.forEach(game => {
            if (game.categories && game.categories.includes(categoryName)) {
                game.categories = game.categories.filter(c => c !== categoryName);
                changed = true;
            }
        });
        if (changed) this.saveGames(games);
        return true;
    }

    renameCategory(oldName, newName) {
        if (!newName || !newName.trim()) return false;
        let categories = this.getCategories();
        const index = categories.indexOf(oldName);
        if (index !== -1) {
            categories[index] = newName.trim();
            this.saveCategories(categories);

            // Update games
            const games = this.loadGames();
            let changed = false;
            games.forEach(game => {
                if (game.categories && game.categories.includes(oldName)) {
                    game.categories = game.categories.map(c => c === oldName ? newName.trim() : c);
                    changed = true;
                }
            });
            if (changed) this.saveGames(games);
            return true;
        }
        return false;
    }

    restoreDefaultCategories() {
        const defaults = ['Steam', 'Epic Games', 'Xbox', 'EA App', 'Ubisoft Connect', 'GOG', 'Desktop Apps', 'Uncategorized'];
        this.saveCategories(defaults);
        return defaults;
    }

    close() {
        // No-op for JSON storage
    }
}

module.exports = { GameDatabase };
