/**
 * Error handling utility for the Mafia bot
 * Provides consistent error handling and user feedback
 */

const logger = require('./logger');

class ErrorHandler {
    /**
     * Handle command execution errors
     * @param {Error} error - The error that occurred
     * @param {Object} interaction - The Discord interaction
     * @param {string} context - The context where the error occurred
     */
    static async handleCommandError(error, interaction, context) {
        logger.systemError(`Command execution in ${context}`, error, {
            commandName: interaction.commandName,
            userId: interaction.user.id,
            channelId: interaction.channelId,
            guildId: interaction.guildId
        });

        const errorMessage = this.getErrorMessage(error, context);
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: errorMessage,
                    flags: 64 // Ephemeral
                });
            } else {
                await interaction.reply({
                    content: errorMessage,
                    flags: 64 // Ephemeral
                });
            }
        } catch (replyError) {
            logger.error('Failed to send error message to user:', replyError);
        }
    }

    /**
     * Handle button interaction errors
     * @param {Error} error - The error that occurred
     * @param {Object} interaction - The Discord interaction
     * @param {string} context - The context where the error occurred
     */
    static async handleButtonError(error, interaction, context) {
        logger.systemError(`Button interaction in ${context}`, error, {
            customId: interaction.customId,
            userId: interaction.user.id,
            channelId: interaction.channelId,
            guildId: interaction.guildId
        });

        const errorMessage = this.getErrorMessage(error, context);
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: errorMessage,
                    flags: 64 // Ephemeral
                });
            } else {
                await interaction.reply({
                    content: errorMessage,
                    flags: 64 // Ephemeral
                });
            }
        } catch (replyError) {
            logger.error('Failed to send error message to user:', replyError);
        }
    }

    /**
     * Handle general errors with user feedback
     * @param {Error} error - The error that occurred
     * @param {Object} interaction - The Discord interaction
     * @param {string} context - The context where the error occurred
     */
    static async handleGeneralError(error, interaction, context) {
        logger.systemError(`General error in ${context}`, error, {
            userId: interaction.user?.id,
            channelId: interaction.channelId,
            guildId: interaction.guildId
        });

        const errorMessage = this.getErrorMessage(error, context);
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: errorMessage,
                    flags: 64 // Ephemeral
                });
            } else {
                await interaction.reply({
                    content: errorMessage,
                    flags: 64 // Ephemeral
                });
            }
        } catch (replyError) {
            logger.error('Failed to send error message to user:', replyError);
        }
    }

    /**
     * Get appropriate error message for different error types
     * @param {Error} error - The error that occurred
     * @param {string} context - The context where the error occurred
     * @returns {string} - User-friendly error message
     */
    static getErrorMessage(error, context) {
        // Handle specific error types
        if (error.code === 50013) {
            return '❌ I don\'t have permission to perform that action. Please contact an administrator.';
        }
        
        if (error.code === 50001) {
            return '❌ I cannot access the required channel. Please check my permissions.';
        }
        
        if (error.code === 10008) {
            return '❌ The message I\'m trying to interact with no longer exists.';
        }
        
        if (error.code === 10062) {
            return '❌ The interaction has expired. Please try again.';
        }

        // Handle validation errors
        if (error.name === 'ValidationError') {
            return '❌ Invalid input provided. Please check your command and try again.';
        }

        // Handle game-specific errors
        if (context.includes('game') || context.includes('session')) {
            return '❌ There was an issue with the game. Please try starting a new game.';
        }

        // Handle role assignment errors
        if (context.includes('role')) {
            return '❌ There was an issue assigning roles. Please try starting a new game.';
        }

        // Handle voting errors
        if (context.includes('vote') || context.includes('elimination')) {
            return '❌ There was an issue processing the vote. Please try again.';
        }

        // Generic error message
        return '❌ An unexpected error occurred. Please try again or contact support if the problem persists.';
    }

    /**
     * Handle async operation errors with retry logic
     * @param {Function} operation - The async operation to retry
     * @param {number} maxRetries - Maximum number of retry attempts
     * @param {string} context - Context for logging
     * @returns {Promise<*>} - Result of the operation
     */
    static async withRetry(operation, maxRetries = 3, context = 'unknown') {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                logger.warn(`Operation failed (attempt ${attempt}/${maxRetries}) in ${context}:`, error.message);
                
                if (attempt < maxRetries) {
                    // Wait before retrying (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
                }
            }
        }
        
        throw lastError;
    }

    /**
     * Validate Discord ID format
     * @param {string} id - The ID to validate
     * @returns {boolean} - Whether the ID is valid
     */
    static isValidDiscordId(id) {
        return id && typeof id === 'string' && /^\d{17,19}$/.test(id);
    }

    /**
     * Validate required parameters
     * @param {Object} params - Object containing parameters to validate
     * @param {Array<string>} required - Array of required parameter names
     * @returns {Object} - Validation result with isValid boolean and errors array
     */
    static validateParams(params, required) {
        const errors = [];
        
        for (const param of required) {
            if (!params[param] || (typeof params[param] === 'string' && params[param].trim() === '')) {
                errors.push(`Missing required parameter: ${param}`);
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

module.exports = ErrorHandler;
