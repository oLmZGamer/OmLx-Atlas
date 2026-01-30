const https = require('https');
const logger = require('./logger');

/**
 * Steam Web API Client
 * Handles all Steam API interactions for playtime sync and achievements
 */
class SteamAPIClient {
    constructor() {
        this.apiKey = null;
        this.steamId64 = null;
        this.baseUrl = 'api.steampowered.com';
    }

    /**
     * Configure the client with credentials
     */
    setCredentials(apiKey, steamId64) {
        this.apiKey = apiKey;
        this.steamId64 = steamId64;
        logger.dev('SteamAPI', 'Credentials updated', {
            hasKey: !!apiKey,
            steamId: steamId64 ? steamId64.substring(0, 5) + '...' : null
        });
    }

    /**
     * Check if credentials are configured
     */
    hasCredentials() {
        return !!(this.apiKey && this.steamId64);
    }

    /**
     * Make an API request with timeout and error handling
     */
    async makeRequest(endpoint, params = {}) {
        return new Promise((resolve, reject) => {
            if (!this.hasCredentials()) {
                reject(new Error('Steam API credentials not configured'));
                return;
            }

            const queryParams = new URLSearchParams({
                key: this.apiKey,
                steamid: this.steamId64,
                format: 'json',
                ...params
            });

            const options = {
                hostname: this.baseUrl,
                path: `${endpoint}?${queryParams.toString()}`,
                method: 'GET',
                timeout: 10000
            };

            logger.dev('SteamAPI', `Request: ${endpoint}`);

            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        if (res.statusCode === 200) {
                            const json = JSON.parse(data);
                            resolve(json);
                        } else if (res.statusCode === 401 || res.statusCode === 403) {
                            reject(new Error('Invalid Steam API key'));
                        } else {
                            reject(new Error(`Steam API error: ${res.statusCode}`));
                        }
                    } catch (e) {
                        reject(new Error('Failed to parse Steam API response'));
                    }
                });
            });

            req.on('error', (e) => {
                logger.error('Steam API request failed', e);
                reject(e);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Steam API request timeout'));
            });

            req.end();
        });
    }

    /**
     * Validate credentials by making a test request
     */
    async validateCredentials() {
        try {
            logger.info('Testing Steam API connection...');
            const result = await this.makeRequest('/ISteamUser/GetPlayerSummaries/v2/', {
                steamids: this.steamId64
            });

            if (result.response && result.response.players && result.response.players.length > 0) {
                const player = result.response.players[0];
                logger.success(`Steam connected as: ${player.personaname}`);
                return {
                    valid: true,
                    username: player.personaname,
                    avatar: player.avatarfull
                };
            }

            logger.warn('Steam API returned empty player data');
            return { valid: false, error: 'Could not find Steam profile' };
        } catch (error) {
            logger.error('Steam validation failed', error);
            return { valid: false, error: error.message };
        }
    }

    /**
     * Get owned games with playtime
     */
    async getOwnedGames() {
        try {
            logger.info('Fetching Steam library...');
            const result = await this.makeRequest('/IPlayerService/GetOwnedGames/v1/', {
                include_appinfo: 1,
                include_played_free_games: 1
            });

            if (result.response && result.response.games) {
                const games = result.response.games.map(game => ({
                    appId: game.appid,
                    name: game.name,
                    playtimeMinutes: game.playtime_forever || 0,
                    playtimeTwoWeeks: game.playtime_2weeks || 0,
                    lastPlayed: game.rtime_last_played ? new Date(game.rtime_last_played * 1000).toISOString() : null,
                    iconUrl: game.img_icon_url ? `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg` : null
                }));

                logger.success(`Found ${games.length} games in Steam library`);
                logger.dev('SteamAPI', 'Owned games fetched', { count: games.length });
                return { success: true, games };
            }

            return { success: false, error: 'No games found', games: [] };
        } catch (error) {
            logger.error('Failed to fetch Steam games', error);
            return { success: false, error: error.message, games: [] };
        }
    }

    /**
     * Get achievements for a specific game
     */
    async getPlayerAchievements(appId) {
        try {
            logger.info(`Fetching achievements for app ${appId}...`);
            const result = await this.makeRequest('/ISteamUserStats/GetPlayerAchievements/v1/', {
                appid: appId
            });

            if (result.playerstats && result.playerstats.achievements) {
                const achievements = result.playerstats.achievements;
                const unlocked = achievements.filter(a => a.achieved === 1).length;
                const total = achievements.length;

                logger.success(`Achievements for ${appId}: ${unlocked}/${total}`);
                return {
                    success: true,
                    gameName: result.playerstats.gameName,
                    achievements: achievements.map(a => ({
                        name: a.apiname,
                        achieved: a.achieved === 1,
                        unlockTime: a.unlocktime ? new Date(a.unlocktime * 1000).toISOString() : null
                    })),
                    unlocked,
                    total
                };
            }

            return { success: false, error: 'No achievements data', achievements: [] };
        } catch (error) {
            // Some games don't have achievements - this is normal
            if (error.message.includes('400')) {
                return { success: false, error: 'Game has no achievements', achievements: [] };
            }
            logger.warn(`Could not fetch achievements for ${appId}`, { error: error.message });
            return { success: false, error: error.message, achievements: [] };
        }
    }

    /**
     * Sync playtime for all Steam games in the database
     */
    async syncPlaytimeWithDatabase(database) {
        try {
            logger.info('Syncing Steam playtime with database...');

            const { success, games, error } = await this.getOwnedGames();

            if (!success) {
                return { success: false, error, synced: 0 };
            }

            let synced = 0;
            const allDbGames = database.getAllGames();

            for (const steamGame of games) {
                // Find matching game in database
                const dbGame = allDbGames.find(g => {
                    if (g.launcher !== 'steam') return false;
                    const steamAppId = g.steamAppId || g.id.replace('steam_', '');
                    return steamAppId == steamGame.appId;
                });

                if (dbGame) {
                    // Update playtime and last played
                    const updated = database.updateGameStats(dbGame.id, {
                        playTime: steamGame.playtimeMinutes,
                        lastPlayed: steamGame.lastPlayed,
                        statsSource: 'steam'
                    });

                    if (updated) {
                        synced++;
                        logger.dev('SteamAPI', `Synced ${steamGame.name}`, {
                            playtime: steamGame.playtimeMinutes
                        });
                    }
                }
            }

            logger.success(`Synced playtime for ${synced} games`);
            return { success: true, synced, total: games.length };
        } catch (error) {
            logger.error('Playtime sync failed', error);
            return { success: false, error: error.message, synced: 0 };
        }
    }
}

// Export singleton instance
module.exports = new SteamAPIClient();
