# OmLx Atlas - Technical Implementation Notes

## Architecture Changes

### 1. Game Object Structure

#### Before
```javascript
{
  id: "steam_123456",
  name: "Game Name",
  launcher: "steam",
  executablePath: "...",
  installPath: "...",
  coverImage: "...",
  backgroundImage: "...",
  isFavorite: false,
  lastPlayed: "2024-01-27T12:00:00Z",
  playTime: { totalMinutes: 100, sessions: [] },
  achievements: { unlocked: 0, total: 0, list: [], lastUpdated: null }
}
```

#### After
```javascript
{
  id: "steam_123456",
  name: "Game Name",
  launcher: "steam",
  itemType: "game",  // NEW: Explicit classification
  steamAppId: "123456",  // NEW: Launcher-specific IDs preserved
  executablePath: "...",
  installPath: "...",
  coverImage: "...",
  backgroundImage: "...",
  isFavorite: false,
  lastPlayed: "2024-01-27T12:00:00Z",
  playTime: { totalMinutes: 100, sessions: [] },
  achievements: { unlocked: 0, total: 0, list: [], lastUpdated: null },
  // NEW: Stats source tracking
  statsSource: {
    playtimeSource: "atlas",
    lastPlayedSource: "atlas",
    achievementsSource: "atlas"
  }
}
```

### 2. Class Hierarchy

#### GameScanner
- Now contains `statsProviders` map (initialized in constructor)
- New method: `fetchLauncherStats(game)` - delegates to appropriate provider
- Enhanced filtering in `isValidAppName()` - 20+ new criteria
- Safe paths in `deepScanPC()` - neverScan list
- Safe recursion in `scanFolder()` - system folder protection

#### GameDatabase
- New method: `updateItemType(gameId, itemType)`
- New method: `updateStatsSource(gameId, sourceInfo)`
- Enhanced: `migrateGamesSchema()` - legacy data support
- Enhanced: `addGames()` - user override preservation

#### LauncherStatsProvider (New)
- Base class for implementing launcher APIs
- Method: `async getStats(game)` - to be implemented by subclasses
- Returns: `{ playtimeMinutes?, lastPlayed?, achievements?, source, reason? }`
- 6 subclasses: Steam, Epic, Xbox, EA, Ubisoft, GOG

### 3. Filter & View Logic

#### Previous filterAndRenderGames()
```javascript
if (currentView === 'programs') {
  games = games.filter(g => g.launcher === 'desktop' || g.launcher === 'manual');
}
```

#### Updated filterAndRenderGames()
```javascript
if (currentView === 'taste') {
  renderYourTasteView();  // Special handler for analytics
  return;
}
if (currentView === 'programs') {
  games = games.filter(g => g.itemType === 'app');  // Use itemType now
}
```

---

## File-by-File Changes

### gameScanner.js (1038 lines, +230 lines)

**Added:**
- Lines 5-130: LauncherStatsProvider interface + 6 implementations
- Lines 131-150: GameScanner constructor enhancement with statsProviders
- Lines 155-180: fetchLauncherStats() method
- Lines 195-230: Enhanced isValidAppName() with 20+ new filters
- Lines 310-340: Safe deepScanPC() with neverScan list
- Lines 360-380: Safe scanFolder() with system path blocking
- itemType fields added to all 6 launcher scanners:
  - Line ~420: Steam - itemType: 'game', steamAppId field
  - Line ~480: Epic - itemType: 'game', epicAppName field
  - Line ~550: Xbox - itemType: 'game'
  - Line ~620: EA - itemType: 'game', eaId field
  - Line ~700: Ubisoft - itemType: 'game'
  - Line ~800: GOG - itemType: 'game'

**Key Functions:**
- `isValidAppName()` - Completely rewritten for safety
- `deepScanPC()` - Limited to game-only directories
- `scanFolder()` - Added system folder hard blocks
- `fetchLauncherStats()` - NEW, delegates to providers
- All launcher parsers - Added itemType field

### database.js (268 lines, +50 lines)

**Added:**
- Lines 20-25: migrateGamesSchema() - called in initialize()
- Lines 75-95: Enhanced addGames() - user override preservation
- Lines 165-175: updateItemType() - NEW method
- Lines 177-195: updateStatsSource() - NEW method

**Enhanced:**
- initialize() - Now calls migrateGamesSchema()
- addGames() - Preserves user customizations
- Game record structure - Added statsSource initialization

### preload.js (44 lines, +8 lines)

**Added Exposed APIs:**
- updateItemType(gameId, itemType)
- refreshGameStats(game)
- openExternal(url)

