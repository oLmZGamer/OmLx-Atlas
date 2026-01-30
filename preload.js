const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Window controls
    minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
    maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
    closeWindow: () => ipcRenderer.invoke('window:close'),
    toggleFullscreen: () => ipcRenderer.invoke('window:fullscreen'),

    // Game operations
    getAllGames: () => ipcRenderer.invoke('games:getAll'),
    scanGames: () => ipcRenderer.invoke('games:scan'),
    launchGame: (game) => ipcRenderer.invoke('games:launch', game),
    openGameLocation: (path) => ipcRenderer.invoke('games:openLocation', path),
    openInStore: (game) => ipcRenderer.invoke('games:openStore', game),
    addManualGame: () => ipcRenderer.invoke('games:addManual'),
    toggleFavorite: (gameId) => ipcRenderer.invoke('games:toggleFavorite', gameId),
    updateLastPlayed: (gameId) => ipcRenderer.invoke('games:updateLastPlayed', gameId),
    deleteGame: (gameId) => ipcRenderer.invoke('games:delete', gameId),
    updateCover: (gameId) => ipcRenderer.invoke('games:updateCover', gameId),
    searchArtwork: (name, gameId) => ipcRenderer.invoke('games:searchArtwork', name, gameId),
    updateLauncher: (gameId, launcher) => ipcRenderer.invoke('games:updateLauncher', gameId, launcher),
    getAchievements: (game) => ipcRenderer.invoke('games:getAchievements', game),
    scanCustomFolder: () => ipcRenderer.invoke('games:scanCustomFolder'),
    searchAllArtwork: () => ipcRenderer.invoke('games:searchAllArtwork'),

    // NEW: ItemType management
    updateItemType: (gameId, itemType) => ipcRenderer.invoke('games:updateItemType', gameId, itemType),
    updateGameCategories: (gameId, categories) => ipcRenderer.invoke('games:updateCategories', gameId, categories),

    // NEW: Stats refresh
    refreshGameStats: (game) => ipcRenderer.invoke('games:refreshStats', game),

    // NEW: Clear all games
    clearAllGames: () => ipcRenderer.invoke('games:clearAll'),

    // NEW: External links (Feedback button, etc.)
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

    // NEW: ItemType management
    updateItemType: (gameId, itemType) => ipcRenderer.invoke('games:updateItemType', gameId, itemType),

    // NEW: Stats refresh
    refreshGameStats: (game) => ipcRenderer.invoke('games:refreshStats', game),

    // NEW: Clear all games
    clearAllGames: () => ipcRenderer.invoke('games:clearAll'),

    // NEW: External links (Feedback button, etc.)
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

    // Real-time events
    onGamesUpdated: (callback) => ipcRenderer.on('games:updated', (event, game) => callback(game)),

    // Settings
    updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
    selectBackground: () => ipcRenderer.invoke('settings:selectBackground'),

    // NEW: Logs
    getLogPaths: () => ipcRenderer.invoke('logs:getPaths'),
    openLogsFolder: () => ipcRenderer.invoke('logs:openFolder'),

    // NEW: Steam API
    getSteamCredentials: () => ipcRenderer.invoke('steam:getCredentials'),
    setSteamCredentials: (apiKey, steamId64) => ipcRenderer.invoke('steam:setCredentials', apiKey, steamId64),
    testSteamConnection: () => ipcRenderer.invoke('steam:testConnection'),
    syncSteamPlaytime: () => ipcRenderer.invoke('steam:syncPlaytime'),

    // NEW: Database Backup
    createDatabaseBackup: () => ipcRenderer.invoke('database:createBackup'),
    getDatabaseBackups: () => ipcRenderer.invoke('database:getBackups'),
    restoreDatabaseBackup: (backupPath) => ipcRenderer.invoke('database:restoreBackup', backupPath),
    openBackupsFolder: () => ipcRenderer.invoke('database:openBackupsFolder'),

    // NEW: Epic & Xbox
    loginEpic: () => ipcRenderer.invoke('epic:login'),
    loginXbox: () => ipcRenderer.invoke('xbox:login'),
    epicLogin: (credentials) => ipcRenderer.invoke('epic:login', credentials),
    epicSync: () => ipcRenderer.invoke('epic:sync'),
    xboxSetApiKey: (apiKey) => ipcRenderer.invoke('xbox:setApiKey', apiKey),
    xboxSync: () => ipcRenderer.invoke('xbox:sync'),

    // NEW: App scanning
    scanApps: () => ipcRenderer.invoke('games:scanApps'),

    // NEW: Spotlight
    closeSpotlight: () => ipcRenderer.invoke('spotlight:close'),

    // NEW: Categories
    getCategories: () => ipcRenderer.invoke('categories:get'),
    addCategory: (name) => ipcRenderer.invoke('categories:add', name),
    deleteCategory: (name) => ipcRenderer.invoke('categories:delete', name),
    renameCategory: (oldName, newName) => ipcRenderer.invoke('categories:rename', oldName, newName),
    restoreDefaultCategories: () => ipcRenderer.invoke('categories:restoreDefault')
});
