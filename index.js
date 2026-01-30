const { app, BrowserWindow, ipcMain, shell, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { GameScanner } = require('./gameScanner');
const { GameDatabase } = require('./database');
const logger = require('./logger');
const steamAPI = require('./steamAPI');
const epicAPI = require('./epicAPI');
const xboxAPI = require('./xboxAPI');
const DiscordRPC = require('discord-rpc');

let mainWindow;
let spotlightWindow;
let gameDatabase;
let gameScanner;
// ProcessWatcher instance defined later in file

// Discord RPC Configuration
// IMPORTANT: Replace this with your actual Discord Application ID from https://discord.com/developers/applications
const DISCORD_CLIENT_ID = '1466414716376055841'; // OmLx Atlas Discord App ID
const rpc = new DiscordRPC.Client({ transport: 'ipc' });
let rpcReady = false;

// Discord RPC Event Handlers
rpc.on('ready', () => {
    logger.success('Discord RPC connected!');
    rpcReady = true;
    // Set initial presence
    rpc.setActivity({
        details: 'Browsing Library',
        state: 'Viewing Games',
        startTimestamp: Date.now(),
        largeImageKey: 'atlas_logo',
        largeImageText: 'OmLx Atlas',
        instance: false,
    }).catch(err => logger.warn('Discord RPC initial activity failed', err));
});

rpc.on('disconnected', () => {
    logger.warn('Discord RPC disconnected');
    rpcReady = false;
});

// Connect to Discord
function connectDiscordRPC() {
    if (!DISCORD_CLIENT_ID || DISCORD_CLIENT_ID.startsWith('123456')) {
        logger.warn('Discord RPC: Invalid Client ID. Please set a valid Discord Application ID.');
        return;
    }
    rpc.login({ clientId: DISCORD_CLIENT_ID }).catch(err => {
        logger.warn('Discord RPC login failed (Discord may not be running):', err.message);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        minWidth: 1280,
        minHeight: 720,
        frame: false,
        icon: path.join(__dirname, 'assets/logo.png'),
        backgroundColor: '#0a0a0f',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        show: false
    });

    mainWindow.loadFile(path.join(__dirname, 'src/renderer/index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.maximize();
    });

    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }
}

function initializeServices() {
    const userDataPath = app.getPath('userData');
    gameDatabase = new GameDatabase(userDataPath);
    gameScanner = new GameScanner(gameDatabase);

    // Register Global Shortcut for Spotlight
    globalShortcut.register('Alt+Space', () => {
        if (spotlightWindow && spotlightWindow.isVisible()) {
            spotlightWindow.hide();
        } else {
            createSpotlightWindow();
        }
    });
}

