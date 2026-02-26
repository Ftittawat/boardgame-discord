const Game = require('./game/Game');

const games = new Map();

function cleanupEndedGames() {
  for (const [channelId, game] of games) {
    if (game.phase === 'ended') games.delete(channelId);
  }
}
setInterval(cleanupEndedGames, 5 * 60 * 1000);

async function handleSlashCommand(client, interaction) {
  const channelId = interaction.channelId;
  if (games.has(channelId)) {
    const existing = games.get(channelId);
    if (existing.phase !== 'ended') {
      await interaction.reply({ content: '❌ มีเกมกำลังดำเนินอยู่ในช่องนี้แล้ว', ephemeral: true });
      return true;
    }
    games.delete(channelId);
  }
  const game = new Game(interaction.channel, interaction.user, client);
  games.set(channelId, game);
  await interaction.reply({
    embeds: [game.createLobbyEmbed()],
    components: [game.createLobbyComponents()],
  });
  game.lobbyMessage = await interaction.fetchReply();
  return true;
}

async function handleButton(client, interaction) {
  const [prefix, action, channelId] = interaction.customId.split(':');
  if (prefix !== 'ww') return false;

  const game = games.get(channelId);
  if (!game || game.phase === 'ended') {
    await interaction.reply({ content: '❌ ไม่พบเกม หรือเกมจบไปแล้ว', ephemeral: true });
    return true;
  }

  switch (action) {
    case 'join': {
      const result = game.addPlayer(interaction.user);
      if (!result.success) {
        await interaction.reply({ content: `❌ ${result.msg}`, ephemeral: true });
        return true;
      }
      await interaction.update({
        embeds: [game.createLobbyEmbed()],
        components: [game.createLobbyComponents()],
      });
      break;
    }
    case 'leave': {
      const result = game.removePlayer(interaction.user.id);
      if (!result.success) {
        await interaction.reply({ content: `❌ ${result.msg}`, ephemeral: true });
        return true;
      }
      await interaction.update({
        embeds: [game.createLobbyEmbed()],
        components: [game.createLobbyComponents()],
      });
      break;
    }
    case 'start': {
      if (interaction.user.id !== game.host.id) {
        await interaction.reply({
          content: '❌ เฉพาะเจ้าของห้องเท่านั้นที่สามารถเริ่มเกมได้',
          ephemeral: true,
        });
        return true;
      }
      if (game.players.size < 4) {
        await interaction.reply({
          content: `❌ ต้องมีผู้เล่นอย่างน้อย 4 คน (ตอนนี้มี ${game.players.size} คน)`,
          ephemeral: true,
        });
        return true;
      }
      await interaction.update({
        embeds: [
          game
            .createLobbyEmbed()
            .setTitle('🐺 เกมหมาป่า — กำลังเริ่ม...')
            .setFooter({ text: 'กำลังแจกบทบาท...' }),
        ],
        components: [],
      });
      const result = await game.startGame();
      if (!result.success) {
        await interaction.followUp({ content: `❌ ${result.msg}`, ephemeral: true });
      }
      break;
    }
    default:
      return false;
  }
  return true;
}

async function handleSelectMenu(client, interaction) {
  const [prefix, action, channelId] = interaction.customId.split(':');
  if (prefix !== 'ww') return false;

  const game = games.get(channelId);
  if (!game || game.phase === 'ended') {
    await interaction.reply({ content: '❌ ไม่พบเกม หรือเกมจบไปแล้ว', ephemeral: true });
    return true;
  }

  const selectedValue = interaction.values[0];

  switch (action) {
    case 'kill':
    case 'check':
    case 'protect': {
      const result = game.handleNightAction(interaction.user.id, action, selectedValue);
      await interaction.update({
        content: result.success ? `✅ ${result.msg}` : `❌ ${result.msg}`,
        components: [],
        embeds: [],
      });
      break;
    }
    case 'vote': {
      const result = game.handleDayVote(interaction.user.id, selectedValue);
      await interaction.reply({
        content: result.success ? `✅ ${result.msg}` : `❌ ${result.msg}`,
        ephemeral: true,
      });
      break;
    }
    case 'shoot': {
      const result = await game.handleHunterShoot(interaction.user.id, selectedValue);
      await interaction.update({
        content: result.success ? `✅ ${result.msg}` : `❌ ${result.msg}`,
        components: [],
        embeds: [],
      });
      break;
    }
    default:
      return false;
  }
  return true;
}

async function handleInteraction(client, interaction) {
  if (interaction.isChatInputCommand() && interaction.commandName === 'werewolf') {
    return handleSlashCommand(client, interaction);
  }
  if (interaction.isButton()) {
    return handleButton(client, interaction);
  }
  if (interaction.isStringSelectMenu()) {
    return handleSelectMenu(client, interaction);
  }
  return false;
}

const { SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('werewolf')
    .setDescription('สร้างห้องเกมหมาป่า (Werewolf)'),
];

module.exports = {
  name: 'werewolf',
  getCommands: () => commands,
  handleInteraction,
};