**Pattern:**
```javascript
updateItemType: (gameId, itemType) => ipcRenderer.invoke('games:updateItemType', gameId, itemType),
refreshGameStats: (game) => ipcRenderer.invoke('games:refreshStats', game),
openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
```

### index.js (349 lines, +40 lines)

**Added IPC Handlers:**
- games:updateItemType - Updates database
- games:refreshStats - Placeholder for launcher stat refresh
- shell:openExternal - Opens URLs via Electron shell

**New Handler Pattern:**
```javascript
ipcMain.handle('games:updateItemType', async (event, gameId, itemType) => {
    return gameDatabase.updateItemType(gameId, itemType);
});
```

### src/renderer/index.html (486 lines, +30 lines)

**Added:**
- Lines ~105-110: "Your Taste" nav button with heart icon
- Lines ~405-420: "Help & Feedback" settings section with Feedback button

**Structure:**
```html
<button class="nav-item" data-view="taste">
    <!-- heart SVG icon -->
    <span>Your Taste</span>
</button>
```

### src/renderer/app.js (1145 lines, +200 lines)

**Added Functions:**
- getTopGamesByPlaytime() - Returns top 3 games by playtime
- getTopLaunchersByPlaytime() - Aggregates launcher stats
- renderYourTasteView() - NEW custom view renderer

**Enhanced Functions:**
- updateStatsDisplay() - Added source labels + tooltips
- filterAndRenderGames() - Added 'taste' view special handling
- setupEventListeners() - Added feedbackBtn listener

**New Event Listener:**
```javascript
feedbackBtn.addEventListener('click', () => {
    SoundManager.play('click');
    window.electronAPI.openExternal('https://omlxstudios.xyz/#contact');
});
```

---

## Data Flow

### Scan Flow (Enhanced)

```
scanAllLaunchers()
  ├─ scanSteam() → adds itemType: 'game', steamAppId
  ├─ scanEpicGames() → adds itemType: 'game', epicAppName
  ├─ scanXboxGamePass() → adds itemType: 'game'
  ├─ scanEAApp() → adds itemType: 'game', eaId
  ├─ scanUbisoftConnect() → adds itemType: 'game'
  ├─ scanGOG() → adds itemType: 'game'
  └─ deepScanPC() → adds itemType: 'app' (for desktop/manual)
       ├─ BLOCKS: C:\Windows, C:\ProgramData, Program Files raw
       ├─ ALLOWS: Games/, SteamLibrary/, Epic Games/, etc.
       └─ isValidAppName() checks:
            ├─ System folder check
            ├─ GUID detection
            ├─ Blacklist patterns (50+ names)
            ├─ Numeric heuristics
            ├─ Whitelist fast-pass
            └─ Alphabetic ratio check
  
  deduplicateApps() → keeps highest priority launcher
  enrichGameMetadata() → fetches cover art
  database.addGames()
    ├─ Calls migrateGamesSchema() if legacy games exist
    └─ Preserves: isFavorite, coverImage, itemType, playTime, achievements
```

### Stats Fetching Flow (Future)

```
Game Modal Opens
  → updateStatsDisplay(game)
      → Shows statsSource tooltips
  
User Clicks "Refresh Stats"
  → window.electronAPI.refreshGameStats(game)
      → ipcMain handler calls gameScanner.fetchLauncherStats(game)
          → Queries this.statsProviders[game.launcher]
              → Steam: Checks API key + SteamID64
              → Others: Returns { source: 'unknown', reason: '...' }
          → Falls back to Atlas-tracked stats
      → Updates database with new statsSource
      → Sends games:updated event to renderer
  → updateStatsDisplay() re-renders with new sources
```

### Filtering Flow (Updated)

```
filterAndRenderGames()
  ├─ IF currentView === 'taste'
  │    → renderYourTasteView()
  │        ├─ getTopGamesByPlaytime() [top 3]
  │        ├─ getTopLaunchersByPlaytime() [top 5]
  │        └─ Render analytics dashboard
  │        RETURN (skip normal filtering)
  │
  ├─ IF currentView === 'programs'
  │    → games.filter(g => g.itemType === 'app')  [CHANGED FROM LAUNCHER]
  │
  ├─ IF currentView === 'favorites'
  │    → games.filter(g => g.isFavorite)
  │
  ├─ IF currentView === 'recent'
  │    → games.filter(g => g.lastPlayed)
  │    → sort by date DESC
  │
  ├─ Apply launcher filter (if not 'all')
  ├─ Apply search filter
  ├─ Apply sort
  └─ Render filtered games
```

---

## Performance Considerations

### Optimizations Made