function setupIPCHandlers() {
    // Window controls
    ipcMain.handle('window:minimize', () => mainWindow.minimize());
    ipcMain.handle('window:maximize', () => {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    });
    ipcMain.handle('window:close', () => mainWindow.close());
    ipcMain.handle('window:fullscreen', () => {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
    });

    // Spotlight specific
    ipcMain.handle('spotlight:close', () => {
        if (spotlightWindow) spotlightWindow.hide();
    });

    ipcMain.handle('games:getAll', async () => {
        try {
            return gameDatabase.getAllGames();
        } catch (error) {
            logger.error('Failed to get all games from database', error);
            return [];
        }
    });

    ipcMain.handle('games:scan', async () => {
        try {
            logger.info('User initiated game scan');
            const results = await gameScanner.scanAllLaunchers();
            return results;
        } catch (error) {
            logger.error('Fatal error during game scan', error, true);
            throw error; // Propagate to renderer
        }
    });

    ipcMain.handle('games:launch', async (event, game) => {
        return launchGame(game);
    });

    ipcMain.handle('games:openLocation', async (event, gamePath) => {
        const directory = path.dirname(gamePath);
        shell.openPath(directory);
    });

    ipcMain.handle('games:openStore', async (event, game) => {
        return openInStore(game);
    });

    ipcMain.handle('games:addManual', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Select Game Executable',
            properties: ['openFile'],
            filters: [{ name: 'Executables', extensions: ['exe'] }]
        });

        if (!result.canceled && result.filePaths.length > 0) {
            const exePath = result.filePaths[0];
            const gameName = path.basename(exePath, '.exe');
            const game = {
                id: `manual_${Date.now()}`,
                name: gameName,
                executablePath: exePath,
                installPath: path.dirname(exePath),
                launcher: 'manual',
                lastPlayed: null,
                isFavorite: false,
                coverImage: null,
                backgroundImage: null
            };
            gameDatabase.addGame(game);
            return game;
        }
        return null;
    });

    ipcMain.handle('games:toggleFavorite', async (event, gameId) => {
        return gameDatabase.toggleFavorite(gameId);
    });

    ipcMain.handle('games:updateLastPlayed', async (event, gameId) => {
        return gameDatabase.updateLastPlayed(gameId);
    });

    ipcMain.handle('games:delete', async (event, gameId) => {
        return gameDatabase.deleteGame(gameId);
    });

    ipcMain.handle('games:updateCover', async (event, gameId) => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Select Cover Image',
            properties: ['openFile'],
            filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
        });
        if (!result.canceled && result.filePaths.length > 0) {
            return gameDatabase.updateCoverImage(gameId, result.filePaths[0]);
        }
        return null;
    });

    ipcMain.handle('games:searchArtwork', async (event, name, gameId) => {
        const metadata = await gameScanner.findArtworkBetter(name);
        if (metadata) {
            gameDatabase.updateCoverImage(gameId, metadata.cover);
            gameDatabase.updateBackgroundImage(gameId, metadata.background);
            return gameDatabase.getGame(gameId);
        }
        return null;
    });

    ipcMain.handle('games:updateLauncher', async (event, gameId, launcher) => {
        return gameDatabase.updateGameLauncher(gameId, launcher);
    });

    ipcMain.handle('settings:get', async () => {
        return gameDatabase.getSettings();
    });

    ipcMain.handle('settings:update', async (event, settings) => {
        return gameDatabase.updateSettings(settings);
    });

    ipcMain.handle('settings:selectBackground', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Select Background Image',
            properties: ['openFile'],
            filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
        });
        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths[0];
        }
        return null;
    });

    ipcMain.handle('games:getAchievements', async (event, game) => {
        return gameScanner.fetchAchievements(game);
    });

    ipcMain.handle('games:scanCustomFolder', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Select Folder to Scan for Apps/Games',
            properties: ['openDirectory']
        });

        if (!result.canceled && result.filePaths.length > 0) {
            const folderPath = result.filePaths[0];
            const detectedApps = await gameScanner.scanFolder(folderPath);

            if (detectedApps.length > 0) {
                // Enrich and add to database
                const enriched = await gameScanner.enrichGameMetadata(detectedApps);
                gameDatabase.addGames(enriched);
            }
            return detectedApps;
        }
        return [];
    });

    // NEW: Update itemType (game vs app)
    ipcMain.handle('games:updateItemType', async (event, gameId, itemType) => {
        return gameDatabase.updateItemType(gameId, itemType);
    });

    // NEW: Update categories for a game
    ipcMain.handle('games:updateCategories', async (event, gameId, categories) => {
        return gameDatabase.updateGameCategories(gameId, categories);
    });

    // NEW: Refresh stats from launcher (Steam, etc.)
    ipcMain.handle('games:refreshStats', async (event, game) => {
        console.log(`Refreshing stats for ${game.name} from ${game.launcher}...`);
        return gameDatabase.getGame(game.id);
    });

    // NEW: Clear all games from database
    ipcMain.handle('games:clearAll', async () => {
        const { response } = await dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: 'Delete All Games?',
            message: 'Are you sure you want to delete all games from your library?',
            detail: 'This action cannot be undone. Your actual game files will NOT be deleted.',
            buttons: ['Cancel', 'Yes, Delete All'],
            defaultId: 0,
            cancelId: 0
        });

        if (response === 1) {
            gameDatabase.clearAllGames();
            console.log('Cleared all games from database');
            return { success: true, cleared: true };
        }
        return { success: true, cleared: false };
    });

    // ===== CATEGORY HANDLERS =====

    ipcMain.handle('categories:get', async () => {
        return gameDatabase.getCategories();
    });

    ipcMain.handle('categories:add', async (event, name) => {
        logger.info(`Creating new category: ${name}`);
        return gameDatabase.addCategory(name);
    });

    ipcMain.handle('categories:delete', async (event, name) => {
        return gameDatabase.deleteCategory(name);
    });

    ipcMain.handle('categories:rename', async (event, oldName, newName) => {
        return gameDatabase.renameCategory(oldName, newName);
    });

    ipcMain.handle('categories:restoreDefault', async () => {
        return gameDatabase.restoreDefaultCategories();
    });

    // NEW: Scan for Apps (Actual app scan)
    ipcMain.handle('games:scanApps', async () => {
        try {
            logger.info('User initiated app scan');
            const results = await gameScanner.scanApps();
            return results;
        } catch (error) {
            logger.error('Fatal error during app scan', error, true);
            throw error;
        }
    });

    // NEW: Open external URL (Discord, Feedback, etc.)
    ipcMain.handle('shell:openExternal', async (event, url) => {
        try {
            await shell.openExternal(url);
            return { success: true };
        } catch (error) {
            logger.error('Failed to open external URL', error);
            return { success: false, error: error.message };
        }
    });

    // NEW: Search artwork for all games
    ipcMain.handle('games:searchAllArtwork', async () => {
        try {
            logger.info('User initiated bulk artwork search');
            const allGames = gameDatabase.getAllGames();
            const results = await gameScanner.searchArtworkForAllGames(allGames);
            return { success: true, ...results };
        } catch (error) {
            logger.error('Failed to search artwork for all games', error);
            return { success: false, error: error.message };
        }
    });

    // NEW: Get log file paths
    ipcMain.handle('logs:getPaths', async () => {
        return logger.getLogPaths();
    });

    // NEW: Open logs folder
    ipcMain.handle('logs:openFolder', async () => {
        try {
            logger.openLogsFolder();
            return { success: true };
        } catch (error) {
            logger.error('Failed to open logs folder', error);
            return { success: false, error: error.message };
        }
    });

    // ===== STEAM API HANDLERS =====

    // Get Steam credentials
    ipcMain.handle('steam:getCredentials', async () => {
        return gameDatabase.getSteamCredentials();
    });

    // Set Steam credentials
    ipcMain.handle('steam:setCredentials', async (event, apiKey, steamId64) => {
        try {
            gameDatabase.setSteamCredentials(apiKey, steamId64);
            steamAPI.setCredentials(apiKey, steamId64);
            logger.success('Steam credentials saved');
            return { success: true };
        } catch (error) {
            logger.error('Failed to save Steam credentials', error);
            return { success: false, error: error.message };
        }
    });

    // NEW: Open backups folder
    ipcMain.handle('database:openBackupsFolder', async () => {
        try {
            const backupDir = path.join(app.getPath('userData'), 'backups');
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }
            shell.openPath(backupDir);
            return { success: true };
        } catch (error) {
            logger.error('Failed to open backups folder', error);
            return { success: false, error: error.message };
        }
    });


    // NEW: Xbox Account Status/Login
    ipcMain.handle('xbox:login', async () => {
        try {
            logger.info('User initiated Xbox account link');
            // For now, open MS account security page or similar
            shell.openExternal('https://account.microsoft.com/creds');
            return { success: true, message: 'Opening Microsoft Account page...' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Test Steam connection
    ipcMain.handle('steam:testConnection', async () => {
        try {
            const creds = gameDatabase.getSteamCredentials();
            if (!creds.apiKey || !creds.steamId64) {
                return { valid: false, error: 'Credentials not configured' };
            }
            steamAPI.setCredentials(creds.apiKey, creds.steamId64);
            return await steamAPI.validateCredentials();
        } catch (error) {
            logger.error('Steam connection test failed', error);
            return { valid: false, error: error.message };
        }
    });

    // Sync playtime from Steam
    ipcMain.handle('steam:syncPlaytime', async () => {
        try {
            const creds = gameDatabase.getSteamCredentials();
            if (!creds.apiKey || !creds.steamId64) {
                return { success: false, error: 'Steam credentials not configured' };
            }
            steamAPI.setCredentials(creds.apiKey, creds.steamId64);
            return await steamAPI.syncPlaytimeWithDatabase(gameDatabase);
        } catch (error) {
            logger.error('Steam playtime sync failed', error);
            return { success: false, error: error.message };
        }
    });

    // ===== DATABASE BACKUP HANDLERS =====

    // Create backup
    ipcMain.handle('database:createBackup', async () => {
        try {
            const result = gameDatabase.createBackup();
            if (result.success) {
                logger.success('Database backup created');
            }
            return result;
        } catch (error) {
            logger.error('Backup creation failed', error);
            return { success: false, error: error.message };
        }
    });

    // Get list of backups
    ipcMain.handle('database:getBackups', async () => {
        return gameDatabase.getBackupsList();
    });

    // Restore from backup
    ipcMain.handle('database:restoreBackup', async (event, backupPath) => {
        try {
            const result = gameDatabase.restoreFromBackup(backupPath);
            if (result.success) {
                logger.success('Database restored from backup');
            }
            return result;
        } catch (error) {
            logger.error('Restore failed', error);
            return { success: false, error: error.message };
        }
    });

    // ===== ACCOUNT INTEGRATION HANDLERS =====

    // Xbox integration
    ipcMain.handle('xbox:setApiKey', async (event, apiKey) => {
        try {
            gameDatabase.updateSettings({ xboxApiKey: apiKey });
            xboxAPI.setApiKey(apiKey);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('xbox:sync', async () => {
        try {
            const settings = gameDatabase.getSettings();
            if (!settings.xboxApiKey) return { success: false, error: 'Xbox API Key not configured' };
            xboxAPI.setApiKey(settings.xboxApiKey);
            return await xboxAPI.syncWithDatabase(gameDatabase);
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Epic integration
    ipcMain.handle('epic:login', async (event, credentials) => {
        try {
            const success = await epicAPI.login(credentials);
            if (success) {
                // Securely store credentials if requested, or just session
                gameDatabase.updateSettings({
                    epicLoggedIn: true,
                    epicUser: epicAPI.userData
                });
                return { success: true, user: epicAPI.userData };
            }
            return { success: false, error: 'Login failed' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('epic:sync', async () => {
        try {
            return await epicAPI.syncWithDatabase(gameDatabase);
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
}

async function launchGame(game) {
    try {
        console.log(`Attempting to launch: ${game.name} from ${game.launcher}`);

        const fs = require('fs');

        // 1. For GOG and Ubisoft, if we have a direct executable path, try it first
        if (game.executablePath && fs.existsSync(game.executablePath) &&
            (game.launcher === 'gog' || game.launcher === 'ubisoft' || game.launcher === 'manual')) {
            shell.openPath(game.executablePath);
            gameDatabase.updateLastPlayed(game.id);
            return { success: true };
        }

        switch (game.launcher) {
            case 'steam':
                const steamId = game.id.replace('steam_', '');
                shell.openExternal(`steam://run/${steamId}`);
                break;
            case 'epic':
                const epicId = game.epicAppName || game.id.replace('epic_', '');
                shell.openExternal(`com.epicgames.launcher://apps/${epicId}?action=launch&silent=true`);
                break;
            case 'xbox':
                if (game.packageFamilyName) {
                    shell.openExternal(`shell:AppsFolder\\${game.packageFamilyName}!App`);
                } else if (game.executablePath) {
                    shell.openPath(game.executablePath);
                }
                break;
            case 'ea':
                const eaId = game.eaId || game.id.replace('ea_', '');
                shell.openExternal(`origin2://game/launch?offerIds=${eaId}`);
                break;
            case 'ubisoft':
                const ubiId = game.uplayId || game.id.replace('ubisoft_', '');
                shell.openExternal(`uplay://launch/${ubiId}/0`);
                break;
            default:
                if (game.executablePath) {
                    shell.openPath(game.executablePath);
                }
        }

        gameDatabase.updateLastPlayed(game.id);

        // Start tracking
        const exeName = game.executablePath ? path.basename(game.executablePath).toLowerCase() : null;
        if (exeName && processWatcher) {
            processWatcher.trackGame(game.id, exeName, game.name);
        }

        return { success: true };
    } catch (error) {
        console.error('Launch failure:', error);
        return { success: false, error: error.message };
    }
}

/**
 * UNIVERSAL PLAYTIME TRACKER
 * Manages process monitoring, child processes, and session buffering.
 */
class ProcessWatcher {
    constructor(database, onUpdate) {
        this.database = database;
        this.onUpdate = onUpdate;
        this.activeSessions = new Map(); // gameId -> { startTime, lastSeen, exeName, gameName, isFocused }
        this.warmBufferMs = 60000; // 60 seconds grace period

        // Start polling loops
        this.startFocusedLoop();
        this.startBackgroundLoop();
    }

    /**
     * Polling for games explicitly launched via Atlas (High Precision)
     */
    startFocusedLoop() {
        setInterval(async () => {
            const focusedGames = Array.from(this.activeSessions.entries())
                .filter(([_, session]) => session.isFocused);

            if (focusedGames.length === 0) return;

            const runningProcesses = this.getRunningProcesses();

            for (const [gameId, session] of focusedGames) {
                if (this.isProcessRunning(session.exeName, runningProcesses)) {
                    session.lastSeen = Date.now();
                } else {
                    this.checkSessionEnd(gameId, session);
                }
            }
        }, 5000); // 5 seconds for focused games
    }

    /**
     * Polling for all library games (Low Precision / External discovery)
     */
    startBackgroundLoop() {
        setInterval(async () => {
            const runningProcesses = this.getRunningProcesses();
            const allGames = this.database.getAllGames();

            for (const game of allGames) {
                if (!game.executablePath) continue;
                const exeName = path.basename(game.executablePath).toLowerCase();

                const isRunning = this.isProcessRunning(exeName, runningProcesses);

                if (isRunning) {
                    if (!this.activeSessions.has(game.id)) {
                        // Detected external launch
                        logger.info(`Detected ${game.name} launched externally`);
                        this.activeSessions.set(game.id, {
                            startTime: Date.now(),
                            lastSeen: Date.now(),
                            exeName: exeName,
                            gameName: game.name,
                            isFocused: false,
                            external: true
                        });
                        this.database.updateLastPlayed(game.id);
                        this.onUpdate(game.id);
                    } else {
                        // Already tracking, update last seen
                        this.activeSessions.get(game.id).lastSeen = Date.now();
                    }
                } else if (this.activeSessions.has(game.id) && !this.activeSessions.get(game.id).isFocused) {
                    // Check if background tracked game has stopped
                    this.checkSessionEnd(game.id, this.activeSessions.get(game.id));
                }
            }
        }, 60000); // 60 seconds for background scan
    }

    getRunningProcesses() {
        try {
            const { execSync } = require('child_process');
            // Simplified tasklist call for performance
            const output = execSync('tasklist /NH /FO CSV', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            return output.toLowerCase();
        } catch (e) {
            return "";
        }
    }

    isProcessRunning(exeName, runningProcesses) {
        // Basic match
        if (runningProcesses.includes(`"${exeName.toLowerCase()}"`)) return true;

        // Window Matching Placeholder (Future Implementation)
        // This would use a native module or PowerShell to check window titles
        return false;
    }

    checkSessionEnd(gameId, session) {
        const now = Date.now();
        const timeSinceLastSeen = now - session.lastSeen;

        if (timeSinceLastSeen > this.warmBufferMs) {
            // Buffer expired, finalize session
            const totalMs = session.lastSeen - session.startTime;
            const totalMinutes = Math.round(totalMs / 60000);

            if (totalMinutes > 0) {
                logger.success(`Saving ${totalMinutes}m for ${session.gameName}`);
                this.database.updateGamePlaytime(gameId, totalMinutes, 'tracked_locally');
                this.onUpdate(gameId);
            }

            this.activeSessions.delete(gameId);
        }
    }

    trackGame(gameId, exeName, gameName) {
        this.activeSessions.set(gameId, {
            startTime: Date.now(),
            lastSeen: Date.now(),
            exeName: exeName.toLowerCase(),
            gameName: gameName,
            isFocused: true
        });
    }
}

// Global watcher instance
let processWatcher;

function initializeProcessWatcher() {
    processWatcher = new ProcessWatcher(gameDatabase, (gameId) => {
        if (mainWindow) {
            mainWindow.webContents.send('games:updated', gameDatabase.getGame(gameId));
        }
    });
}

function openInStore(game) {
    try {
        switch (game.launcher) {
            case 'steam':
                const steamId = game.id.replace('steam_', '');
                shell.openExternal(`steam://store/${steamId}`);
                break;
            case 'epic':
                shell.openExternal('com.epicgames.launcher://store');
                break;
            case 'xbox':
                shell.openExternal('ms-windows-store://home');
                break;
            case 'ea':
                shell.openExternal('origin://');
                break;
            case 'ubisoft':
                shell.openExternal('uplay://');
                break;
            case 'gog':
                shell.openExternal('goggalaxy://');
                break;
            default:
                if (game.executablePath) {
                    shell.openPath(path.dirname(game.executablePath));
                }
        }
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * ATLAS SPOTLIGHT - Fast Search Window
 */
function createSpotlightWindow() {
    if (spotlightWindow) {
        spotlightWindow.show();
        return;
    }

    spotlightWindow = new BrowserWindow({
        width: 600,
        height: 80,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        center: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    spotlightWindow.loadFile(path.join(__dirname, 'src/renderer/spotlight.html'));

    spotlightWindow.on('blur', () => {
        spotlightWindow.hide();
    });
}

/**
 * DISCORD RICH PRESENCE MANAGER
 */
function updateDiscordPresence(gameId) {
    if (!rpc || !rpcReady) return;

    const game = gameDatabase.getGame(gameId);
    if (!game) {
        rpc.setActivity({
            details: 'Browsing Library',
            state: 'Viewing Games',
            startTimestamp: Date.now(),
            largeImageKey: 'atlas_logo',
            largeImageText: 'OmLx Atlas',
            instance: false,
        }).catch(() => { });
        return;
    }

    const playtimeH = Math.round((game.playTime?.totalMinutes || 0) / 60);
    const achievements = game.achievements || { unlocked: 0, total: 0 };
    const progress = achievements.total > 0 ? Math.round((achievements.unlocked / achievements.total) * 100) : 0;

    rpc.setActivity({
        details: `Playing ${game.name}`,
        state: `${playtimeH}h Played • ${progress}% Achievements`,
        startTimestamp: Date.now(),
        largeImageKey: 'atlas_logo',
        largeImageText: 'OmLx Atlas',
        smallImageKey: game.launcher || 'game',
        smallImageText: `via ${game.launcher || 'Unknown'}`,
        instance: false,
    }).catch(err => logger.warn('Discord RPC update failed', err));
}


app.whenReady().then(async () => {
    try {
        initializeServices();
        setupIPCHandlers();
        initializeProcessWatcher();
        createWindow();
        connectDiscordRPC(); // Initialize Discord Rich Presence

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    } catch (error) {
        console.error('FATAL ERROR DURING STARTUP:', error);
        dialog.showErrorBox('Startup Error', `The application failed to start: ${error.message}`);
        app.quit();
    }
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
