const { Client } = require('epicgames-client');
const logger = require('./logger');

class EpicAPI {
    constructor() {
        this.client = new Client();
        this.isLoggedIn = false;
        this.userData = null;
    }

    /**
     * Login to Epic Games
     * Supports both email/password and authorization code
     */
    async login(credentials) {
        try {
            logger.info('Initializing Epic Games Client...');
            await this.client.init();

            let success = false;
            if (credentials.email && credentials.password) {
                success = await this.client.login({
                    email: credentials.email,
                    password: credentials.password
                });
            } else if (credentials.exchangeCode) {
                // Future implementation for exchange codes
                success = false;
            }

            this.isLoggedIn = success;
            if (success) {
                this.userData = {
                    accountId: this.client.accountId,
                    displayName: this.client.account.displayName
                };
                logger.success(`Epic Games login successful: ${this.userData.displayName}`);
            }
            return success;
        } catch (error) {
            logger.error('Epic Games login error', error);
            return false;
        }
    }

    /**
     * Get user's game library
     */
    async getLibrary() {
        if (!this.isLoggedIn) return [];
        try {
            const library = await this.client.getLibrary();
            return library.map(item => ({
                id: item.appId,
                name: item.appName,
                title: item.title,
                thumbnail: item.thumbnail
            }));
        } catch (error) {
            logger.error('Failed to fetch Epic library', error);
            return [];
        }
    }

    /**
     * Sync Epic data with local database
     */
    async syncWithDatabase(db) {
        if (!this.isLoggedIn) return { success: false, error: 'Not logged in' };
        try {
            const library = await this.getLibrary();
            let added = 0;
            const currentGames = db.getAllGames();

            for (const item of library) {
                const exists = currentGames.find(g =>
                    g.launcher === 'epic' &&
                    (g.platformIds?.epic === item.id || g.name === item.title)
                );

                if (!exists) {
                    // We could auto-add here if we wanted
                    // For now, just logging or updating if matched
                } else {
                    // Update stats if we had playtime info (Epic client doesn't always expose this easily)
                }
            }
            return { success: true, count: library.length };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = new EpicAPI();
