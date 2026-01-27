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
    selectBackground: () => ipcRenderer.invoke('settings:selectBackground')
});
