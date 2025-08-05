const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('endgame')
        .setDescription('End the current Mafia game as a draw (Admin or Host only)'),
    
    async execute(interaction, activeSessions) {
        try {
            const channelId = interaction.channelId;
            
            // Check if there's an active game in this channel
            if (!activeSessions.has(channelId)) {
                return await interaction.reply({
                    content: '❌ There is no active Mafia game in this channel.',
                    flags: 64 // Ephemeral
                });
            }
            
            const gameSession = activeSessions.get(channelId);

            // Check if user has permission to end the game
            const userId = interaction.user.id;
            const member = interaction.member;
            const isHost = gameSession.getHostId() === userId;
            const hasManageMessages = member && member.permissions.has(PermissionFlagsBits.ManageMessages);

            if (!isHost && !hasManageMessages) {
                return await interaction.reply({
                    content: '❌ Only the game host or users with Manage Messages permission can end the game.',
                    flags: 64 // Ephemeral
                });
            }

            // Check if game has already ended
            if (gameSession.hasGameEnded()) {
                return await interaction.reply({
                    content: '❌ The game has already ended.',
                    flags: 64 // Ephemeral
                });
            }

            // Get game state before ending
            const gameState = typeof gameSession.getGameState === 'function'
                ? gameSession.getGameState()
                : (gameSession.gameState || 'unknown');

            // End the game as a draw
            const drawResult = gameSession.endGameAsDraw();

            // Clean up resources before deleting session
            if (typeof gameSession.cleanup === 'function') {
                gameSession.cleanup();
            }

            // Remove the session from active sessions
            activeSessions.delete(channelId);
            
            // Create draw announcement embed
            const endedByText = isHost ? 'game host' : 'administrator';
            const gameStateText = gameState === 'waiting' ? 'lobby' : 'game';
            const resultText = gameState === 'waiting' ? 'Lobby closed - No game played' : 'No winners - Game declared a draw';

            const drawEmbed = new EmbedBuilder()
                .setTitle(gameState === 'waiting' ? '🚪 Lobby Closed' : '🤝 Game Ended - Draw')
                .setDescription(`The ${gameStateText} has been ended by the ${endedByText}.`)
                .setColor(0x808080) // Gray color for draw
                .addFields(
                    { name: '📋 Result', value: resultText, inline: false },
                    { name: isHost ? '🎮 Host' : '👮 Admin', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '⏰ Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setTimestamp();
            
            // Get all players and their roles for final display
            let rolesEmbed;
            if (gameState === 'waiting') {
                // Game was in signup stage - show players without roles
                const players = typeof gameSession.getPlayers === 'function'
                    ? Array.from(gameSession.getPlayers())
                    : (Array.from(gameSession.players || []));
                let playersText = '';

                for (const userId of players) {
                    const nickname = typeof gameSession.getPlayerNickname === 'function'
                        ? gameSession.getPlayerNickname(userId)
                        : userId;
                    playersText += `👤 ${nickname}\n`;
                }

                rolesEmbed = new EmbedBuilder()
                    .setTitle('👥 Players in Lobby')
                    .setDescription(playersText || 'No players found')
                    .setColor(0x808080)
                    .setTimestamp();
            } else {
                // Game was in progress - show roles
                const allPlayers = typeof gameSession.getAllPlayersWithRoles === 'function'
                    ? gameSession.getAllPlayersWithRoles()
                    : [];
                let rolesText = '';

                for (const player of allPlayers) {
                    const nickname = player.username || player.id;
                    const roleAssignment = player;
                    const roleIcon = getRoleIcon(roleAssignment?.role);
                    const statusIcon = player.isAlive ? '💚' : '💀';

                    rolesText += `${statusIcon} ${nickname} - ${roleIcon} ${roleAssignment?.role || 'Unknown'}\n`;
                }

                rolesEmbed = new EmbedBuilder()
                    .setTitle('📋 Final Player Roles')
                    .setDescription(rolesText || 'No players found')
                    .setColor(0x808080)
                    .setTimestamp();
            }
            
            // Add instruction to use command for new game
            const instructionEmbed = new EmbedBuilder()
                .setTitle('🎮 Start New Game')
                .setDescription('To start a new game, use the `/mafia start` command.')
                .setColor(0x00ff00)
                .setFooter({ text: 'Anyone can host a new game!' });
            
            // Send the draw announcement
            await interaction.reply({
                embeds: [drawEmbed, rolesEmbed, instructionEmbed],
                flags: 0 // Public message
            });
            
        } catch (error) {
            console.error('Error in endgame command:', error);
            
            try {
                await interaction.reply({
                    content: '❌ There was an error ending the game. Please try again.',
                    flags: 64 // Ephemeral
                });
            } catch (replyError) {
                console.error('Failed to send error reply:', replyError);
            }
        }
    }
};

/**
 * Get role icon for display
 * @param {string} role - The role name
 * @returns {string} - The role icon
 */
function getRoleIcon(role) {
    const roleIcons = {
        'MAYOR': '🏛️',
        'MAFIA': '🔫',
        'JESTER': '🃏',
        'EXECUTIONER': '⚔️',
        'SURVIVOR': '🛡️'
    };
    
    return roleIcons[role] || '❓';
}
