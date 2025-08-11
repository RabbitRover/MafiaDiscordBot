/**
 * Mafia game role definitions with win conditions and powers
 */

const config = require('./config');

const ROLES = {
    MAYOR: {
        name: 'Mayor',
        emoji: '🏛️',
        alignment: 'Town',
        winCondition: 'Eliminate all Mafia members and harmful neutrals.',
        powers: [
            'Your vote counts as 2 votes during lynching.',
            'You can reveal yourself as Mayor at any time to gain voting power.',
            'If you reveal, you become a target for Mafia.'
        ],
        description: 'You are the Mayor, a powerful Town member with double voting power.'
    },
    
    MAFIA: {
        name: 'Mafia',
        emoji: '🔫',
        alignment: 'Mafia',
        winCondition: 'Eliminate all Town members and achieve numerical superiority.',
        powers: [
            'You can kill one player each night.',
            'You know who other Mafia members are (if any).',
            'You appear suspicious to investigative roles.'
        ],
        description: 'You are a member of the Mafia. Eliminate the Town to win.'
    },
    
    JESTER: {
        name: 'Jester',
        emoji: '🃏',
        alignment: 'Neutral Evil',
        winCondition: 'Get yourself lynched (voted out) during the day phase.',
        powers: [
            'If you are lynched, you win immediately.',
            'If you are killed at night, you do not win.',
            'You want to appear suspicious to get voted out.'
        ],
        description: 'You are the Jester. Your goal is to trick the Town into lynching you.'
    },
    
    SURVIVOR: {
        name: 'Survivor',
        emoji: '🛡️',
        alignment: 'Neutral Benign',
        winCondition: 'Survive until the end of the game.',
        powers: [
            'You have 4 vests that protect you from attacks.',
            'You can use one vest per night.',
            'You win with any faction as long as you survive.'
        ],
        description: 'You are a Survivor. Stay alive until the end to win.'
    },
    
    EXECUTIONER: {
        name: 'Executioner',
        emoji: '⚔️',
        alignment: 'Neutral Evil',
        winCondition: 'Get your target lynched (voted out) during the day phase.',
        powers: [
            'You have a specific target that you must get lynched.',
            'If your target dies at night, you become a Jester.',
            'You appear innocent to investigative roles.'
        ],
        description: 'You are the Executioner. Get your target lynched to win.',
        hasTarget: true
    }
};

/**
 * Get all available roles for assignment
 * @returns {Array<string>} Array of role keys
 */
function getAllRoles() {
    return Object.keys(ROLES);
}

/**
 * Get role information by key
 * @param {string} roleKey - The role key (e.g., 'MAYOR')
 * @returns {Object} Role information object
 */
function getRole(roleKey) {
    return ROLES[roleKey];
}

/**
 * Get possible target roles for Executioner
 * @returns {Array<string>} Array of role keys that can be Executioner targets
 */
function getExecutionerTargetRoles() {
    return ['JESTER', 'MAFIA', 'SURVIVOR'];
}

/**
 * Randomly assign roles to players
 * @param {Array<string>} playerIds - Array of Discord user IDs
 * @returns {Object} Object mapping player IDs to role assignments
 */
function assignRoles(playerIds) {
    if (playerIds.length !== config.MAX_PLAYERS) {
        throw new Error(`Exactly ${config.MAX_PLAYERS} players required for role assignment`);
    }

    // Get all available roles
    const availableRoles = getAllRoles();

    // Shuffle the roles array
    const shuffledRoles = [...availableRoles].sort(() => Math.random() - 0.5);

    // Create role assignments
    const assignments = {};
    const executionerTargetRoles = getExecutionerTargetRoles();

    for (let i = 0; i < playerIds.length; i++) {
        const playerId = playerIds[i];
        const roleKey = shuffledRoles[i];

        assignments[playerId] = {
            role: roleKey,
            roleInfo: getRole(roleKey)
        };

        // If this player is the Executioner, assign them a target role
        if (roleKey === 'EXECUTIONER') {
            // Find roles that can be targets (excluding Executioner itself)
            const availableTargetRoles = shuffledRoles.filter(role =>
                executionerTargetRoles.includes(role)
            );

            if (availableTargetRoles.length > 0) {
                // Randomly select a target role
                const targetRole = availableTargetRoles[Math.floor(Math.random() * availableTargetRoles.length)];
                assignments[playerId].targetRole = targetRole;
                assignments[playerId].targetRoleInfo = getRole(targetRole);
            }
        }
    }

    return assignments;
}

/**
 * Create a formatted role message for a player
 * @param {Object} assignment - Player's role assignment
 * @returns {Object} Formatted embed for the role message
 */
function createRoleMessage(assignment) {
    const { role, roleInfo, targetRole, targetRoleInfo } = assignment;

    let description = `${roleInfo.emoji} **${roleInfo.description}**\n\n`;

    // Add win condition
    description += `**🎯 Win Condition:**\n${roleInfo.winCondition}\n\n`;

    // Add powers
    description += `**⚡ Powers/Effects:**\n`;
    roleInfo.powers.forEach(power => {
        description += `• ${power}\n`;
    });

    // Add target information for Executioner
    if (role === 'EXECUTIONER' && targetRole && targetRoleInfo) {
        description += `\n**🎯 Your Target Role:**\n`;
        description += `${targetRoleInfo.emoji} **${targetRoleInfo.name}**\n`;
        description += `You must get someone with this role lynched to win!`;
    }

    return {
        title: `${roleInfo.emoji} You are the ${roleInfo.name}!`,
        description: description,
        color: getColorForAlignment(roleInfo.alignment)
    };
}

/**
 * Get color for role alignment
 * @param {string} alignment - Role alignment
 * @returns {number} Hex color code
 */
function getColorForAlignment(alignment) {
    switch (alignment) {
        case 'Town': return 0x00ff00; // Green
        case 'Mafia': return 0xff0000; // Red
        case 'Neutral Evil': return 0xff8800; // Orange
        case 'Neutral Benign': return 0xffff00; // Yellow
        default: return 0x808080; // Gray
    }
}

module.exports = {
    ROLES,
    getAllRoles,
    getRole,
    getExecutionerTargetRoles,
    assignRoles,
    createRoleMessage
};
