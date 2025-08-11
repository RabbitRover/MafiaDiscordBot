/**
 * Game configuration constants
 * Edit these values to customize game behavior
 */

module.exports = {
    // Game settings
    MAX_PLAYERS: 5,
    MIN_PLAYERS_TO_START: 5,
    
    // Timeouts (in milliseconds)
    ROLE_COLLECTION_TIME: 300000,      // 5 minutes for role collection
    DAY_PHASE_TIME: 600000,            // 10 minutes for day phase voting
    NIGHT_PHASE_TIME: 300000,          // 5 minutes for night phase actions
    ROLE_DISTRIBUTION_DELAY: 2000,     // 2 seconds delay before starting day phase
    NIGHT_PHASE_DELAY: 2000,          // 2 seconds delay after Mafia action
    DAY_PHASE_DELAY: 5000,            // 5 seconds delay before next day
    NIGHT_PHASE_FALLBACK: 5000,       // 5 seconds fallback delay for role distribution
    GAME_END_DELAY: 60000,            // 60 seconds delay before cleaning up ended games
    NEXT_DAY_DELAY: 3000,             // 3 seconds delay before starting next day
    
    // Discord message limits
    MAX_EMBED_DESCRIPTION_LENGTH: 1000,
    MAX_BUTTONS_PER_ROW: 5,
    
    // Game mechanics
    MAYOR_VOTE_MULTIPLIER: 4,         // Mayor votes count as 4 when revealed
    EXECUTIONER_IMMUNITY: true,       // Executioner cannot be killed at night
    
    // Error handling
    MAX_RETRY_ATTEMPTS: 3,
    ERROR_MESSAGE_TIMEOUT: 5000,      // 5 seconds for error message display
    
    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL || 'info', // 'debug', 'info', 'warn', 'error'
    
    // Environment-specific settings
    IS_PRODUCTION: process.env.NODE_ENV === 'production',
    DEBUG_MODE: process.env.NODE_ENV !== 'production'
};