1. **Scan Performance:**
   - Removed raw `Program Files` scanning (too many non-games)
   - Limited deepScanPC to game-specific folders
   - Early return in isValidAppName() for obvious rejects
   - Continues to use maxDepth=3 recursion limit

2. **Database Operations:**
   - Migration only runs once (on first launch with legacy data)
   - Preserved data reduces re-fetch needs
   - Stats source labels computed on-demand (no new fields overhead)

3. **Renderer Performance:**
   - Your Taste view renders as single container (not 60 items)
   - Lazy tooltip generation (only on hover)
   - Filter logic short-circuits for 'taste' view

### Potential Bottlenecks

1. **Steam API Calls (Future):**
   - Each game refresh = HTTP request
   - Implement batching when available
   - Cache results locally

2. **Deep Scan on New Systems:**
   - Still scans all game folders recursively
   - Consider adding progress bar for > 1000 files
   - isValidAppName() is CPU-bound for regex checks

3. **Your Taste Aggregation:**
   - O(n) scan for top games
   - O(n) scan for launcher aggregation
   - Fine for typical library size (< 500 games)

---

## Migration Strategy

### Legacy games.json Handling

```javascript
migrateGamesSchema() {
  FOR each game in games.json:
    IF !game.itemType:
      game.itemType = (launcher in ['steam','epic','xbox','ea','ubisoft','gog']) ? 'game' : 'app'
    
    IF !game.statsSource:
      game.statsSource = {
        playtimeSource: launcher === 'steam' ? 'unknown' : 'atlas',
        lastPlayedSource: 'atlas',
        achievementsSource: launcher === 'steam' ? 'unknown' : 'atlas'
      }
  
  this.saveGames(games)
  console.log('Migrated games.json schema...')
}
```

**Guarantees:**
- Backward compatible (old fields preserved)
- One-time operation (idempotent)
- No data loss
- Automatic (no user action needed)

---

## API Contracts

### IPC Message Contracts

#### games:updateItemType
```javascript
// Main → Renderer
ipcRenderer.invoke('games:updateItemType', gameId, itemType)
// Returns: { id, itemType, ... } (full game object)
```

#### games:refreshStats
```javascript
// Main → Renderer  
ipcRenderer.invoke('games:refreshStats', game)
// Returns: { id, statsSource, playTime, achievements, ... }
// Note: Currently placeholder, awaiting launcher API integration
```

#### shell:openExternal
```javascript
// Main → Renderer
ipcRenderer.invoke('shell:openExternal', url)
// Returns: { success: true/false, error?: message }
// Uses Electron's shell.openExternal() under the hood
```

### Launcher Stats Provider Interface

```javascript
class LauncherStatsProvider {
  async getStats(game) {
    // Returns ONE of:
    
    // SUCCESS case:
    return {
      playtimeMinutes: 100,
      lastPlayed: "2024-01-27",
      achievements: { unlocked: 5, total: 20, list: [...] },
      source: 'launcher'
    }
    
    // UNAVAILABLE case (do NOT fake data):
    return {
      source: 'unknown',
      reason: 'Epic Games does not provide public stats API'
    }
  }
}
```

---

## Testing Strategy

### Unit-Level Testing

**isValidAppName() edge cases:**
```javascript
expect(isValidAppName('vcredist2019.exe', 'C:\\...')).toBe(false)  // blacklist
expect(isValidAppName('a1b2c3d4e5f6g7h8.exe', '...')).toBe(false)  // GUID-like
expect(isValidAppName('SpotifySetup.exe', '...')).toBe(true)  // whitelist
expect(isValidAppName('Game.exe', 'C:\\Games\\MyGame\\')).toBe(true)  // game folder
```

**deepScanPC() path safety:**
```javascript
// Should SKIP these paths
expect(deepScan('C:\\Windows')).toSkip()
expect(deepScan('C:\\ProgramData')).toSkip()
expect(deepScan('C:\\Program Files')).toSkip()  // raw
expect(deepScan('C:\\Program Files\\Epic Games')).toScan()  // specific
```

**Deduplication:**
```javascript
const apps = [
  { name: 'Elden Ring', launcher: 'steam', ... },
  { name: 'Elden Ring', launcher: 'xbox', ... }
]
expect(deduplicate(apps)).toHaveLength(1)
expect(deduplicate(apps)[0].launcher).toBe('steam')  // priority
```

### Integration Testing

**Migration flow:**
```javascript
// 1. Create old games.json without itemType/statsSource
// 2. Load database
// 3. Verify migrateGamesSchema() was called
// 4. Reload games
// 5. Verify all games have itemType + statsSource
```

