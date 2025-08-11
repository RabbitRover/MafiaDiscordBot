const config = require('./config');
const logger = require('../utils/logger');
const ErrorHandler = require('../utils/errorHandler');

class GameSession {
    constructor(hostId, channelId) {
        this.hostId = hostId;
        this.channelId = channelId;
        this.players = new Set(); // Use Set to prevent duplicate players
        this.playerUsernames = new Map(); // Store player usernames: playerId -> username
        this.playerNicknames = new Map(); // Store player server nicknames: playerId -> nickname
        this.maxPlayers = config.MAX_PLAYERS;
        this.gameState = 'waiting'; // waiting, ready, started, roles_assigned, day_phase, night_phase, game_ended
        this.createdAt = new Date();
        this.roleAssignments = {}; // Store role assignments: { playerId: { role, roleInfo, targetRole?, targetRoleInfo? } }

        // Day phase voting system
        this.votes = new Map(); // voterId -> targetId
        this.skipVotes = new Set(); // players who chose to skip voting
        this.mayorRevealed = false;
        this.alivePlayers = new Set(); // Track alive players
        this.gameWinner = null; // Store game winner
        this.eliminatedPlayer = null; // Store eliminated player info

        // Night phase system
        this.nightKillTarget = null; // Player marked for elimination by Mafia
        this.dayNumber = 1; // Track current day number

        // Timeout and collector management for cleanup
        this.activeTimeouts = new Set();
        this.activeCollectors = new Set();

        // Mutex for thread-safe operations
        this.operationLock = false;
        this.pendingOperations = [];
    }

    /**
     * Add a player to the game session (thread-safe)
     * @param {string} userId - Discord user ID
     * @param {string} username - Discord username
     * @param {string} nickname - Discord server nickname
     * @returns {Promise<boolean>} - True if player was added, false if already in game
     */
    async addPlayer(userId, username, nickname) {
        // Validate input parameters
        if (!ErrorHandler.isValidDiscordId(userId)) {
            logger.error('Invalid userId provided to addPlayer:', userId);
            return false;
        }
        
        if (!username || typeof username !== 'string') {
            logger.error('Invalid username provided to addPlayer:', username);
            return false;
        }

        return await this.withLock(async () => {
            if (this.players.has(userId)) {
                return false; // Player already joined
            }

            if (this.players.size >= this.maxPlayers) {
                return false; // Game is full
            }

            this.players.add(userId);
            this.playerUsernames.set(userId, username);
            this.playerNicknames.set(userId, nickname || username);

            // Deduplicate as safety measure
            const uniquePlayers = new Set(this.players);
            this.players = uniquePlayers;

            // Update game state if we have enough players
            if (this.players.size >= this.maxPlayers) {
                this.gameState = 'ready';
            }

            return true;
        });
    }

    /**
     * Remove a player from the game session (thread-safe)
     * @param {string} userId - Discord user ID
     * @returns {Promise<boolean>} - True if player was removed
     */
    async removePlayer(userId) {
        // Validate input parameters
        if (!ErrorHandler.isValidDiscordId(userId)) {
            logger.error('Invalid userId provided to removePlayer:', userId);
            return false;
        }

        return await this.withLock(async () => {
            const removed = this.players.delete(userId);
            if (removed) {
                this.playerUsernames.delete(userId);
                this.playerNicknames.delete(userId);
            }

            // Deduplicate as safety measure
            const uniquePlayers = new Set(this.players);
            this.players = uniquePlayers;

            // Update game state if we no longer have enough players
            if (this.players.size < this.maxPlayers) {
                this.gameState = 'waiting';
            }

            return removed;
        });
    }

    /**
     * Check if a user is the host
     * @param {string} userId - Discord user ID
     * @returns {boolean}
     */
    isHost(userId) {
        // Validate input parameters
        if (!ErrorHandler.isValidDiscordId(userId)) {
            logger.error('Invalid userId provided to isHost:', userId);
            return false;
        }
        
        return this.hostId === userId;
    }

    /**
     * Get the host ID
     * @returns {string} - Host user ID
     */
    getHostId() {
        return this.hostId;
    }

