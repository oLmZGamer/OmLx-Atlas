const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { GameScanner } = require('./gameScanner');
const { GameDatabase } = require('./database');

let mainWindow;
let gameDatabase;
let gameScanner;
let activeGames = new Map(); // gameId -> { startTime, exeName }

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
}

function setupIPCHandlers() {
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

    ipcMain.handle('games:getAll', async () => {
        return gameDatabase.getAllGames();
    });

    ipcMain.handle('games:scan', async () => {
        const results = await gameScanner.scanAllLaunchers();
        return results;
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

    // NEW: Refresh stats from launcher (Steam, etc.)
    ipcMain.handle('games:refreshStats', async (event, game) => {
        // For now, this is a placeholder. In the future, this would:
        // 1. Fetch fresh stats from launcher APIs (Steam, Epic, etc.)
        // 2. Update playtime, last played, achievements
        // 3. Mark statsSource as 'launcher' if successful
        console.log(`Refreshing stats for ${game.name} from ${game.launcher}...`);
        
        // TODO: Implement launcher-specific stat fetching when APIs are available
        // For now, return current game data
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

    // NEW: Open external URL (Feedback button, etc.)
    ipcMain.handle('shell:openExternal', async (event, url) => {
        try {
            await shell.openExternal(url);
            return { success: true };
        } catch (error) {
            console.error('Failed to open external URL:', error);
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
                // OfferIds is usually the way to launch EA games via protocol
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
        activeGames.set(game.id, {
            startTime: Date.now(),
            exeName: exeName,
            gameName: game.name
        });

        return { success: true };
    } catch (error) {
        console.error('Launch failure:', error);
        return { success: false, error: error.message };
    }
}

// PERIODIC PROCESS TRACKING
setInterval(async () => {
    if (activeGames.size === 0) return;

    try {
        const { execSync } = require('child_process');
        const taskList = execSync('tasklist /NH /FO CSV', { encoding: 'utf8' });
        const runningProcesses = taskList.toLowerCase();

        for (const [gameId, info] of activeGames.entries()) {
            let isRunning = false;

            if (info.exeName) {
                // Check if specific exe is running
                isRunning = runningProcesses.includes(`"${info.exeName}"`);
            } else {
                // Fallback for protocol launches: check if any part of game name is in process list
                // This is less accurate but better than nothing
                const nameParts = info.gameName.toLowerCase().split(' ');
                isRunning = nameParts.some(part => part.length > 3 && runningProcesses.includes(part));
            }

            if (!isRunning) {
                // Game closed
                const endTime = Date.now();
                const totalMs = endTime - info.startTime;
                const totalMinutes = Math.round(totalMs / 60000);

                if (totalMinutes > 0) {
                    gameDatabase.updatePlayTime(gameId, totalMinutes);
                    console.log(`Saved ${totalMinutes} minutes for ${info.gameName}`);

                    if (mainWindow) {
                        mainWindow.webContents.send('games:updated', gameDatabase.getGame(gameId));
                    }
                }

                activeGames.delete(gameId);
            }
        }
    } catch (e) {
        console.error('Error tracking processes:', e);
    }
}, 30000); // Check every 30 seconds

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

app.whenReady().then(() => {
    initializeServices();
    setupIPCHandlers();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