**View filtering:**
```javascript
// Setup: 5 games (3 steam, 2 desktop apps)
// Test: filterAndRenderGames() with currentView='programs'
// Expect: Only 2 items rendered (desktop apps)
// Verify: Each has itemType='app'
```

**Feedback button:**
```javascript
// 1. Click feedback button in settings
// 2. Verify shell.openExternal() called with correct URL
// 3. Verify external browser opens
```

### End-to-End Testing

**Fresh system scan:**
```javascript
// Run full scanAllLaunchers() on test system
// Verify NO system executables in results
// Verify clear game/app separation (itemType field)
```

**Re-scan preservation:**
```javascript
// 1. Initial scan → add to database
// 2. Mark game as favorite, upload custom cover
// 3. Run scan again
// 4. Verify: favorite + cover preserved (not reset)
```

**Your Taste rendering:**
```javascript
// Load 20 games with varied playtimes
// Click "Your Taste"
// Verify: Top 3 games + top 5 launchers displayed
// Verify: Clicking game opens modal
```

---

## Future Extension Points

### Adding a New Launcher Scanner

```javascript
// 1. Add scanNewLauncher() method
async scanNewLauncher() {
  const games = [];
  // ... parse manifests, folders, etc.
  games.push({
    id: `newlauncher_${someId}`,
    name: gameName,
    launcher: 'newlauncher',  // NEW LAUNCHER NAME
    itemType: 'game',  // Always 'game' for proper launchers
    executablePath: '...',
    installPath: '...',
    coverImage: null,
    backgroundImage: null
  });
  return games;
}

// 2. Add to scanAllLaunchers()
const newLauncherGames = await this.scanNewLauncher();
allApps.push(...newLauncherGames);

// 3. Update launcherConfig in app.js
const launcherConfig = {
  newlauncher: { name: 'New Launcher', color: '#...' },
  // ... existing
};

// 4. (Optional) Implement NewLauncherStatsProvider
class NewLauncherStatsProvider extends LauncherStatsProvider {
  async getStats(game) {
    if (!apiAvailable) return { source: 'unknown', reason: '...' };
    // Fetch from API
    return { playtimeMinutes, lastPlayed, achievements, source: 'launcher' };
  }
}

// 5. Register in GameScanner constructor
this.statsProviders['newlauncher'] = new NewLauncherStatsProvider();
```

### Adding a New Stats Source

Follow LauncherStatsProvider pattern:
1. Create class extending LauncherStatsProvider
2. Implement getStats(game) method
3. Return either real data with source:'launcher' OR { source: 'unknown', reason }
4. Register in GameScanner.statsProviders map
5. No UI changes needed (auto-handled by updateStatsDisplay)

### Adding Custom Genres/Tags (Future)

```javascript
// Extend game object (after itemType established):
game.tags = ['action', 'rpg']  // user-managed only
game.userGenre = 'Action RPG'  // optional override

// Add UI for editing tags (separate from auto-assignment)
// Database methods: updateGameTags(), updateGameGenre()
```

---

## Known Limitations & TODOs

### Current Limitations

1. **Steam API:** Not yet integrated
   - Requires API key + SteamID64 from user
   - Placeholder code ready for implementation

2. **Epic Games:** No public API
   - Could parse local manifests (future)
   - Currently: { source: 'unknown' }

3. **Xbox/EA/Ubisoft:** Restricted APIs
   - Would require OAuth + developer partnerships
   - Not feasible in current architecture

4. **Genre Tagging:** Not implemented
   - Design ready (no auto-assignment)
   - User-managed only (future UI)

5. **Your Taste:** Basic analytics only
   - No ML/predictions
   - Simple aggregation (top 3, top 5)
   - No trend analysis (yet)

### TODO Comments in Code

Search for `// TODO:` in:
- **gameScanner.js:** Steam API implementation
- **app.js:** "Update stats source labels in UI" tasks
- **database.js:** Genre field structure (for future)

---

## Support & Debugging

### Console Logs for Diagnostics

- `gameScanner.js` logs scan progress + filter rejections
- `database.js` logs migration status on startup
- `index.js` logs IPC handler calls
- `app.js` logs game modal opens + view switches

Enable DevTools: `npm run dev` or add `--dev` flag

### Common Issues & Solutions

| Issue | Root Cause | Solution |
|-------|-----------|----------|
| No games found | System folder being scanned | Check scan logs, neverScan list |
| False positives still appear | New executable pattern not in blacklist | Report via Feedback |
| Stats showing "Unknown" | API key missing for Steam | Awaiting Steam integration |
| Games duplicate after scan | Old dedup logic | Verify deduplicateApps() working |
| User data lost | addGames() not preserving | Check preservation logic in addGames() |