    /**
     * Add a timeout to be tracked for cleanup
     * @param {NodeJS.Timeout} timeoutId - The timeout ID
     */
    addTimeout(timeoutId) {
        this.activeTimeouts.add(timeoutId);
    }

    /**
     * Add a collector to be tracked for cleanup
     * @param {MessageComponentCollector} collector - The collector
     */
    addCollector(collector) {
        this.activeCollectors.add(collector);

        // Auto-remove when collector ends
        collector.on('end', () => {
            this.activeCollectors.delete(collector);
        });
    }

    /**
     * Clear all active timeouts and collectors
     */
    cleanup() {
        // Clear all timeouts
        for (const timeoutId of this.activeTimeouts) {
            clearTimeout(timeoutId);
        }
        this.activeTimeouts.clear();

        // Stop all collectors
        for (const collector of this.activeCollectors) {
            if (!collector.ended) {
                collector.stop();
            }
        }
        this.activeCollectors.clear();
    }

    /**
     * Execute an operation with mutex lock to prevent race conditions
     * @param {Function} operation - The operation to execute
     * @returns {Promise} - The result of the operation
     */
    async withLock(operation) {
        return new Promise((resolve, reject) => {
            const executeOperation = async () => {
                if (this.operationLock) {
                    // Add to pending operations queue
                    this.pendingOperations.push(executeOperation);
                    return;
                }

                this.operationLock = true;
                try {
                    const result = await operation();
                    resolve(result);
                } catch (error) {
                    reject(error);
                } finally {
                    this.operationLock = false;

                    // Process next pending operation
                    if (this.pendingOperations.length > 0) {
                        const nextOperation = this.pendingOperations.shift();
                        setImmediate(nextOperation);
                    }
                }
            };

            executeOperation();
        });
    }

    /**
     * Deduplicate the players array to prevent race condition issues
     */
    deduplicatePlayers() {
        const uniquePlayers = new Set();
        for (const userId of this.players) {
            uniquePlayers.add(userId);
        }
        this.players = uniquePlayers;
    }

    /**
     * End the game as a draw (admin command)
     */
    endGameAsDraw() {
        this.gameState = 'ended';
        this.gameWinner = {
            gameEnded: true,
            winners: [],
            winType: 'admin_draw',
            reason: 'Game ended by administrator as a draw'
        };

        // Clean up resources
        this.cleanup();

        return this.gameWinner;
    }

    /**
     * Check if a user has joined the game
     * @param {string} userId - Discord user ID
     * @returns {boolean}
     */
    hasPlayer(userId) {
        // Validate input parameters
        if (!ErrorHandler.isValidDiscordId(userId)) {
            logger.error('Invalid userId provided to hasPlayer:', userId);
            return false;
        }
        
        return this.players.has(userId);
    }

    /**
     * Get current player count
     * @returns {number}
     */
    getPlayerCount() {
        return this.players.size;
    }

    /**
     * Check if game is ready to start
     * @returns {boolean}
     */
    isReady() {
        return this.gameState === 'ready' && this.players.size >= config.MIN_PLAYERS_TO_START;
    }

    /**
     * Start the game
     */
    startGame() {
        if (this.gameState === 'ready') {
            this.gameState = 'started';
            return true;
        }
        return false;
    }

    /**
     * Assign roles to all players
     * @param {Object} assignments - Role assignments from roles.js
     */
    assignRoles(assignments) {
        this.roleAssignments = assignments;
        this.gameState = 'roles_assigned';

        // Initialize alive players
        this.alivePlayers = new Set(this.players);
    }

    /**
     * Get role assignment for a specific player
     * @param {string} userId - Discord user ID
     * @returns {Object|null} Role assignment or null if not found
     */
    getPlayerRole(userId) {
        // Validate input parameters
        if (!ErrorHandler.isValidDiscordId(userId)) {
            logger.error('Invalid userId provided to getPlayerRole:', userId);
            return null;
        }
        
        return this.roleAssignments[userId] || null;
    }

    /**
     * Get all role assignments
     * @returns {Object} All role assignments
     */
    getAllRoleAssignments() {
        return this.roleAssignments;
    }

