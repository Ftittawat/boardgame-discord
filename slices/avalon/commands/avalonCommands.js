const { SlashCommandBuilder } = require('discord.js');

function createAvalonCommands() {
  const data = new SlashCommandBuilder()
    .setName('avalon')
    .setDescription('เล่นเกม Avalon ในช่องนี้')
    .addSubcommand((sub) =>
      sub.setName('setup').setDescription('สร้างเกม Avalon ใหม่ในช่องนี้'),
    )
    .addSubcommand((sub) =>
      sub.setName('join').setDescription('เข้าร่วมเกม Avalon ที่เปิดอยู่'),
    )
    .addSubcommand((sub) =>
      sub.setName('leave').setDescription('ออกจากเกม Avalon ที่เข้าร่วมอยู่'),
    )
    .addSubcommand((sub) =>
      sub.setName('start').setDescription('เริ่มเกม Avalon (สุ่มบทบาท)'),
    )
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('เช็คสถานะเกม Avalon ในช่องนี้'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('propose_team')
        .setDescription('หัวหน้าทีมเลือกสมาชิกทีมสำหรับภารกิจปัจจุบัน')
        .addUserOption((opt) =>
          opt.setName('member1').setDescription('สมาชิกทีมคนที่ 1').setRequired(true),
        )
        .addUserOption((opt) =>
          opt.setName('member2').setDescription('สมาชิกทีมคนที่ 2').setRequired(true),
        )
        .addUserOption((opt) =>
          opt.setName('member3').setDescription('สมาชิกทีมคนที่ 3').setRequired(false),
        )
        .addUserOption((opt) =>
          opt.setName('member4').setDescription('สมาชิกทีมคนที่ 4').setRequired(false),
        )
        .addUserOption((opt) =>
          opt.setName('member5').setDescription('สมาชิกทีมคนที่ 5').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('vote_team')
        .setDescription('โหวตเห็นด้วย/ไม่เห็นด้วยกับทีมที่หัวหน้าทีมเสนอ')
        .addStringOption((opt) =>
          opt
            .setName('vote')
            .setDescription('approve = เห็นด้วย, reject = ไม่เห็นด้วย')
            .setRequired(true)
            .addChoices(
              { name: 'เห็นด้วย (Approve)', value: 'approve' },
              { name: 'ไม่เห็นด้วย (Reject)', value: 'reject' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('mission_vote')
        .setDescription('สมาชิกทีมโหวตว่าให้ภารกิจ สำเร็จ หรือ ล้มเหลว')
        .addStringOption((opt) =>
          opt
            .setName('result')
            .setDescription('success = สำเร็จ, fail = ล้มเหลว (ฝ่ายดีต้องเลือก success เท่านั้น)')
            .setRequired(true)
            .addChoices(
              { name: 'สำเร็จ (Success)', value: 'success' },
              { name: 'ล้มเหลว (Fail)', value: 'fail' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('assassin_guess')
        .setDescription('ให้ Assassin เดาว่าใครคือ Merlin')
        .addUserOption((opt) =>
          opt
            .setName('target')
            .setDescription('ผู้เล่นที่คิดว่าเป็น Merlin')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('cancel').setDescription('ยกเลิกเกม Avalon ในช่องนี้ (เฉพาะเจ้าห้อง)'),
    );

  async function execute(interaction, gameManager) {
    const sub = interaction.options.getSubcommand();
    const channelId = interaction.channelId;

    if (sub === 'setup') {
      gameManager.createGame(channelId, interaction.user.id);
      await interaction.reply({
        content: `สร้างเกม Avalon ใหม่แล้ว! ใช้คำสั่ง \`/avalon join\` เพื่อเข้าร่วม (ตอนนี้มีผู้เล่นขั้นต่ำ 5 คน สูงสุด 10 คน)`,
      });
      return;
    }

    if (sub === 'join') {
      const game = gameManager.getGame(channelId);
      if (!game) {
        await interaction.reply({
          content: 'ยังไม่มีเกม Avalon ในช่องนี้ ใช้คำสั่ง `/avalon setup` ก่อน',
          ephemeral: true,
        });
        return;
      }
      const result = game.addPlayer(interaction.user.id, interaction.user.username);
      await interaction.reply({
        content: result.message,
        ephemeral: result.ephemeral === true,
      });
      return;
    }

    if (sub === 'leave') {
      const game = gameManager.getGame(channelId);
      if (!game) {
        await interaction.reply({ content: 'ยังไม่มีเกม Avalon ในช่องนี้', ephemeral: true });
        return;
      }
      const result = game.removePlayer(interaction.user.id);
      await interaction.reply({
        content: result.message,
        ephemeral: result.ephemeral === true,
      });
      return;
    }

    if (sub === 'start') {
      const game = gameManager.getGame(channelId);
      if (!game) {
        await interaction.reply({ content: 'ยังไม่มีเกม Avalon ในช่องนี้', ephemeral: true });
        return;
      }
      const canStart = game.canStart();
      if (!canStart.ok) {
        await interaction.reply({ content: canStart.reason, ephemeral: true });
        return;
      }
      const roleInfos = game.assignRoles();

      await interaction.reply({
        content:
          `เริ่มเกม Avalon แล้ว! มีผู้เล่นทั้งหมด ${game.players.length} คน\n` +
          `หัวหน้าทีมคนแรกคือ <@${game.getLeader().id}>\n` +
          'ระบบจะส่งบทบาททาง DM ให้ผู้เล่นแต่ละคน\n' +
          'หัวหน้าทีมใช้คำสั่ง `/avalon propose_team` เพื่อเลือกทีมสำหรับภารกิจที่ 1',
      });

      for (const info of roleInfos) {
        try {
          const member = await interaction.guild.members.fetch(info.id);
          const dm = await member.createDM();
          await dm.send(`คุณได้รับบทบาท **${info.roleName}**\n\n${info.description}`);
        } catch (err) {
          console.error('ส่ง DM ไม่สำเร็จให้ผู้เล่น', info.id, err);
        }
      }
      return;
    }

    if (sub === 'status') {
      const game = gameManager.getGame(channelId);
      if (!game) {
        await interaction.reply({ content: 'ยังไม่มีเกม Avalon ในช่องนี้', ephemeral: true });
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
          `\n**แถบภารกิจ**\n${status.questIcons}\n\n` +
          (playerList || 'ยังไม่มีผู้เล่นเข้าร่วม'),
      });
      return;
    }

    if (sub === 'propose_team') {
      const game = gameManager.getGame(channelId);
      if (!game) {
        await interaction.reply({ content: 'ยังไม่มีเกม Avalon ในช่องนี้', ephemeral: true });
        return;
      }
      const memberIds = [];
      for (let i = 1; i <= 5; i++) {
        const user = interaction.options.getUser(`member${i}`);
        if (user) memberIds.push(user.id);
      }
      const result = game.proposeTeam(interaction.user.id, memberIds);
      await interaction.reply({
        content: result.message,
        ephemeral: result.ephemeral === true,
      });
      return;
    }

    if (sub === 'vote_team') {
      const game = gameManager.getGame(channelId);
      if (!game) {
        await interaction.reply({ content: 'ยังไม่มีเกม Avalon ในช่องนี้', ephemeral: true });
        return;
      }
      const vote = interaction.options.getString('vote');
      const approve = vote === 'approve';
      const result = game.voteTeam(interaction.user.id, approve);
      await interaction.reply({
        content: result.message,
        ephemeral: result.ephemeral !== false,
      });
      if (result.broadcast && interaction.channel) {
        await interaction.channel.send(result.broadcast);
      }
      return;
    }

    if (sub === 'mission_vote') {
      const game = gameManager.getGame(channelId);
      if (!game) {
        await interaction.reply({ content: 'ยังไม่มีเกม Avalon ในช่องนี้', ephemeral: true });
        return;
      }
      const resultValue = interaction.options.getString('result');
      const result = game.voteMission(interaction.user.id, resultValue);
      await interaction.reply({
        content: result.message,
        ephemeral: result.ephemeral !== false,
      });
      if (result.broadcast && interaction.channel) {
        await interaction.channel.send(result.broadcast);
      }
      return;
    }

    if (sub === 'assassin_guess') {
      const game = gameManager.getGame(channelId);
      if (!game) {
        await interaction.reply({ content: 'ยังไม่มีเกม Avalon ในช่องนี้', ephemeral: true });
        return;
      }
      const target = interaction.options.getUser('target', true);
      const result = game.assassinGuess(interaction.user.id, target.id);
      await interaction.reply({
        content: result.message,
        ephemeral: result.ephemeral !== false,
      });
      if (result.broadcast && interaction.channel) {
        await interaction.channel.send(result.broadcast);
      }
      return;
    }

    if (sub === 'cancel') {
      const game = gameManager.getGame(channelId);
      if (!game) {
        await interaction.reply({ content: 'ยังไม่มีเกม Avalon ในช่องนี้', ephemeral: true });
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
      await interaction.reply({ content: 'เกม Avalon ในช่องนี้ถูกยกเลิกแล้ว' });
    }
  }

  return { data, execute };
}

module.exports = { createAvalonCommands };
