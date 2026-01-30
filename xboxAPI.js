const axios = require('axios');
const logger = require('./logger');

class XboxAPI {
    constructor() {
        this.apiKey = null;
        this.baseUrl = 'https://xbl.io/api/v2';
    }

    setApiKey(key) {
        this.apiKey = key;
    }

    /**
     * Fetch user profile to get XUID
     */
    async getProfile() {
        if (!this.apiKey) throw new Error('Xbox API Key not configured');
        try {
            const response = await axios.get(`${this.baseUrl}/account`, {
                headers: { 'X-Authorization': this.apiKey }
            });
            return response.data[0]; // xbl.io returns an array for account
        } catch (error) {
            logger.error('Xbox Profile fetch failed', error);
            throw error;
        }
    }

    /**
     * Fetch recent games and playtime
     */
    async getRecentGames() {
        if (!this.apiKey) throw new Error('Xbox API Key not configured');
        try {
            const response = await axios.get(`${this.baseUrl}/player/titles`, {
                headers: { 'X-Authorization': this.apiKey }
            });
            return response.data;
        } catch (error) {
            logger.error('Xbox Titles fetch failed', error);
            throw error;
        }
    }

    /**
     * Fetch achievements for a specific title
     */
    async getAchievements(titleId) {
        if (!this.apiKey) throw new Error('Xbox API Key not configured');
        try {
            const profile = await this.getProfile();
            const xuid = profile.xuid;
            const response = await axios.get(`${this.baseUrl}/achievements/player/${xuid}/title/${titleId}`, {
                headers: { 'X-Authorization': this.apiKey }
            });
            return response.data;
        } catch (error) {
            logger.error(`Xbox Achievements fetch failed for ${titleId}`, error);
            throw error;
        }
    }

    /**
     * Sync Xbox data with local database
     */
    async syncWithDatabase(db) {
        try {
            const data = await this.getRecentGames();
            if (!data || !data.titles) return { success: false, error: 'No data returned' };

            let updatedTotal = 0;
            for (const xgame of data.titles) {
                // Try to find matching game in local DB
                // matching by name or platformId
                const localGames = db.getAllGames();
                const match = localGames.find(g =>
                    g.launcher === 'xbox' &&
                    (g.name === xgame.name || g.platformIds?.xbox === xgame.titleId)
                );

                if (match) {
                    const stats = {
                        playTime: xgame.minutesPlayed,
                        lastPlayed: xgame.lastPlayed,
                        statsSource: 'xbl.io'
                    };
                    db.updateGameStats(match.id, stats);
                    updatedTotal++;
                }
            }
            return { success: true, updated: updatedTotal };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = new XboxAPI();
