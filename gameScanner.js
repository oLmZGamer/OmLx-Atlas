const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');
const os = require('os');

// ===== LAUNCHER STATS PROVIDER INTERFACE =====
// This interface defines how to fetch stats (playtime, achievements, lastPlayed) from launcher APIs.
// Implement this interface for each launcher (Steam, Epic, EA, Ubisoft, Xbox, GOG).

class LauncherStatsProvider {
    /**
     * Get stats for a game from the launcher's API/data sources.
     * @param {Object} game - Game object with launcher-specific IDs
     * @returns {Promise<Object>} { playtimeMinutes?, lastPlayed?, achievements?, source }
     *   - If data is available: { playtimeMinutes: 100, lastPlayed: "2024-01-27", achievements: {...}, source: 'launcher' }
     *   - If data is NOT available: { source: 'unknown' } (do not fake data)
     */
    async getStats(game) {
        throw new Error('getStats() must be implemented by subclass');
    }
}

// STEAM STATS PROVIDER (Planned - requires API key and SteamID64)
class SteamStatsProvider extends LauncherStatsProvider {
    constructor(apiKey = null, steamId64 = null) {
        super();
        this.apiKey = apiKey;
        this.steamId64 = steamId64;
        // TODO: Steam Web API endpoints (when key + steamId are available)
        // - IPlayerService/GetOwnedGames -> playtime_forever
        // - ISteamUserStats/GetPlayerAchievements -> achievement data
    }

    async getStats(game) {
        // If we don't have credentials, we can't fetch Steam stats
        if (!this.apiKey || !this.steamId64) {
            console.log(`[Steam] Missing API key or SteamID64. Cannot fetch stats for ${game.name}.`);
            return { source: 'unknown', reason: 'Missing Steam API credentials' };
        }

        try {
            const steamAppId = game.steamAppId || game.id.replace('steam_', '');
            
            // TODO: Implement actual Steam API calls here
            // Example structure:
            // const playtimeUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${this.apiKey}&steamid=${this.steamId64}&appids_filter=[${steamAppId}]`;
            // const achievementsUrl = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${this.apiKey}&steamid=${this.steamId64}&appid=${steamAppId}`;
            
            console.log(`[Steam] TODO: Implement Steam Web API stats fetching for app ${steamAppId}`);
            
            return { 
                source: 'unknown', 
                reason: 'Steam API implementation pending (requires key + SteamID64 in settings)'
            };
        } catch (error) {
            console.error(`[Steam] Error fetching stats for ${game.name}:`, error.message);
            return { source: 'unknown', error: error.message };
        }
    }
}

// EPIC GAMES STATS PROVIDER (Stub - Epic API is not public)
class EpicStatsProvider extends LauncherStatsProvider {
    async getStats(game) {
        // Epic Games does not have a public API for stats
        console.log(`[Epic] No public API available. Falling back to Atlas-tracked stats.`);
        return { source: 'unknown', reason: 'Epic Games does not provide public stats API' };
    }
}

// XBOX STATS PROVIDER (Stub - requires Xbox Live authentication)
class XboxStatsProvider extends LauncherStatsProvider {
    async getStats(game) {
        // Xbox stats require Xbox Live authentication (complex)
        console.log(`[Xbox] Xbox Live authentication required. Falling back to Atlas-tracked stats.`);
        return { source: 'unknown', reason: 'Xbox stats require authentication' };
    }
}

// GOG STATS PROVIDER (Stub - GOG doesn't expose user stats publicly)
class GOGStatsProvider extends LauncherStatsProvider {
    async getStats(game) {
        // GOG Galaxy stores stats locally but doesn't have a public API
        console.log(`[GOG] No public API available. Falling back to Atlas-tracked stats.`);
        return { source: 'unknown', reason: 'GOG does not provide public stats API' };
    }
}

// EA STATS PROVIDER (Stub - EA API is restricted)
class EAStatsProvider extends LauncherStatsProvider {
    async getStats(game) {
        // EA API requires OAuth and is not easily accessible
        console.log(`[EA] EA API not accessible. Falling back to Atlas-tracked stats.`);
        return { source: 'unknown', reason: 'EA API requires developer access' };
    }
}

// UBISOFT STATS PROVIDER (Stub - Ubisoft API is restricted)
class UbisoftStatsProvider extends LauncherStatsProvider {
    async getStats(game) {
        console.log(`[Ubisoft] Ubisoft API not accessible. Falling back to Atlas-tracked stats.`);
        return { source: 'unknown', reason: 'Ubisoft API requires developer access' };
    }
}

