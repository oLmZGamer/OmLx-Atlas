const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');
const os = require('os');

class GameScanner {
    constructor(database) {
        this.database = database;
        this.homeDir = os.homedir();
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

    isValidAppName(exeName, folderPath) {
        const name = exeName.toLowerCase();
        const folder = folderPath.toLowerCase();

        // BLACKLIST: Auto-reject these patterns
        const rejectPatterns = [
            /^unins\d*\.exe$/,                    // Uninstallers
            /^setup.*\.exe$/,                      // Installers
            /install/i,                             // Install scripts
            /update/i,                              // Updaters
            /crash.*report/i,                       // Crash reporters
            /^[a-f0-9]{8,}\.exe$/i,                // GUID-like names
            /\d{6,}/,                             // 6+ consecutive digits
            /_{3,}/,                              // Multiple underscores
            /-{3,}/,                              // Multiple dashes
            /\$\{.*\}/,                           // Template variables
            /helper/i, /service/i, /vcredist/i, /dotnet/i, /overlay/i,
            /manual/i, /readme/i, /license/i, /diagnostic/i, /troubleshoot/i,
            /security/i, /protection/i, /scanner/i, /antivirus/i, /firewall/i,
            /edge/i, /cortana/i, /searchui/i, /dwm/i, /vbox/i, /vmware/i
        ];

        // WHITELIST: Known good apps (always include)
        const knownApps = [
            'spotify', 'discord', 'slack', 'vscode', 'chrome', 'firefox',
            'chatgpt', 'telegram', 'whatsapp', 'zoom', 'teams', 'obs',
            'photoshop', 'illustrator', 'premiere', 'aftereffects',
            'notion', 'obsidian', 'blender', 'unity', 'unreal', 'code'
        ];

        // Check whitelist first
        if (knownApps.some(app => name.includes(app))) return true;

        // Check blacklist
        if (rejectPatterns.some(pattern => {
            if (pattern instanceof RegExp) return pattern.test(name);
            return name.includes(pattern);
        })) return false;

        // Reject if folder contains GUID codes or AppX publisher hashes (e.g., _8wekyb3d8bbwe)
        if (/[a-f0-9]{8}-[a-f0-9]{4}-/.test(folder)) return false;
        if (/[a-z0-9]{13,}/.test(folder) && folder.includes('microsoft')) return false; // AppX hash detection

        // Specific Windows folder exclusion (allow "Program Files" but not "C:\Windows")
        const winDir = process.env.SystemRoot ? process.env.SystemRoot.toLowerCase() : 'c:\\windows';
        if (folder.startsWith(winDir)) return false;

        // Reject if name is too short or generic
        if (name.length < 4 || ['app.exe', 'main.exe', 'run.exe'].includes(name)) return false;

        // ACCEPT if name is clean (letters, max 3 numbers, max 2 special chars)
        const digitCount = (name.match(/\d/g) || []).length;
        const specialCount = (name.match(/[^a-z0-9]/g) || []).length;

        return digitCount <= 3 && specialCount <= 2;
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
            const entries = fs.readdirSync(folderPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(folderPath, entry.name);

                if (entry.isDirectory()) {
                    // Skip system/hidden/junk folders
                    if (entry.name.startsWith('.') || entry.name.startsWith('$')) continue;
                    const skipDirs = ['node_modules', 'temp', 'cache', 'windows', 'system32'];
                    if (skipDirs.includes(entry.name.toLowerCase())) continue;

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
        console.log('Starting deep scan of typical app and game directories...');
        const apps = [];
        const drives = ['C:', 'D:', 'E:', 'F:'];
        const commonDirs = [
            'Games', 'Game', 'My Games',
            'SteamLibrary\\steamapps\\common',
            'Program Files\\Epic Games',
            'Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games',
            'Program Files', 'Program Files (x86)',
            path.join(os.homedir(), 'AppData', 'Local'),
            path.join(os.homedir(), 'AppData', 'Roaming')
        ];

        for (const drive of drives) {
            for (const dir of commonDirs) {
                const fullPath = (dir.includes(':')) ? dir : path.join(drive, dir);
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