    /**
     * Check if roles have been assigned
     * @returns {boolean}
     */
    hasRolesAssigned() {
        return this.gameState === 'roles_assigned';
    }

    /**
     * Get array of player IDs
     * @returns {Array<string>}
     */
    getPlayerIds() {
        return Array.from(this.players);
    }

    /**
     * Get array of player usernames
     * @returns {Array<string>}
     */
    getPlayerUsernames() {
        return Array.from(this.playerUsernames.values());
    }

    /**
     * Get username for a specific player
     * @param {string} userId - Discord user ID
     * @returns {string|null} Username or null if not found
     */
    getPlayerUsername(userId) {
        // Validate input parameters
        if (!ErrorHandler.isValidDiscordId(userId)) {
            logger.error('Invalid userId provided to getPlayerUsername:', userId);
            return null;
        }
        
        return this.playerUsernames.get(userId) || null;
    }

    /**
     * Get nickname for a specific player
     * @param {string} userId - Discord user ID
     * @returns {string|null} Nickname or null if not found
     */
    getPlayerNickname(userId) {
        // Validate input parameters
        if (!ErrorHandler.isValidDiscordId(userId)) {
            logger.error('Invalid userId provided to getPlayerNickname:', userId);
            return null;
        }
        
        return this.playerNicknames.get(userId) || this.getPlayerUsername(userId) || null;
    }

    /**
     * Start the day phase
     */
    startDayPhase() {
        this.gameState = 'day_phase';
        this.votes.clear();
        this.skipVotes.clear();
    }

    /**
     * Cast a vote for a player
     * @param {string} voterId - ID of the player voting
     * @param {string} targetId - ID of the player being voted for
     * @returns {boolean} - True if vote was cast successfully
     */
    castVote(voterId, targetId) {
        // Validate input parameters
        if (!ErrorHandler.isValidDiscordId(voterId)) {
            logger.error('Invalid voterId provided to castVote:', voterId);
            return false;
        }
        
        if (!ErrorHandler.isValidDiscordId(targetId)) {
            logger.error('Invalid targetId provided to castVote:', targetId);
            return false;
        }

        if (!this.alivePlayers.has(voterId) || !this.alivePlayers.has(targetId)) {
            return false; // Can't vote if dead or vote for dead player
        }

        // Allow self-voting (removed restriction)

        this.votes.set(voterId, targetId);
        return true;
    }

    /**
     * Remove a vote
     * @param {string} voterId - ID of the player removing their vote
     * @returns {boolean} - True if vote was removed
     */
    removeVote(voterId) {
        // Validate input parameters
        if (!ErrorHandler.isValidDiscordId(voterId)) {
            logger.error('Invalid voterId provided to removeVote:', voterId);
            return false;
        }
        
        const hadVote = this.votes.delete(voterId);
        const hadSkip = this.skipVotes.delete(voterId);
        return hadVote || hadSkip;
    }

    /**
     * Add a skip vote
     * @param {string} voterId - ID of the player skipping
     */
    addSkipVote(voterId) {
        // Validate input parameters
        if (!ErrorHandler.isValidDiscordId(voterId)) {
            logger.error('Invalid voterId provided to addSkipVote:', voterId);
            return;
        }
        
        // Remove any existing vote first
        this.votes.delete(voterId);
        this.skipVotes.add(voterId);
    }

    /**
     * Get skip votes
     * @returns {Set} - Set of player IDs who skipped voting
     */
    getSkipVotes() {
        return this.skipVotes;
    }

    /**
     * Get vote counts for all players
     * @returns {Map<string, number>} - Map of playerId -> vote count
     */
    getVoteCounts() {
        const voteCounts = new Map();

        // Initialize all alive players with 0 votes
        for (const playerId of this.alivePlayers) {
            voteCounts.set(playerId, 0);
        }

        // Count votes (Mayor gets 4 votes if revealed)
        for (const [voterId, targetId] of this.votes) {
            const currentCount = voteCounts.get(targetId) || 0;
            const voterRole = this.getPlayerRole(voterId);

            // Mayor gets 4 votes if revealed, otherwise normal vote
            const voteWeight = (voterRole?.role === 'MAYOR' && this.mayorRevealed) ? config.MAYOR_VOTE_MULTIPLIER : 1;
            voteCounts.set(targetId, currentCount + voteWeight);
        }

        return voteCounts;
    }