class GameScanner {
    constructor(database) {
        this.database = database;
        this.homeDir = os.homedir();
        
        // Initialize stats providers (TODO: inject Steam credentials from settings)
        this.statsProviders = {
            steam: new SteamStatsProvider(),
            epic: new EpicStatsProvider(),
            xbox: new XboxStatsProvider(),
            ea: new EAStatsProvider(),
            ubisoft: new UbisoftStatsProvider(),
            gog: new GOGStatsProvider()
        };
    }

    async scanAllLaunchers() {
        console.log('Starting universal application and game scan...');
        let allApps = [];

        try {
            // Scan each launcher
            const steamGames = await this.scanSteam();
            allApps.push(...steamGames);

            const epicGames = await this.scanEpicGames();
            allApps.push(...epicGames);

            const xboxGames = await this.scanXboxGamePass();
            allApps.push(...xboxGames);

            const eaGames = await this.scanEAApp();
            allApps.push(...eaGames);

            const ubisoftGames = await this.scanUbisoftConnect();
            allApps.push(...ubisoftGames);

            const gogGames = await this.scanGOG();
            allApps.push(...gogGames);

            // Deep Scan for Manual/Standalone Games
            const deepScanGames = await this.deepScanPC();
            allApps.push(...deepScanGames);

            // Deduplicate across all sources
            allApps = this.deduplicateApps(allApps);

            // Fetch missing metadata (Images)
            console.log('Fetching missing metadata for apps...');
            const enrichedApps = await this.enrichGameMetadata(allApps);

            // Save all apps to database
            this.database.addGames(enrichedApps);

            console.log(`Total apps found and enriched: ${enrichedApps.length}`);
            return enrichedApps;

        } catch (error) {
            console.error('Error scanning apps:', error);
            return allApps;
        }
    }

    // NEW: Fetch and update stats from launcher APIs
    async fetchLauncherStats(game) {
        if (!this.statsProviders[game.launcher]) {
            console.log(`[${game.launcher}] No stats provider available.`);
            return { source: 'unknown' };
        }

        const provider = this.statsProviders[game.launcher];
        const stats = await provider.getStats(game);

        if (stats.source === 'launcher') {
            // Success: Got data from launcher API
            console.log(`[${game.launcher}] Got stats for ${game.name}`);
            return stats;
        } else {
            // Fallback to Atlas-tracked stats
            console.log(`[${game.launcher}] Falling back to Atlas-tracked stats for ${game.name}`);
            return {
                source: 'atlas',
                playtimeMinutes: game.playTime?.totalMinutes || 0,
                lastPlayed: game.lastPlayed,
                achievements: game.achievements
            };
        }
    }

