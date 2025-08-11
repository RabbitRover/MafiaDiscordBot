/**
 * Logging utility for the Mafia bot
 * Provides consistent logging with configurable levels
 */

const config = require('../game/config');

class Logger {
    constructor() {
        this.logLevel = config.LOG_LEVEL || 'info';
        this.levels = {
            'debug': 0,
            'info': 1,
            'warn': 2,
            'error': 3
        };
    }

    /**
     * Check if a log level should be displayed
     * @param {string} level - The log level to check
     * @returns {boolean} - Whether the level should be logged
     */
    shouldLog(level) {
        return this.levels[level] >= this.levels[this.logLevel];
    }

    /**
     * Format log message with timestamp and level
     * @param {string} level - The log level
     * @param {string} message - The message to log
     * @param {*} data - Additional data to log
     * @returns {string} - Formatted log message
     */
    formatMessage(level, message, data) {
        const timestamp = new Date().toISOString();
        const levelUpper = level.toUpperCase();
        let formattedMessage = `[${timestamp}] [${levelUpper}] ${message}`;
        
        if (data !== undefined) {
            if (typeof data === 'object') {
                formattedMessage += `\n${JSON.stringify(data, null, 2)}`;
            } else {
                formattedMessage += ` ${data}`;
            }
        }
        
        return formattedMessage;
    }

    /**
     * Log a debug message
     * @param {string} message - The message to log
     * @param {*} data - Additional data to log
     */
    debug(message, data) {
        if (this.shouldLog('debug')) {
            console.log(this.formatMessage('debug', message, data));
        }
    }

    /**
     * Log an info message
     * @param {string} message - The message to log
     * @param {*} data - Additional data to log
     */
    info(message, data) {
        if (this.shouldLog('info')) {
            console.log(this.formatMessage('info', message, data));
        }
    }

    /**
     * Log a warning message
     * @param {string} message - The message to log
     * @param {*} data - Additional data to log
     */
    warn(message, data) {
        if (this.shouldLog('warn')) {
            console.warn(this.formatMessage('warn', message, data));
        }
    }

    /**
     * Log an error message
     * @param {string} message - The message to log
     * @param {*} data - Additional data to log
     */
    error(message, data) {
        if (this.shouldLog('error')) {
            console.error(this.formatMessage('error', message, data));
        }
    }

    /**
     * Log game-specific events
     * @param {string} event - The game event
     * @param {string} gameId - The game identifier
     * @param {*} data - Additional event data
     */
    gameEvent(event, gameId, data) {
        this.info(`[GAME:${gameId}] ${event}`, data);
    }

    /**
     * Log user actions
     * @param {string} action - The user action
     * @param {string} userId - The user ID
     * @param {string} gameId - The game identifier
     * @param {*} data - Additional action data
     */
    userAction(action, userId, gameId, data) {
        this.info(`[USER:${userId}][GAME:${gameId}] ${action}`, data);
    }

    /**
     * Log system errors with context
     * @param {string} context - The context where the error occurred
     * @param {Error} error - The error object
     * @param {*} additionalData - Additional context data
     */
    systemError(context, error, additionalData) {
        this.error(`[SYSTEM:${context}] ${error.message}`, {
            stack: error.stack,
            context,
            ...additionalData
        });
    }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;