    /**
     * Get who voted for whom
     * @returns {Map<string, string>} - Map of voterId -> targetId
     */
    getVotes() {
        return new Map(this.votes);
    }

    /**
     * Reveal the Mayor
     * @param {string} mayorId - ID of the Mayor
     * @returns {boolean} - True if Mayor was revealed successfully
     */
    revealMayor(mayorId) {
        // Validate input parameters
        if (!ErrorHandler.isValidDiscordId(mayorId)) {
            logger.error('Invalid mayorId provided to revealMayor:', mayorId);
            return false;
        }
        
        const playerRole = this.getPlayerRole(mayorId);
        if (playerRole?.role === 'MAYOR' && !this.mayorRevealed) {
            this.mayorRevealed = true;
            return true;
        }
        return false;
    }

    /**
     * Check if Mayor is revealed
     * @returns {boolean}
     */
    isMayorRevealed() {
        return this.mayorRevealed;
    }

    /**
     * Get the Mayor's ID
     * @returns {string|null} - Mayor's user ID or null if not found
     */
    getMayorId() {
        for (const [playerId, assignment] of Object.entries(this.roleAssignments)) {
            if (assignment.role === 'MAYOR') {
                return playerId;
            }
        }
        return null;
    }

    /**
     * Get alive players
     * @returns {Set<string>} - Set of alive player IDs
     */
    getAlivePlayers() {
        return new Set(this.alivePlayers);
    }

    /**
     * Get alive player usernames
     * @returns {Array<string>} - Array of alive player usernames
     */
    getAlivePlayerUsernames() {
        return Array.from(this.alivePlayers).map(id => this.getPlayerUsername(id));
    }

    /**
     * Process day phase elimination based on votes
     * @returns {Object} - Result object with elimination info and win conditions
     */
    processElimination() {
        try {
            const voteCounts = this.getVoteCounts();

        // Find player(s) with most votes
        let maxVotes = 0;
        let playersWithMaxVotes = [];

        for (const [playerId, voteCount] of voteCounts) {
            if (voteCount > maxVotes) {
                maxVotes = voteCount;
                playersWithMaxVotes = [playerId];
            } else if (voteCount === maxVotes && voteCount > 0) {
                playersWithMaxVotes.push(playerId);
            }
        }

        // Handle tie or no votes
        if (playersWithMaxVotes.length !== 1 || maxVotes === 0) {
            return {
                eliminated: null,
                reason: playersWithMaxVotes.length > 1 ? 'tie' : 'no_votes',
                tiedPlayers: playersWithMaxVotes,
                gameEnded: false,
                winner: null
            };
        }

        // Eliminate the player with most votes
        const eliminatedId = playersWithMaxVotes[0];
        const eliminatedRole = this.getPlayerRole(eliminatedId);
        const eliminatedUsername = this.getPlayerUsername(eliminatedId);

        this.alivePlayers.delete(eliminatedId);
        this.eliminatedPlayer = {
            id: eliminatedId,
            username: eliminatedUsername,
            role: eliminatedRole.role,
            roleInfo: eliminatedRole.roleInfo
        };

        // Check win conditions
        const winResult = this.checkWinConditions(eliminatedId, eliminatedRole);

        if (winResult.gameEnded) {
            this.gameState = 'game_ended';
            this.gameWinner = winResult;
        }

        return {
            eliminated: {
                id: eliminatedId,
                username: eliminatedUsername,
                role: eliminatedRole.role,
                roleInfo: eliminatedRole.roleInfo
            },
            reason: 'eliminated',
            gameEnded: winResult.gameEnded,
            winner: winResult.gameEnded ? winResult : null
        };
        } catch (error) {
            logger.error('Error in processElimination:', error);
            // Return safe fallback result
            return {
                eliminated: null,
                reason: 'error',
                gameEnded: false,
                winner: null,
                error: 'Failed to process elimination'
            };
        }
    }

