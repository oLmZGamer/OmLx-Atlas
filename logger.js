const fs = require('fs');
const path = require('path');
const os = require('os');

class Logger {
    constructor(appName = 'OmLx-Atlas') {
        this.appName = appName;
        this.logsDir = path.join(os.homedir(), 'Documents', 'OmLx Atlas', 'logs');
        this.devLogsDir = path.join(this.logsDir, 'dev');
        this.userLogsDir = path.join(this.logsDir, 'user');

        // Create log directories
        this.ensureDirectories();

        // Create log file names with timestamp
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        this.devLogFile = path.join(this.devLogsDir, `dev-${timestamp}.log`);
        this.userLogFile = path.join(this.userLogsDir, `session-${timestamp}.log`);
        this.errorLogFile = path.join(this.userLogsDir, `errors-${timestamp}.log`);

        // Initialize log files
        this.initLogFiles();

        // Clean old logs (keep last 10 sessions for user, 30 for dev)
        this.cleanOldLogs(this.userLogsDir, 10);
        this.cleanOldLogs(this.devLogsDir, 30);
    }

    ensureDirectories() {
        const dirs = [this.logsDir, this.devLogsDir, this.userLogsDir];
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
    }

    initLogFiles() {
        const initMessage = `=== ${this.appName} Session Started ===\nTime: ${new Date().toLocaleString()}\nPlatform: ${os.platform()} ${os.release()}\n\n`;
        fs.writeFileSync(this.devLogFile, initMessage, 'utf8');
        fs.writeFileSync(this.userLogFile, initMessage, 'utf8');
        fs.writeFileSync(this.errorLogFile, '', 'utf8');
    }

    cleanOldLogs(directory, keepCount) {
        try {
            const files = fs.readdirSync(directory)
                .filter(f => f.endsWith('.log'))
                .map(f => ({
                    name: f,
                    path: path.join(directory, f),
                    time: fs.statSync(path.join(directory, f)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time);

            // Delete older logs
            for (let i = keepCount; i < files.length; i++) {
                fs.unlinkSync(files[i].path);
            }
        } catch (e) {
            // Ignore cleanup errors
        }
    }

    formatMessage(level, module, message, data = null) {
        const timestamp = new Date().toISOString();
        let formatted = `[${timestamp}] [${level}] [${module}] ${message}`;
        if (data) {
            formatted += `\nData: ${JSON.stringify(data, null, 2)}`;
        }
        return formatted + '\n';
    }

    // Developer logs (detailed, technical)
    dev(module, message, data = null) {
        const formatted = this.formatMessage('DEV', module, message, data);
        fs.appendFileSync(this.devLogFile, formatted, 'utf8');
        console.log(`[DEV] [${module}] ${message}`);
    }

    // User-friendly logs (what's happening)
    info(message) {
        const timestamp = new Date().toLocaleTimeString();
        const formatted = `[${timestamp}] ${message}\n`;
        fs.appendFileSync(this.userLogFile, formatted, 'utf8');
        console.log(`[INFO] ${message}`);
    }

    // Success messages
    success(message) {
        const timestamp = new Date().toLocaleTimeString();
        const formatted = `[${timestamp}] ✓ ${message}\n`;
        fs.appendFileSync(this.userLogFile, formatted, 'utf8');
        console.log(`[SUCCESS] ${message}`);
    }

    // Warning messages
    warn(message, details = null) {
        const timestamp = new Date().toLocaleTimeString();
        let formatted = `[${timestamp}] ⚠ WARNING: ${message}\n`;
        if (details) {
            formatted += `Details: ${JSON.stringify(details, null, 2)}\n`;
        }
        fs.appendFileSync(this.userLogFile, formatted, 'utf8');
        fs.appendFileSync(this.devLogFile, this.formatMessage('WARN', 'System', message, details), 'utf8');
        console.warn(`[WARN] ${message}`);
    }

    // Error logging
    error(message, error = null, fatal = false) {
        const timestamp = new Date().toLocaleTimeString();
        let userFormatted = `[${timestamp}] ✗ ERROR: ${message}\n`;

        // User-friendly error log
        fs.appendFileSync(this.userLogFile, userFormatted, 'utf8');
        fs.appendFileSync(this.errorLogFile, userFormatted, 'utf8');

        // Detailed dev error log
        let devFormatted = this.formatMessage('ERROR', 'System', message);
        if (error) {
            devFormatted += `Error Object:\n${error.stack || error.message || error}\n`;
        }
        if (fatal) {
            devFormatted += `FATAL: Application may need to restart\n`;
        }
        fs.appendFileSync(this.devLogFile, devFormatted, 'utf8');
        fs.appendFileSync(this.errorLogFile, devFormatted, 'utf8');

        console.error(`[ERROR] ${message}`, error);
    }

    // Failed operation (user-friendly)
    failed(operation) {
        const timestamp = new Date().toLocaleTimeString();
        const formatted = `[${timestamp}] ✗ Failed: ${operation}\n`;
        fs.appendFileSync(this.userLogFile, formatted, 'utf8');
        console.log(`[FAILED] ${operation}`);
    }

    // Get log file paths for user to access
    getLogPaths() {
        return {
            userLog: this.userLogFile,
            errorLog: this.errorLogFile,
            devLog: this.devLogFile,
            logsFolder: this.logsDir
        };
    }

    // Open logs folder for user
    openLogsFolder() {
        const { shell } = require('electron');
        shell.openPath(this.logsDir);
    }
}

// Export singleton instance
module.exports = new Logger('OmLx-Atlas');
