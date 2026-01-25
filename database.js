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
        }

        // Initialize settings file with defaults
        if (!fs.existsSync(this.settingsFile)) {
            const defaultSettings = {
                theme: 'dark',
                showFavoritesFirst: true,
                defaultView: 'grid',
                gridSize: 'medium',
                backgroundMusic: false,
                autoScan: true
            };
            this.saveSettings(defaultSettings);
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

        for (const game of gamesList) {
            const existingIndex = games.findIndex(g => g.id === game.id);
            const gameToSave = {
                ...game,
                lastPlayed: game.lastPlayed ? new Date(game.lastPlayed).toISOString() : null,
                addedAt: game.addedAt || new Date().toISOString(),
                playTime: game.playTime || { totalMinutes: 0, sessions: [] },
                achievements: game.achievements || { unlocked: 0, total: 0, list: [], lastUpdated: null }
            };

            if (existingIndex !== -1) {
                // Preserve stats if existing
                gameToSave.playTime = games[existingIndex].playTime || gameToSave.playTime;
                gameToSave.achievements = games[existingIndex].achievements || gameToSave.achievements;
                gameToSave.lastPlayed = games[existingIndex].lastPlayed || gameToSave.lastPlayed;
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

    close() {
        // No-op for JSON storage
    }
}

module.exports = { GameDatabase };
