// Load compatibility fixes first
require('./utils/compatibility');

const { Client, GatewayIntentBits, Collection, REST, Routes, InteractionResponseType } = require('discord.js');
require('dotenv').config();
const logger = require('./utils/logger');

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Create a collection to store commands
client.commands = new Collection();

// Import commands
const startCommand = require('./commands/start');
const mafiaCommand = require('./commands/mafia');
const endgameCommand = require('./commands/endgame');
client.commands.set(startCommand.data.name, startCommand);
client.commands.set(mafiaCommand.data.name, mafiaCommand);
client.commands.set(endgameCommand.data.name, endgameCommand);

// Import activeSessions from start command
const activeSessions = startCommand.activeSessions;

// When the client is ready, run this code
client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);
    
    // Register slash commands
    await registerSlashCommands();
});

// Handle slash command interactions
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            logger.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            // Pass activeSessions to commands that need it
            if (interaction.commandName === 'endgame') {
                await command.execute(interaction, activeSessions);
            } else {
                await command.execute(interaction);
            }
        } catch (error) {
            logger.error('Error executing command:', error);
            
            const errorMessage = {
                content: '❌ There was an error while executing this command!',
                flags: 64 // InteractionResponseFlags.Ephemeral
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    } else if (interaction.isButton()) {
        // Handle button interactions
        try {
            // Route button interactions to the start command handler
            if (interaction.customId === 'join_game' || interaction.customId === 'start_game' || interaction.customId === 'leave_game') {
                await startCommand.handleButtonInteraction(interaction);
            }
        } catch (error) {
            logger.error('Error handling button interaction:', error);
            
            const errorMessage = {
                content: '❌ There was an error while processing your action!',
                flags: 64 // InteractionResponseFlags.Ephemeral
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }
});

// Refresh the day window on every new message in channels with active day phase
client.on('messageCreate', async (message) => {
    try {
        // Ignore bot messages
        if (message.author.bot) return;

        // Only react in guild text channels
        if (!message.guild || !message.channelId) return;

        // Find session for this channel
        const channelId = message.channelId;
        const session = activeSessions.get(channelId);
        if (!session) return;

        // Only refresh during day phase
        if (typeof session.isDayPhase === 'function' && session.isDayPhase()) {
            // Lazy import to avoid cycles
            const { refreshDayWindow } = require('./commands/start');
            if (typeof refreshDayWindow === 'function') {
                await refreshDayWindow(client, channelId, activeSessions);
            }
        }
    } catch (_) {
        // Do not disrupt normal operation on refresh failure
    }
});

// Handle errors
client.on('error', error => {
    logger.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    logger.error('Unhandled promise rejection:', error);
});

// Register slash commands with Discord
async function registerSlashCommands() {
    const commands = [];
    
    // Add all command data
    client.commands.forEach(command => {
        commands.push(command.data.toJSON());
    });

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('🔄 Started refreshing application (/) commands.');

        // Register commands globally (takes up to 1 hour to propagate)
        // For faster testing, you can register to a specific guild instead
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log('✅ Successfully reloaded application (/) commands.');
    } catch (error) {
        logger.error('❌ Error registering slash commands:', error);
    }
}

// Login to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);