    /**
     * Check win conditions after day phase elimination
     * @param {string} eliminatedId - ID of eliminated player
     * @param {Object} eliminatedRole - Role info of eliminated player
     * @returns {Object} - Win condition result
     */
    checkWinConditions(eliminatedId, eliminatedRole) {
        try {
            // Check if Executioner's target role was eliminated (Executioner wins but game continues)
            let executionerWin = null;
        for (const [playerId, assignment] of Object.entries(this.roleAssignments)) {
            if (assignment.role === 'EXECUTIONER' && assignment.targetRole === eliminatedRole.role) {
                // Mark Executioner as having won
                assignment.hasWon = true;
                executionerWin = {
                    playerId: playerId,
                    username: this.getPlayerNickname(playerId),
                    reason: 'Executioner got their target role lynched'
                };
                break;
            }
        }

        // Check if Jester was eliminated (Jester wins immediately)
        if (eliminatedRole.role === 'JESTER') {
            const winners = [{
                type: 'Jester',
                playerId: eliminatedId,
                username: this.getPlayerNickname(eliminatedId),
                reason: 'Jester was lynched'
            }];

            // Add Executioner win if they achieved their goal
            if (executionerWin) {
                winners.push({
                    type: 'Executioner',
                    playerId: executionerWin.playerId,
                    username: executionerWin.username,
                    reason: executionerWin.reason
                });
            }

            return {
                gameEnded: true,
                winners: winners,
                winType: 'jester_lynched',
                executionerWin: executionerWin
            };
        }
        // Check if Mafia was eliminated (Game ends - Mayor and Survivor win if alive)
        if (eliminatedRole.role === 'MAFIA') {
            const winners = [];

            // Mayor wins if alive
            const mayorId = this.getMayorId();
            if (mayorId && this.alivePlayers.has(mayorId)) {
                winners.push({
                    type: 'Mayor',
                    playerId: mayorId,
                    username: this.getPlayerNickname(mayorId),
                    reason: 'Mayor eliminated the Mafia'
                });
            }

            // Survivor wins if alive
            const survivorId = this.getSurvivorId();
            if (survivorId && this.alivePlayers.has(survivorId)) {
                winners.push({
                    type: 'Survivor',
                    playerId: survivorId,
                    username: this.getPlayerNickname(survivorId),
                    reason: 'Survivor was alive at game end'
                });
            }

            // Add Executioner win if they achieved their goal
            if (executionerWin) {
                winners.push({
                    type: 'Executioner',
                    playerId: executionerWin.playerId,
                    username: executionerWin.username,
                    reason: executionerWin.reason
                });
            }

            // If no winners, still end the game
            if (winners.length === 0) {
                winners.push({
                    type: 'Town',
                    playerId: null,
                    username: 'Town',
                    reason: 'Mafia was eliminated'
                });
            }

            return {
                gameEnded: true,
                winners: winners,
                winType: 'mafia_eliminated',
                executionerWin: executionerWin
            };
        }

        // Game continues
        return {
            gameEnded: false,
            winners: [],
            winType: null
        };
        } catch (error) {
            logger.error('Error in checkWinConditions:', error);
            // Return safe fallback - game continues
            return {
                gameEnded: false,
                winners: [],
                winType: null,
                error: 'Failed to check win conditions'
            };
        }
    }

