const { AvalonGameManager } = require('./game/AvalonGameManager');
const { createAvalonCommands } = require('./commands/avalonCommands');
const {
  createTeamSelectRow,
  createTeamVoteRow,
  createMissionPromptRow,
  createMissionVoteRow,
  createAssassinSelectRow,
  createLobbyRow,
} = require('./ui/components');

const gameManager = new AvalonGameManager();
const { data, execute } = createAvalonCommands();

// ---------------------------------------------------------------------------
// Helper: build lobby message text
// ---------------------------------------------------------------------------

function buildLobbyContent(game) {
  const playerList =
    game.players.length > 0
      ? game.players.map((p, i) => `${i + 1}. <@${p.id}>`).join('\n')
      : '_ยังไม่มีผู้เล่น_';

  const canStart = game.players.length >= 5;
  const startHint = canStart
    ? '✅ พร้อมเริ่มเกมแล้ว กดปุ่ม **เริ่มเกม (Start)**'
    : `⏳ ต้องการผู้เล่นอีก ${5 - game.players.length} คน (ขั้นต่ำ 5 คน)`;

  return (
    `⚔️ **ห้องเกม Avalon**\n` +
    `เจ้าห้อง: <@${game.hostId}>\n` +
    `ผู้เล่น: ${game.players.length}/10\n\n` +
    `${playerList}\n\n` +
    startHint
  );
}

// ---------------------------------------------------------------------------
// Helper: send / update lobby UI
// ---------------------------------------------------------------------------

async function sendLobbyUI(channel, game) {
  const row = createLobbyRow();
  const msg = await channel.send({
    content: buildLobbyContent(game),
    components: [row],
  });
  game.lobbyMessageId = msg.id;
}