    isValidAppName(exeName, folderPath) {
        const name = exeName.toLowerCase();
        const folder = folderPath.toLowerCase();

        // ===== HARD EXCLUSIONS =====
        // 1. WINDOWS SYSTEM FOLDERS - Never scan these
        const systemFolders = [
            'c:\\windows',
            'c:\\programdata',
            'c:\\system volume information',
            'c:\\$recycle.bin',
            'winsx',
            'system32',
            'syswow64',
            'drivers',
            'winsxs'
        ];
        if (systemFolders.some(sys => folder.includes(sys))) return false;

        // 2. MICROSOFT STORE & APPX APPS - Skip framework/system Microsoft apps
        if (/[a-f0-9]{8}-[a-f0-9]{4}-/.test(folder)) return false; // GUID detection
        if (/[a-z0-9_]{13,}/.test(folder) && folder.includes('microsoft')) return false; // AppX hash
        const microsoftSystemApps = ['searchui', 'cortana', 'edge', 'dwm', 'iexplore', 'winrar', 'windows.ui'];
        if (microsoftSystemApps.some(m => name.includes(m))) return false;

        // 3. BLACKLIST: Definite non-games (expanded list)
        const blacklistPatterns = [
            // Installers/Uninstallers
            /^unins\d*\.exe$/,
            /^setup/i,
            /installer/i,
            // Updaters/Patches
            /^(patch|update|upgrade)/i,
            /autoupdate/i,
            /delta\.exe/i,
            // Helpers & Tools
            /helper/i,
            /launcher.*helper/i,
            /vcredist/i,
            /dotnet/i,
            /runtime/i,
            // Crash/Anticheat
            /crash.*report/i,
            /anticheat/i,
            /antivirus/i,
            /firewall/i,
            /security/i,
            /scanner/i,
            /malware/i,
            // Overlays & Services
            /overlay/i,
            /service\.exe/i,
            /svchost/i,
            // Other system
            /redistributable/i,
            /framework/i,
            /shortcut/i,
            /readme/i,
            /license/i,
            /diagnostic/i,
            /troubleshoot/i,
            /support/i
        ];

        if (blacklistPatterns.some(pattern => pattern.test(name))) return false;

        // 4. GUID-LIKE OR RANDOM NAMES
        if (/^[a-f0-9]{8,}\.exe$/i.test(exeName)) return false; // Pure hex GUID
        if (/^[a-f0-9-]{36}\.exe$/i.test(exeName)) return false; // Full GUID
        if (/^\d{10,}\.exe$/i.test(exeName)) return false; // Long numeric names

        // 5. VERY GENERIC/SHORT NAMES
        const genericNames = ['app.exe', 'main.exe', 'run.exe', 'start.exe', 'launcher.exe', 'game.exe'];
        if (genericNames.includes(exeName)) return false;

        // 6. TOO MANY NUMBERS/SPECIAL CHARS (likely utilities)
        const digitCount = (name.match(/\d/g) || []).length;
        const specialCount = (name.match(/[^a-z0-9_\-\.]/g) || []).length;
        if (digitCount > 5 || specialCount > 3) return false; // Too many digits/special chars = likely random tool

        // 7. COMMON TOOL PATTERNS
        const toolKeywords = [
            'winrar', 'winzip', '7z', 'notepad', 'paint', 'calc', 'explorer',
            'powershell', 'cmd', 'bat', 'dll', 'sys', 'drv', 'scr',
            'vbscript', 'javascript', 'perl', 'python', 'java',
            'installer', 'editor', 'viewer', 'converter', 'codec',
            'plugin', 'extension', 'module', 'addin'
        ];
        if (toolKeywords.some(tool => name.includes(tool))) return false;

        // ===== WHITELIST (ALWAYS ACCEPT) =====
        const knownApps = [
            'spotify', 'discord', 'slack', 'vscode', 'chrome', 'firefox',
            'chatgpt', 'telegram', 'whatsapp', 'zoom', 'teams', 'obs',
            'photoshop', 'illustrator', 'premiere', 'aftereffects',
            'notion', 'obsidian', 'blender', 'unity', 'unreal', 'code'
        ];
        if (knownApps.some(app => name.includes(app))) return true;

        // ===== ACCEPT if passes heuristics =====
        // Name too short = likely not a main game executable
        if (name.length < 4) return false;

        // Prefer names that are mostly alphabetic (clean names like "Elden Ring.exe")
        const alphaRatio = (name.match(/[a-z]/gi) || []).length / name.length;
        if (alphaRatio < 0.6) return false; // Less than 60% alphabetic = likely junk

        return true;
    }

    deduplicateApps(apps) {
        const seen = new Map();

        for (const app of apps) {
            // Normalize name for comparison (remove version numbers, whitespace, and common suffixes)
            const normalizedName = app.name
                .replace(/\s*v?\d+(\.\d+)*\s*/gi, '')  // Remove version numbers like v1.2.3
                .replace(/\s+/g, '')
                .toLowerCase();

            if (seen.has(normalizedName)) {
                // Keep the one with the BEST launcher source
                const existing = seen.get(normalizedName);
                const launcherPriority = ['steam', 'epic', 'xbox', 'ea', 'ubisoft', 'gog', 'desktop', 'manual'];

                if (launcherPriority.indexOf(app.launcher) < launcherPriority.indexOf(existing.launcher)) {
                    seen.set(normalizedName, app);
                }
            } else {
                seen.set(normalizedName, app);
            }
        }

        return Array.from(seen.values());
    }

    async scanFolder(folderPath, depth = 0, maxDepth = 3) {
        if (depth > maxDepth) return [];

        const apps = [];
        try {
            if (!fs.existsSync(folderPath)) return [];
            
            // Hard stop: Never recurse into dangerous system directories
            const dangerousPaths = [
                'c:\\windows', 'c:\\programdata', 'c:\\program files\\common files',
                'c:\\system volume information', 'c:\\$recycle.bin',
                'winsx', 'system32', 'syswow64', 'drivers'
            ];
            const lowerPath = folderPath.toLowerCase();
            if (dangerousPaths.some(danger => lowerPath.includes(danger))) return [];

            const entries = fs.readdirSync(folderPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(folderPath, entry.name);

                if (entry.isDirectory()) {
                    // Skip system/hidden/junk folders
                    if (entry.name.startsWith('.') || entry.name.startsWith('$')) continue;
                    const skipDirs = ['node_modules', 'temp', 'cache', 'windows', 'system32', 'programdata', 'syswow64', 'winsxs', 'drivers'];
                    if (skipDirs.some(skip => entry.name.toLowerCase().includes(skip))) continue;

                    // Recursively scan subdirectories
                    apps.push(...await this.scanFolder(fullPath, depth + 1, maxDepth));
                } else if (entry.isFile() && entry.name.endsWith('.exe')) {
                    // Apply filtering logic
                    if (this.isValidAppName(entry.name, folderPath)) {
                        const name = this.cleanGameName(path.basename(entry.name, '.exe'));
                        apps.push({
                            id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            name: name,
                            executablePath: fullPath,
                            installPath: folderPath,
                            launcher: 'desktop',
                            itemType: 'app', // NEW: Default custom apps to 'app' type
                            coverImage: null,
                            backgroundImage: null
                        });
                    }
                }
            }
        } catch (e) {
            console.error(`Error scanning folder ${folderPath}:`, e.message);
        }

        return apps;
    }