    /**
     * Check win conditions after night phase elimination
     * @param {string|null} eliminatedId - ID of eliminated player (null if no kill)
     * @returns {Object} - Win condition result
     */
    checkNightWinConditions(eliminatedId) {
        if (!eliminatedId) {
            return { gameEnded: false, winners: [], winType: null };
        }

        const eliminatedRole = this.getPlayerRole(eliminatedId);

        // Check if Mayor was killed (Mafia wins)
        if (eliminatedRole.role === 'MAYOR') {
            const mafiaId = this.getMafiaId();
            if (mafiaId) {
                // Mafia wins, check if Survivor and Executioner also win
                const winners = [{
                    type: 'Mafia',
                    playerId: mafiaId,
                    username: this.getPlayerNickname(mafiaId),
                    reason: 'Mafia killed the Mayor'
                }];

                // Add Survivor as co-winner if alive
                const survivorId = this.getSurvivorId();
                if (survivorId && this.alivePlayers.has(survivorId)) {
                    winners.push({
                        type: 'Survivor',
                        playerId: survivorId,
                        username: this.getPlayerNickname(survivorId),
                        reason: 'Survivor was alive at game end'
                    });
                }

                // Check if Executioner also wins (if their target was eliminated earlier)
                for (const [playerId, assignment] of Object.entries(this.roleAssignments)) {
                    if (assignment.role === 'EXECUTIONER' && assignment.hasWon) {
                        winners.push({
                            type: 'Executioner',
                            playerId: playerId,
                            username: this.getPlayerNickname(playerId),
                            reason: 'Executioner achieved their goal earlier'
                        });
                        break;
                    }
                }

                return {
                    gameEnded: true,
                    winners: winners,
                    winType: 'mafia_killed_mayor'
                };
            }
        }

        // Check if game should end with Survivor win
        return this.checkSurvivorWin();
    }

    /**
     * Check if Survivor should win (alive at end, unless Jester wins)
     * Note: Survivor only wins alongside other roles, not as standalone winner
     * @returns {Object} - Win condition result
     */
    checkSurvivorWin() {
        // Survivor doesn't win standalone - only wins with other roles at game end
        // This method is kept for potential future standalone Survivor win conditions
        return { gameEnded: false, winners: [], winType: null };
    }

    /**
     * Check if game is in day phase
     * @returns {boolean}
     */
    isDayPhase() {
        return this.gameState === 'day_phase';
    }

    /**
     * Check if game has ended
     * @returns {boolean}
     */
    hasGameEnded() {
        return this.gameState === 'game_ended';
    }

    /**
     * Get game winner information
     * @returns {Object|null} - Winner info or null if game hasn't ended
     */
    getGameWinner() {
        return this.gameWinner;
    }

    /**
     * Start the night phase
     */
    startNightPhase() {
        this.gameState = 'night_phase';
        this.nightKillTarget = null;
    }

    /**
     * Check if game is in night phase
     * @returns {boolean}
     */
    isNightPhase() {
        return this.gameState === 'night_phase';
    }

    /**
     * Get the Mafia player ID
     * @returns {string|null} - Mafia's user ID or null if not found
     */
    getMafiaId() {
        for (const [playerId, assignment] of Object.entries(this.roleAssignments)) {
            if (assignment.role === 'MAFIA' && this.alivePlayers.has(playerId)) {
                return playerId;
            }
        }
        return null;
    }

    /**
     * Set the night kill target (Mafia action)
     * @param {string} targetId - ID of the player to kill
     * @returns {boolean} - True if target was set successfully
     */
    setNightKillTarget(targetId) {
        // Validate input parameters
        if (!ErrorHandler.isValidDiscordId(targetId)) {
            logger.error('Invalid targetId provided to setNightKillTarget:', targetId);
            return false;
        }
        
        if (!this.alivePlayers.has(targetId)) {
            return false; // Can't kill dead players
        }

        // Check if target is Executioner (cannot be killed at night)
        const targetRole = this.getPlayerRole(targetId);
        if (targetRole?.role === 'EXECUTIONER') {
            return false; // Executioner cannot be killed at night
        }

        this.nightKillTarget = targetId;
        return true;
    }

    /**
     * Get the current night kill target
     * @returns {string|null} - Target ID or null if no target set
     */
    getNightKillTarget() {
        return this.nightKillTarget;
    }