async function updateLobbyMessage(interaction, game) {
  if (!game.lobbyMessageId) return;
  try {
    const row = createLobbyRow();
    const msg = await interaction.channel.messages.fetch(game.lobbyMessageId);
    if (msg) {
      await msg.edit({
        content: buildLobbyContent(game),
        components: [row],
      });
    }
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Helper: send phase-specific UI into a channel
// ---------------------------------------------------------------------------

async function sendTeamProposalUI(channel, game) {
  const quest = game.getCurrentQuest();
  if (!quest) return;
  const leader = game.getLeader();
  const questNo = game.currentQuestIndex + 1;

  const row = createTeamSelectRow(game.players, quest.teamSize);

  const rejectInfo =
    game.consecutiveRejectedTeams > 0
      ? `⚠️ ทีมถูกปฏิเสธติดต่อกัน: ${game.consecutiveRejectedTeams}/5\n`
      : '';

  await channel.send({
    content:
      `⚔️ **ภารกิจที่ ${questNo}** — ต้องการทีม **${quest.teamSize} คน**\n` +
      `👑 หัวหน้าทีม: <@${leader.id}>\n` +
      rejectInfo +
      `\nกรุณาเลือกสมาชิกทีม ${quest.teamSize} คนจากเมนูด้านล่าง`,
    components: [row],
  });
}

async function sendTeamVoteUI(channel, game) {
  const teamList = game.selectedTeam.map((id) => `<@${id}>`).join(', ');
  const questNo = game.currentQuestIndex + 1;
  const quest = game.getCurrentQuest();

  const row = createTeamVoteRow();

  await channel.send({
    content:
      `🗳️ **โหวตทีม — ภารกิจที่ ${questNo}** (ทีม ${quest.teamSize} คน)\n` +
      `ทีมที่เสนอ: ${teamList}\n\n` +
      'ผู้เล่นทุกคนกดปุ่มด้านล่างเพื่อลงคะแนน',
    components: [row],
  });
}

async function sendMissionPromptUI(channel, game) {
  const questNo = game.currentQuestIndex + 1;
  const quest = game.getCurrentQuest();
  const teamList = game.selectedTeam.map((id) => `<@${id}>`).join(', ');
  const row = createMissionPromptRow();

  const msg = await channel.send({
    content:
      `🗡️ **ภารกิจที่ ${questNo}** — ทีม ${quest.teamSize} คนกำลังทำภารกิจ...\n` +
      `สมาชิกทีม: ${teamList}\n\n` +
      '⏳ รอสมาชิกทีมโหวตผลภารกิจ',
    components: [row],
  });
  game.missionPromptMessageId = msg.id;
}

async function sendAssassinUI(channel, game) {
  const goodPlayers = game.players.filter((p) => p.role.side === 'good');
  const row = createAssassinSelectRow(goodPlayers);
  const assassin = game.players.find((p) => p.role.key === 'ASSASSIN');

  await channel.send({
    content:
      `🎯 **ฝ่ายดีชนะภารกิจครบ 3 ครั้ง!**\n` +
      `Assassin (<@${assassin.id}>) กรุณาเลือกผู้เล่นที่คิดว่าเป็น Merlin`,
    components: [row],
  });
}

// ---------------------------------------------------------------------------
// Helper: start game
// ---------------------------------------------------------------------------

async function startGame(client, interaction, game) {
  const canStart = game.canStart();
  if (!canStart.ok) {
    await interaction.reply({ content: canStart.reason, ephemeral: true });
    return;
  }

  const roleInfos = game.assignRoles();
  const questTable = game.getQuestTable();

  if (game.lobbyMessageId) {
    try {
      const lobbyMsg = await interaction.channel.messages.fetch(game.lobbyMessageId);
      if (lobbyMsg) {
        await lobbyMsg.edit({
          content: lobbyMsg.content.replace(/⏳.*|✅.*/, '🎮 เกมเริ่มแล้ว!'),
          components: [],
        });
      }
    } catch (_) {}
    game.lobbyMessageId = null;
  }

  await interaction.reply({
    content:
      `⚔️ **เริ่มเกม Avalon แล้ว!** มีผู้เล่น ${game.players.length} คน\n\n` +
      `📋 **ตารางภารกิจ**\n${questTable}\n\n` +
      'ระบบจะส่งบทบาทให้ผู้เล่นทาง DM...',
  });

  for (const info of roleInfos) {
    try {
      const member = await interaction.guild.members.fetch(info.id);
      const dm = await member.createDM();
      await dm.send(
        `คุณได้รับบทบาท **${info.roleName}**\n\n${info.description}`,
      );
    } catch (err) {
      console.error('ส่ง DM ไม่สำเร็จให้ผู้เล่น', info.id, err);
    }
  }

  await sendTeamProposalUI(interaction.channel, game);
}

// ---------------------------------------------------------------------------
// Select menu handler
// ---------------------------------------------------------------------------

async function handleSelectMenu(interaction) {
  const { customId } = interaction;

  if (customId === 'avalon_team_select') {
    const channelId = interaction.channelId;
    const game = gameManager.getGame(channelId);
    if (!game) {
      await interaction.reply({ content: 'ไม่พบเกมในช่องนี้', ephemeral: true });
      return true;
    }

    const memberIds = interaction.values;
    const result = game.proposeTeam(interaction.user.id, memberIds);

    if (!result.ok) {
      await interaction.reply({ content: result.message, ephemeral: true });
      return true;
    }

    await interaction.update({
      content: interaction.message.content + '\n\n✅ หัวหน้าทีมได้เลือกทีมแล้ว',
      components: [],
    });

    await sendTeamVoteUI(interaction.channel, game);
    return true;
  }

  if (customId === 'avalon_assassin_select') {
    const channelId = interaction.channelId;
    const game = gameManager.getGame(channelId);
    if (!game) {
      await interaction.reply({ content: 'ไม่พบเกมในช่องนี้', ephemeral: true });
      return true;
    }

    const targetId = interaction.values[0];
    const result = game.assassinGuess(interaction.user.id, targetId);

    if (!result.ok) {
      await interaction.reply({ content: result.message, ephemeral: true });
      return true;
    }

    await interaction.update({
      content: interaction.message.content + '\n\n🗡️ Assassin ได้ทำการเดาแล้ว',
      components: [],
    });

    if (result.broadcast) {
      await interaction.channel.send(result.broadcast);
    }
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Button handler
// ---------------------------------------------------------------------------

async function handleButton(client, interaction) {
  const { customId } = interaction;

  // ---- Lobby: Join ----
  if (customId === 'avalon_join') {
    const channelId = interaction.channelId;
    const game = gameManager.getGame(channelId);
    if (!game) {
      await interaction.reply({ content: 'ไม่พบเกมในช่องนี้', ephemeral: true });
      return true;
    }
    const result = game.addPlayer(
      interaction.user.id,
      interaction.member?.displayName || interaction.user.displayName || interaction.user.username,
    );
    await interaction.reply({ content: result.message, ephemeral: true });
    if (result.ok) await updateLobbyMessage(interaction, game);
    return true;
  }

  // ---- Lobby: Leave ----
  if (customId === 'avalon_leave') {
    const channelId = interaction.channelId;
    const game = gameManager.getGame(channelId);
    if (!game) {
      await interaction.reply({ content: 'ไม่พบเกมในช่องนี้', ephemeral: true });
      return true;
    }
    const result = game.removePlayer(interaction.user.id);
    await interaction.reply({ content: result.message, ephemeral: true });
    if (result.ok) await updateLobbyMessage(interaction, game);
    return true;
  }

  // ---- Lobby: Start ----
  if (customId === 'avalon_start') {
    const channelId = interaction.channelId;
    const game = gameManager.getGame(channelId);
    if (!game) {
      await interaction.reply({ content: 'ไม่พบเกมในช่องนี้', ephemeral: true });
      return true;
    }
    if (interaction.user.id !== game.hostId) {
      await interaction.reply({
        content: 'มีเพียงเจ้าห้องเท่านั้นที่สามารถเริ่มเกมได้',
        ephemeral: true,
      });
      return true;
    }
    await startGame(client, interaction, game);
    return true;
  }

  // ---- Team vote (Approve / Reject) ----
  if (customId === 'avalon_team_approve' || customId === 'avalon_team_reject') {
    const channelId = interaction.channelId;
    const game = gameManager.getGame(channelId);
    if (!game) {
      await interaction.reply({ content: 'ไม่พบเกมในช่องนี้', ephemeral: true });
      return true;
    }

    const approve = customId === 'avalon_team_approve';
    const result = game.voteTeam(interaction.user.id, approve);

    if (!result.ok) {
      await interaction.reply({ content: result.message, ephemeral: true });
      return true;
    }

    await interaction.reply({ content: result.message, ephemeral: true });

    if (result.allVotesIn) {
      try {
        await interaction.message.edit({ components: [] });
      } catch (_) {}

      if (result.broadcast) {
        await interaction.channel.send(result.broadcast);
      }

      if (game.phase === 'mission') {
        await sendMissionPromptUI(interaction.channel, game);
      } else if (game.phase === 'team_proposal') {
        await sendTeamProposalUI(interaction.channel, game);
      }
    }
    return true;
  }

  // ---- Mission prompt button ----
  if (customId === 'avalon_mission_prompt') {
    const channelId = interaction.channelId;
    const game = gameManager.getGame(channelId);
    if (!game) {
      await interaction.reply({ content: 'ไม่พบเกมในช่องนี้', ephemeral: true });
      return true;
    }
    if (game.phase !== 'mission') {
      await interaction.reply({ content: 'ตอนนี้ไม่ใช่ช่วงโหวตภารกิจ', ephemeral: true });
      return true;
    }
    if (!game.selectedTeam.includes(interaction.user.id)) {
      await interaction.reply({
        content: '⏳ กรุณารอสมาชิกทีมโหวตภารกิจ คุณไม่ได้อยู่ในทีมนี้',
        ephemeral: true,
      });
      return true;
    }
    if (game.missionVotes.has(interaction.user.id)) {
      await interaction.reply({ content: 'คุณได้โหวตไปแล้ว', ephemeral: true });
      return true;
    }

    const player = game.players.find((p) => p.id === interaction.user.id);
    const isEvil = player && player.role.side === 'evil';
    const row = createMissionVoteRow(isEvil);

    await interaction.reply({
      content: '🗡️ กรุณาเลือกผลภารกิจ',
      components: [row],
      ephemeral: true,
    });
    return true;
  }

  // ---- Mission vote (ephemeral) ----
  if (customId === 'avalon_mission_success' || customId === 'avalon_mission_fail') {
    const channelId = interaction.channelId;
    const game = gameManager.getGame(channelId);
    if (!game) {
      await interaction.reply({ content: 'ไม่พบเกมในช่องนี้', ephemeral: true });
      return true;
    }

    const choice = customId === 'avalon_mission_success' ? 'success' : 'fail';
    const result = game.voteMission(interaction.user.id, choice);

    if (!result.ok) {
      await interaction.reply({ content: result.message, ephemeral: true });
      return true;
    }

    await interaction.update({
      content: `คุณโหวต **${choice === 'success' ? 'สำเร็จ' : 'ล้มเหลว'}** แล้ว ✅`,
      components: [],
    });

    if (result.allVotesIn) {
      if (game.missionPromptMessageId) {
        try {
          const promptMsg = await interaction.channel.messages.fetch(
            game.missionPromptMessageId,
          );
          if (promptMsg) {
            await promptMsg.edit({
              content: promptMsg.content.replace(
                '⏳ รอสมาชิกทีมโหวตผลภารกิจ',
                '✅ สมาชิกทีมโหวตครบแล้ว',
              ),
              components: [],
            });
          }
        } catch (_) {}
        game.missionPromptMessageId = null;
      }

      if (result.broadcast) {
        await interaction.channel.send(result.broadcast);
      }

      if (game.phase === 'team_proposal') {
        await sendTeamProposalUI(interaction.channel, game);
      } else if (game.phase === 'assassin_guess') {
        await sendAssassinUI(interaction.channel, game);
      }
    }
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Main interaction handler (slash + buttons + selects)
// ---------------------------------------------------------------------------

async function handleInteraction(client, interaction) {
  if (interaction.isChatInputCommand() && interaction.commandName === 'avalon') {
    await execute(interaction, gameManager, { sendTeamProposalUI, sendLobbyUI });
    return true;
  }

  if (interaction.isStringSelectMenu()) {
    const customId = interaction.customId;
    if (customId === 'avalon_team_select' || customId === 'avalon_assassin_select') {
      return handleSelectMenu(interaction);
    }
  }

  if (interaction.isButton()) {
    const customId = interaction.customId;
    if (customId.startsWith('avalon_')) {
      return handleButton(client, interaction);
    }
  }

  return false;
}

module.exports = {
  name: 'avalon',
  getCommands: () => [data],
  handleInteraction,
};