    async deepScanPC() {
        console.log('Starting deep scan of typical game directories (safe mode)...');
        const apps = [];
        const drives = ['C:', 'D:', 'E:', 'F:'];
        
        // ONLY scan game-specific directories, never system/ProgramData
        const commonDirs = [
            'Games', 
            'Game', 
            'My Games',
            'SteamLibrary\\steamapps\\common',
            'Program Files\\Epic Games',
            'Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games',
            // NOTE: We intentionally SKIP raw "Program Files" and "Program Files (x86)" to avoid picking up utilities
            path.join(os.homedir(), 'Games'),
            path.join(os.homedir(), 'AppData', 'Local', 'Games')
        ];

        // NEVER scan these paths - they are pure system folders
        const neverScan = [
            'c:\\windows',
            'c:\\programdata',
            'c:\\program files',
            'c:\\program files (x86)',
            'c:\\system volume information'
        ];

        for (const drive of drives) {
            for (const dir of commonDirs) {
                const fullPath = (dir.includes(':')) ? dir : path.join(drive, dir);
                
                // Check if we should scan this path
                const lowerPath = fullPath.toLowerCase();
                if (neverScan.some(never => lowerPath.startsWith(never))) {
                    console.log(`Skipping dangerous path: ${fullPath}`);
                    continue;
                }

                if (fs.existsSync(fullPath)) {
                    try {
                        const folders = fs.readdirSync(fullPath);
                        for (const folder of folders) {
                            const folderPath = path.join(fullPath, folder);
                            if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
                                const exes = this.findExecutables(folderPath, 1);
                                if (exes.length > 0) {
                                    const mainExePath = exes[0];
                                    const exeName = path.basename(mainExePath);

                                    if (this.isValidAppName(exeName, folderPath)) {
                                        const name = folder.replace(/_/g, ' ');
                                        apps.push({
                                            id: `deep_${folder.toLowerCase().replace(/\s+/g, '_')}`,
                                            name: this.cleanGameName(name),
                                            executablePath: mainExePath,
                                            installPath: folderPath,
                                            launcher: 'manual',
                                            itemType: 'app', // NEW: Default manual scans to 'app' unless verified
                                            coverImage: null,
                                            backgroundImage: null
                                        });
                                    }
                                }
                            }
                        }
                    } catch (e) { }
                }
            }
        }
        return apps;
    }

    isLikelySystemApp(name) {
        const systemKeywords = ['system', 'service', 'support', 'client', 'tool', 'framework', 'update', 'security', 'notebook', 'microsoft', 'windows'];
        return systemKeywords.some(k => name.toLowerCase().includes(k)) && !name.toLowerCase().includes('game');
    }

    hasTooManyNumbers(name) {
        const numbers = name.match(/\d/g);
        if (!numbers) return false;
        // If more than 40% of the name is numbers or there's a sequence of 5+ numbers
        const ratio = numbers.length / name.length;
        const sequence = name.match(/\d{5,}/);
        return ratio > 0.4 || !!sequence;
    }

    async enrichGameMetadata(games) {
        const batchSize = 10;
        const enriched = [];
        console.log(`Starting metadata enrichment for ${games.length} games in batches of ${batchSize}...`);

        for (let i = 0; i < games.length; i += batchSize) {
            const batch = games.slice(i, i + batchSize);
            const promises = batch.map(game => {
                // Only fetch if missing or invalid
                if (!game.coverImage || game.coverImage.includes('null') || game.coverImage === '') {
                    return this.fetchWithRetry(game);
                }
                return Promise.resolve(game);
            });

            const results = await Promise.allSettled(promises);
            results.forEach((r, idx) => {
                enriched.push(r.status === 'fulfilled' ? r.value : batch[idx]);
            });

            console.log(`Artwork progress: ${enriched.length}/${games.length}`);
        }
        return enriched;
    }

    async fetchWithRetry(game, attempts = 3) {
        try {
            const metadata = await this.findArtworkBetter(game.name);
            if (metadata) {
                return {
                    ...game,
                    coverImage: metadata.cover,
                    backgroundImage: metadata.background,
                    name: (metadata.name && metadata.name.length < 50) ? metadata.name : game.name
                };
            }
        } catch (e) {
            console.error(`Error searching artwork for ${game.name}:`, e.message);
        }
        return game;
    }

    async findArtworkBetter(gameName) {
        const variations = [
            gameName,
            gameName.replace(/[^a-zA-Z0-9\s]/g, ''), // No special characters
            gameName.split(' ').slice(0, 3).join(' '), // First 3 words
            gameName.replace(/\b(Edition|Remastered|Complete|Gold|Ultimate|Original|Classic)\b/gi, '').trim()
        ].filter((v, i, self) => v && self.indexOf(v) === i);

        for (const nameVar of variations) {
            try {
                const metadata = await this.fetchOnlineMetadata(nameVar);
                if (metadata) return metadata;
            } catch (e) { }
        }
        return null;
    }

    async fetchOnlineMetadata(gameName) {
        try {
            console.log(`Searching online for: ${gameName}`);
            // Use Steam Store API
            const searchUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(gameName)}&l=english&cc=US`;

            const execSync = require('child_process').execSync;
            // Enhanced PowerShell command with higher security and timeout
            const cmd = `powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $response = Invoke-RestMethod -Uri '${searchUrl}' -TimeoutSec 10; if ($response.items.Count -gt 0) { $response.items[0] | ConvertTo-Json -Compress } else { '' }"`;

            const output = execSync(cmd, { encoding: 'utf8', timeout: 15000 });

            if (output && output.trim()) {
                const item = JSON.parse(output);
                if (item && item.id) {
                    const appId = item.id;
                    return {
                        name: item.name,
                        cover: `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/library_600x900_2x.jpg`,
                        background: `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/library_hero.jpg`
                    };
                }
            }
        } catch (error) {
            // Log fewer details for common non-errors
            if (!error.message.includes('15000')) {
                console.error(`Cover search failed for ${gameName}:`, error.message);
            }
        }
        return null;
    }

    // STEAM SCANNER
    async scanSteam() {
        const games = [];

        try {
            // Find Steam installation paths
            const steamPaths = this.findSteamPaths();

            for (const steamPath of steamPaths) {
                const libraryFolders = this.getSteamLibraryFolders(steamPath);

                for (const libraryPath of libraryFolders) {
                    const steamAppsPath = path.join(libraryPath, 'steamapps');

                    if (fs.existsSync(steamAppsPath)) {
                        const manifests = fs.readdirSync(steamAppsPath)
                            .filter(f => f.startsWith('appmanifest_') && f.endsWith('.acf'));

                        for (const manifest of manifests) {
                            try {
                                const game = this.parseSteamManifest(
                                    path.join(steamAppsPath, manifest),
                                    steamAppsPath
                                );
                                if (game) {
                                    games.push(game);
                                }
                            } catch (err) {
                                console.error(`Error parsing ${manifest}:`, err);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error scanning Steam:', error);
        }

        return games;
    }

    findSteamPaths() {
        const paths = [];
        const possiblePaths = [
            'C:\\Program Files (x86)\\Steam',
            'C:\\Program Files\\Steam',
            path.join(this.homeDir, 'Steam'),
            'D:\\Steam',
            'E:\\Steam',
            'D:\\SteamLibrary',
            'E:\\SteamLibrary'
        ];

        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                paths.push(p);
            }
        }

        return paths;
    }

    getSteamLibraryFolders(steamPath) {
        const libraryFolders = [steamPath];
        const libraryFoldersPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');

        if (fs.existsSync(libraryFoldersPath)) {
            try {
                const content = fs.readFileSync(libraryFoldersPath, 'utf8');
                const pathMatches = content.match(/"path"\s+"([^"]+)"/g);

                if (pathMatches) {
                    for (const match of pathMatches) {
                        const pathValue = match.match(/"path"\s+"([^"]+)"/)[1];
                        const normalizedPath = pathValue.replace(/\\\\/g, '\\');
                        if (fs.existsSync(normalizedPath) && !libraryFolders.includes(normalizedPath)) {
                            libraryFolders.push(normalizedPath);
                        }
                    }
                }
            } catch (error) {
                console.error('Error reading library folders:', error);
            }
        }

        return libraryFolders;
    }

    parseSteamManifest(manifestPath, steamAppsPath) {
        const content = fs.readFileSync(manifestPath, 'utf8');

        const appIdMatch = content.match(/"appid"\s+"(\d+)"/);
        const nameMatch = content.match(/"name"\s+"([^"]+)"/);
        const installDirMatch = content.match(/"installdir"\s+"([^"]+)"/);
        const stateMatch = content.match(/"StateFlags"\s+"(\d+)"/);

        if (!appIdMatch || !nameMatch) return null;

        // StateFlags 4 = fully installed
        const stateFlags = stateMatch ? parseInt(stateMatch[1]) : 0;
        if (stateFlags !== 4) return null;

        const appId = appIdMatch[1];
        const name = nameMatch[1];
        const installDir = installDirMatch ? installDirMatch[1] : name;
        const gamePath = path.join(steamAppsPath, 'common', installDir);

        // Skip tools and some known non-game apps
        const skipApps = ['Steamworks Common Redistributables', 'Steam Linux Runtime'];
        if (skipApps.includes(name)) return null;

        return {
            id: `steam_${appId}`,
            name: name,
            executablePath: gamePath,
            installPath: gamePath,
            launcher: 'steam',
            itemType: 'game', // NEW: Steam games are always games
            steamAppId: appId, // NEW: Store appId for stats fetching
            coverImage: `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/library_600x900_2x.jpg`,
            backgroundImage: `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/library_hero.jpg`
        };
    }

    cleanGameName(name) {
        if (!name) return 'Unknown Game';

        let cleaned = name
            .replace(/^Microsoft\./i, '')
            .replace(/^EA\./i, '')
            .replace(/^Ubisoft\s+/i, '')
            .replace(/\b(Game|Launcher)\b/gi, '')
            .replace(/\.exe$/i, '')
            .replace(/([a-z])([A-Z0-9])/g, '$1 $2') // Add spaces before Caps or Numbers
            .replace(/[_\-\.]/g, ' ') // Replace underscores, dashes, and dots with spaces
            .replace(/\s+/g, ' ') // Collapse multiple spaces
            .trim();

        // Specific franchise cleanup
        cleaned = cleaned.replace(/ResidentEvil/gi, 'Resident Evil');
        cleaned = cleaned.replace(/\bRE(\d+)\b/gi, 'Resident Evil $1');
        cleaned = cleaned.replace(/AssassinsCreed/gi, "Assassin's Creed");
        cleaned = cleaned.replace(/Cod(\d+)/gi, 'Call of Duty $1');
        cleaned = cleaned.replace(/Gta(\d+)/gi, 'Grand Theft Auto $1');

        return cleaned;
    }

    // EPIC GAMES SCANNER
    async scanEpicGames() {
        const games = [];
        try {
            const manifestsPath = path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Epic\\EpicGamesLauncher\\Data\\Manifests');
            if (!fs.existsSync(manifestsPath)) return games;

            const manifests = fs.readdirSync(manifestsPath).filter(f => f.endsWith('.item'));
            for (const manifest of manifests) {
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(manifestsPath, manifest), 'utf8'));
                    if (data.bIsIncompleteInstall) continue;

                    games.push({
                        id: `epic_${data.CatalogItemId || data.AppName}`,
                        name: data.DisplayName,
                        executablePath: path.join(data.InstallLocation, data.LaunchExecutable || ''),
                        installPath: data.InstallLocation,
                        launcher: 'epic',
                        itemType: 'game', // NEW: Epic games are always games
                        epicAppName: data.AppName, // CRITICAL: This is needed for the protocol launch!
                        coverImage: null,
                        backgroundImage: null
                    });
                } catch (err) { }
            }
        } catch (error) { }
        return games;
    }

    // XBOX GAME PASS SCANNER
    async scanXboxGamePass() {
        const games = [];
        try {
            const command = `powershell -Command "Get-AppxPackage | Where-Object {$_.SignatureKind -eq 'Store' -and $_.IsFramework -eq $false} | Select-Object Name, PackageFamilyName, InstallLocation | ConvertTo-Json -Compress"`;
            const output = execSync(command, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
            const apps = JSON.parse(output);

            const excludePatterns = [
                'Microsoft.', 'Windows.', 'Xbox.TCUI', 'Xbox.IdentityProvider',
                'GamingOverlay', 'SpeechToText', 'GamingApp', 'Office.',
                'Paint', 'People', 'ScreenSketch', 'StorePurchase', 'VideoExtensions',
                'YourPhone', 'Zune.', 'Edge', 'MixedReality', 'Weather', 'Todo',
                'PowerAutomate', 'WebMedia', 'WebpExtension', 'Services.', 'Security',
                'Notebook', 'Notepad', 'StickyNotes', 'Calculator', 'Camera', 'Photos'
            ];

            for (const app of Array.isArray(apps) ? apps : [apps]) {
                if (!app || !app.PackageFamilyName || !app.InstallLocation) continue;
                if (excludePatterns.some(pattern => app.Name?.startsWith(pattern) || app.PackageFamilyName?.includes(pattern))) continue;

                const lowerName = app.Name.toLowerCase();
                const lowerPackage = app.PackageFamilyName.toLowerCase();

                // Custom user filters: Windows apps, system apps, and names with lots of numbers
                if (lowerName.includes('windows') || lowerPackage.includes('windows')) continue;
                if (this.isLikelySystemApp(app.Name) || this.isLikelySystemApp(app.PackageFamilyName)) continue;
                if (this.hasTooManyNumbers(app.Name) || this.hasTooManyNumbers(app.PackageFamilyName)) continue;

                const name = this.cleanGameName(app.Name);
                games.push({
                    id: `xbox_${app.PackageFamilyName}`,
                    name: name,
                    executablePath: app.InstallLocation,
                    installPath: app.InstallLocation,
                    launcher: 'xbox',
                    itemType: 'game', // NEW: Xbox games are always games
                    packageFamilyName: app.PackageFamilyName,
                    coverImage: null,
                    backgroundImage: null
                });
            }
        } catch (error) { }
        return games;
    }

    // EA APP SCANNER
    async scanEAApp() {
        const games = [];
        try {
            const eaPaths = [
                path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'EA Desktop', 'InstallData'),
                path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Origin', 'LocalContent')
            ];

            for (const contentPath of eaPaths) {
                if (!fs.existsSync(contentPath)) continue;
                const items = fs.readdirSync(contentPath);
                for (const item of items) {
                    const itemPath = path.join(contentPath, item);
                    if (fs.statSync(itemPath).isDirectory()) {
                        const mfstFiles = fs.readdirSync(itemPath).filter(f => f.endsWith('.mfst'));
                        for (const mfst of mfstFiles) {
                            try {
                                const content = fs.readFileSync(path.join(itemPath, mfst), 'utf8');
                                const params = new URLSearchParams(content);
                                const id = params.get('id');
                                const installPath = params.get('installpath');
                                if (id && installPath) {
                                    games.push({
                                        id: `ea_${id}`,
                                        name: this.cleanGameName(item.replace(/_/g, ' ')),
                                        executablePath: installPath,
                                        installPath: installPath,
                                        launcher: 'ea',
                                        itemType: 'game', // NEW: EA games are always games
                                        eaId: id,
                                        coverImage: null,
                                        backgroundImage: null
                                    });
                                }
                            } catch (err) { }
                        }
                    }
                }
            }
        } catch (error) { }
        return games;
    }

    // UBISOFT CONNECT SCANNER
    async scanUbisoftConnect() {
        const games = [];
        try {
            const ubisoftPaths = [
                'C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games',
                'D:\\Games\\Ubisoft',
                'E:\\Games\\Ubisoft'
            ];

            for (const gamesPath of ubisoftPaths) {
                if (!fs.existsSync(gamesPath)) continue;
                const folders = fs.readdirSync(gamesPath);
                for (const folder of folders) {
                    const gamePath = path.join(gamesPath, folder);
                    if (fs.statSync(gamePath).isDirectory()) {
                        const exes = this.findExecutables(gamePath);
                        games.push({
                            id: `ubisoft_${folder.toLowerCase().replace(/\s+/g, '_')}`,
                            name: this.cleanGameName(folder),
                            executablePath: exes[0] || null,
                            installPath: gamePath,
                            launcher: 'ubisoft',
                            itemType: 'game', // NEW: Ubisoft games are always games
                            coverImage: null,
                            backgroundImage: null
                        });
                    }
                }
            }
        } catch (error) { }
        return games;
    }

    // GOG GALAXY SCANNER
    async scanGOG() {
        const games = [];

        try {
            // Check GOG Galaxy database
            const gogDbPath = path.join(
                process.env.PROGRAMDATA || 'C:\\ProgramData',
                'GOG.com\\Galaxy\\storage\\galaxy-2.0.db'
            );

            // Fallback to game folders
            const gogPaths = [
                'C:\\GOG Games',
                'C:\\Program Files (x86)\\GOG Galaxy\\Games',
                'D:\\GOG Games',
                path.join(this.homeDir, 'GOG Games')
            ];

            for (const gamesPath of gogPaths) {
                if (!fs.existsSync(gamesPath)) continue;

                const gameFolders = fs.readdirSync(gamesPath)
                    .filter(f => {
                        const fullPath = path.join(gamesPath, f);
                        return fs.statSync(fullPath).isDirectory();
                    });

                for (const folder of gameFolders) {
                    const gamePath = path.join(gamesPath, folder);

                    // Look for goggame-*.info file
                    const infoFiles = fs.readdirSync(gamePath)
                        .filter(f => f.startsWith('goggame-') && f.endsWith('.info'));

                    if (infoFiles.length > 0) {
                        try {
                            const info = JSON.parse(
                                fs.readFileSync(path.join(gamePath, infoFiles[0]), 'utf8')
                            );

                            games.push({
                                id: `gog_${info.gameId}`,
                                name: info.name,
                                executablePath: path.join(gamePath, info.playTasks?.[0]?.path || ''),
                                installPath: gamePath,
                                launcher: 'gog',
                                itemType: 'game', // NEW: GOG games are always games
                                coverImage: null,
                                backgroundImage: null
                            });
                        } catch (err) {
                            // Fallback to folder name
                            games.push({
                                id: `gog_${folder.toLowerCase().replace(/\s+/g, '_')}`,
                                name: folder,
                                executablePath: null,
                                installPath: gamePath,
                                launcher: 'gog',
                                itemType: 'game', // NEW: GOG games are always games
                                coverImage: null,
                                backgroundImage: null
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error scanning GOG:', error);
        }

        return games;
    }

    findExecutables(directory, depth = 2) {
        const exeFiles = [];

        try {
            const items = fs.readdirSync(directory);

            for (const item of items) {
                const fullPath = path.join(directory, item);
                const stat = fs.statSync(fullPath);

                if (stat.isFile() && item.endsWith('.exe')) {
                    // Skip common non-game executables
                    const skipExes = ['unins', 'setup', 'config', 'crash', 'report', 'launcher'];
                    const lowerName = item.toLowerCase();

                    if (!skipExes.some(skip => lowerName.includes(skip))) {
                        exeFiles.push(fullPath);
                    }
                } else if (stat.isDirectory() && depth > 0) {
                    exeFiles.push(...this.findExecutables(fullPath, depth - 1));
                }
            }
        } catch (error) {
            // Ignore permission errors
        }

        return exeFiles;
    }

    // ACHIEVEMENT FETCHING
    async fetchAchievements(game) {
        console.log(`Fetching achievements for: ${game.name} (${game.launcher})`);

        try {
            switch (game.launcher) {
                case 'steam':
                    return await this.fetchSteamAchievements(game);
                case 'xbox':
                    return await this.fetchXboxAchievements(game);
                case 'epic':
                    return await this.fetchEpicAchievements(game);
                default:
                    return { unlocked: 0, total: 0, list: [] };
            }
        } catch (error) {
            console.error(`Failed to fetch achievements for ${game.name}:`, error);
            return { unlocked: 0, total: 0, list: [] };
        }
    }

    async fetchSteamAchievements(game) {
        const appId = game.id.replace('steam_', '');
        // For Steam, without an API key, we try to use the public global achievement percentages 
        // as a benchmark for total count, or fallback. 
        // Realistically, to get user-specific achievements, we need a key.
        // For this demo, we'll try to fetch total count from public API.
        try {
            const url = `https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${appId}`;
            const cmd = `powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $resp = Invoke-RestMethod -Uri '${url}'; $resp.achievementpercentages.achievements | ConvertTo-Json -Compress"`;
            const output = execSync(cmd, { encoding: 'utf8', timeout: 10000 });

            if (output && output.trim()) {
                const list = JSON.parse(output);
                return {
                    unlocked: 0, // Cannot get personal unlocked without API Key
                    total: Array.isArray(list) ? list.length : 0,
                    list: []
                };
            }
        } catch (e) { }
        return { unlocked: 0, total: 0, list: [] };
    }

    async fetchXboxAchievements(game) {
        try {
            // Use PowerShell to attempt fetching via Xbox Game Services
            const cmd = `powershell -Command "Get-AppxPackage -Name '*${game.name.replace(/\s+/g, '*')}*' | Select-Object -First 1 | ForEach-Object { Get-XboxAchievement -PackageFamilyName $_.PackageFamilyName } | ConvertTo-Json -Compress"`;
            const output = execSync(cmd, { encoding: 'utf8', timeout: 15000 });

            if (output && output.trim()) {
                const list = JSON.parse(output);
                const achievements = Array.isArray(list) ? list : [list];
                const unlocked = achievements.filter(a => a.progressState === 'Achieved').length;
                return {
                    unlocked: unlocked,
                    total: achievements.length,
                    list: achievements.map(a => ({ name: a.name, description: a.description, unlocked: a.progressState === 'Achieved' }))
                };
            }
        } catch (e) { }
        return { unlocked: 0, total: 0, list: [] };
    }

    async fetchEpicAchievements(game) {
        // Epic achievements are extremely hard to get without official SDK/Key.
        // We'll return 0/0 for now to avoid errors.
        return { unlocked: 0, total: 0, list: [] };
    }
}

module.exports = { GameScanner };