    /**
     * Process night phase elimination and role changes
     * @returns {Object} - Result object with elimination info and role changes
     */
    processNightElimination() {
        if (!this.nightKillTarget) {
            return {
                eliminated: null,
                reason: 'no_kill',
                roleChanges: [],
                gameEnded: false
            };
        }

        const eliminatedId = this.nightKillTarget;
        const eliminatedRole = this.getPlayerRole(eliminatedId);
        const eliminatedUsername = this.getPlayerUsername(eliminatedId);

        // Remove player from alive players
        this.alivePlayers.delete(eliminatedId);

        // Check if eliminated player's role was an Executioner's target
        const roleChanges = [];
        for (const [playerId, assignment] of Object.entries(this.roleAssignments)) {
            if (assignment.role === 'EXECUTIONER' && assignment.targetRole === eliminatedRole.role) {
                // Convert Executioner to Jester
                this.convertExecutionerToJester(playerId);
                roleChanges.push({
                    playerId: playerId,
                    username: this.getPlayerNickname(playerId),
                    oldRole: 'EXECUTIONER',
                    newRole: 'JESTER',
                    reason: 'Target role was killed at night'
                });
            }
        }

        // Check win conditions after night elimination
        const winResult = this.checkNightWinConditions(eliminatedId);

        if (winResult.gameEnded) {
            this.gameState = 'game_ended';
            this.gameWinner = winResult;
        }

        return {
            eliminated: {
                id: eliminatedId,
                username: eliminatedUsername,
                role: eliminatedRole.role,
                roleInfo: eliminatedRole.roleInfo
            },
            reason: 'killed_by_mafia',
            roleChanges: roleChanges,
            gameEnded: winResult.gameEnded,
            winner: winResult.gameEnded ? winResult : null
        };
    }

    /**
     * Convert an Executioner to Jester
     * @param {string} executionerId - ID of the Executioner to convert
     */
    convertExecutionerToJester(executionerId) {
        // Validate input parameters
        if (!ErrorHandler.isValidDiscordId(executionerId)) {
            logger.error('Invalid executionerId provided to convertExecutionerToJester:', executionerId);
            return;
        }
        
        if (this.roleAssignments[executionerId]?.role === 'EXECUTIONER') {
            const { getRole } = require('./roles');
            this.roleAssignments[executionerId] = {
                role: 'JESTER',
                roleInfo: getRole('JESTER'),
                target: null, // Remove target
                targetRole: null
            };
        }
    }

    /**
     * Get current day number
     * @returns {number}
     */
    getDayNumber() {
        return this.dayNumber;
    }

    /**
     * Increment day number (called when starting new day)
     */
    incrementDay() {
        this.dayNumber++;
    }

    /**
     * Get the Survivor's ID
     * @returns {string|null} - Survivor's user ID or null if not found
     */
    getSurvivorId() {
        for (const [playerId, assignment] of Object.entries(this.roleAssignments)) {
            if (assignment.role === 'SURVIVOR') {
                return playerId;
            }
        }
        return null;
    }

    /**
     * Check if there's an active Executioner (alive with a living target)
     * @returns {boolean}
     */
    hasActiveExecutioner() {
        for (const [playerId, assignment] of Object.entries(this.roleAssignments)) {
            if (assignment.role === 'EXECUTIONER' &&
                this.alivePlayers.has(playerId) &&
                assignment.target &&
                this.alivePlayers.has(assignment.target)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get all players and their roles for game end display
     * @returns {Array<Object>} - Array of player info with roles
     */
    getAllPlayersWithRoles() {
        const playersWithRoles = [];

        for (const [playerId, assignment] of Object.entries(this.roleAssignments)) {
            playersWithRoles.push({
                id: playerId,
                username: this.getPlayerNickname(playerId),
                role: assignment.role,
                roleInfo: assignment.roleInfo,
                isAlive: this.alivePlayers.has(playerId),
                targetRole: assignment.targetRole || null,
                targetRoleInfo: assignment.targetRoleInfo || null
            });
        }

        return playersWithRoles;
    }

    /**
     * Reset the game state for a new game
     */
    resetGameState() {
        this.gameState = 'waiting';
        this.votes.clear();
        this.skipVotes.clear();
        this.mayorRevealed = false;
        this.alivePlayers.clear();
        this.gameWinner = null;
        this.eliminatedPlayer = null;
        this.nightKillTarget = null;
        this.dayNumber = 1;
        this.roleAssignments = {};
        this.players.clear();
        this.playerUsernames.clear();
        this.playerNicknames.clear();
    }

    /**
     * Get the current game state string
     * @returns {string}
     */
    getGameState() {
        return this.gameState;
    }

    /**
     * Get all player IDs (Set)
     * @returns {Set<string>}
     */
    getPlayers() {
        return new Set(this.players);
    }
}

module.exports = GameSession;
