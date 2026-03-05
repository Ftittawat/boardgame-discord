const { SlashCommandBuilder } = require('discord.js');

function createAvalonCommands() {
  const data = new SlashCommandBuilder()
    .setName('avalon')
    .setDescription('เล่นเกม Avalon ในช่องนี้')
    .addSubcommand((sub) =>
      sub.setName('create').setDescription('สร้างเกม Avalon ใหม่และเข้าร่วมอัตโนมัติ'),
    )
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('เช็คสถานะเกม Avalon ในช่องนี้'),
    )
    .addSubcommand((sub) =>
      sub.setName('cancel').setDescription('ยกเลิกเกม Avalon ในช่องนี้ (เฉพาะเจ้าห้อง)'),
    );

  async function execute(interaction, gameManager, helpers) {
    const sub = interaction.options.getSubcommand();
    const channelId = interaction.channelId;

    if (sub === 'create') {
      const existing = gameManager.getGame(channelId);
      if (existing && existing.started) {
        await interaction.reply({
          content: 'มีเกม Avalon กำลังเล่นอยู่ในช่องนี้แล้ว',
          ephemeral: true,
        });
        return;
      }

      const game = gameManager.createGame(channelId, interaction.user.id);

      game.addPlayer(
        interaction.user.id,
        interaction.member?.displayName || interaction.user.displayName || interaction.user.username,
      );

      if (helpers && helpers.sendLobbyUI) {
        await interaction.reply({
          content: '⚔️ สร้างเกม Avalon ใหม่แล้ว!',
        });
        await helpers.sendLobbyUI(interaction.channel, game);
      } else {
        await interaction.reply({
          content:
            '⚔️ สร้างเกม Avalon ใหม่แล้ว! กดปุ่ม Join เพื่อเข้าร่วม\n' +
            '(ผู้เล่นขั้นต่ำ 5 คน สูงสุด 10 คน)',
        });
      }
      return;
    }

    if (sub === 'status') {
      const game = gameManager.getGame(channelId);
      if (!game) {
        await interaction.reply({
          content: 'ยังไม่มีเกม Avalon ในช่องนี้',
          ephemeral: true,
        });
        return;
      }
      const playerList = game.players
        .map((p, i) => `${i + 1}. <@${p.id}>`)
        .join('\n');
      const status = game.getStatus();
      await interaction.reply({
        content:
          `**สถานะเกม Avalon**\n` +
          `เจ้าห้อง: <@${game.hostId}>\n` +
          `จำนวนผู้เล่น: ${game.players.length}\n` +
          `สถานะปัจจุบัน: ${status.phaseText}\n` +
          (status.leaderId ? `หัวหน้าทีม: <@${status.leaderId}>\n` : '') +
          `\n📋 **แถบภารกิจ**\n${status.questIcons}\n\n` +
          `**ผู้เล่น**\n` +
          (playerList || 'ยังไม่มีผู้เล่นเข้าร่วม'),
      });
      return;
    }

    if (sub === 'cancel') {
      const game = gameManager.getGame(channelId);
      if (!game) {
        await interaction.reply({
          content: 'ยังไม่มีเกม Avalon ในช่องนี้',
          ephemeral: true,
        });
        return;
      }
      if (interaction.user.id !== game.hostId) {
        await interaction.reply({
          content: 'มีเพียงเจ้าห้องเท่านั้นที่สามารถยกเลิกเกมได้',
          ephemeral: true,
        });
        return;
      }
      gameManager.removeGame(channelId);
      await interaction.reply({
        content: '🛑 เกม Avalon ในช่องนี้ถูกยกเลิกแล้ว',
      });
    }
  }

  return { data, execute };
}

module.exports = { createAvalonCommands };
