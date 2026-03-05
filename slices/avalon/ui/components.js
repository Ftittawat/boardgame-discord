const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');

function createTeamSelectRow(players, teamSize) {
  const options = players.map((p) => ({
    label: p.name,
    value: p.id,
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId('avalon_team_select')
    .setPlaceholder(`เลือกสมาชิกทีม ${teamSize} คน`)
    .setMinValues(teamSize)
    .setMaxValues(teamSize)
    .addOptions(options);

  return new ActionRowBuilder().addComponents(menu);
}

function createTeamVoteRow() {
  const approve = new ButtonBuilder()
    .setCustomId('avalon_team_approve')
    .setLabel('เห็นด้วย (Approve)')
    .setStyle(ButtonStyle.Success);

  const reject = new ButtonBuilder()
    .setCustomId('avalon_team_reject')
    .setLabel('ไม่เห็นด้วย (Reject)')
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(approve, reject);
}

function createMissionPromptRow() {
  const btn = new ButtonBuilder()
    .setCustomId('avalon_mission_prompt')
    .setLabel('โหวตภารกิจ (เฉพาะสมาชิกทีม)')
    .setStyle(ButtonStyle.Primary);

  return new ActionRowBuilder().addComponents(btn);
}

function createMissionVoteRow(isEvil) {
  const success = new ButtonBuilder()
    .setCustomId('avalon_mission_success')
    .setLabel('สำเร็จ (Success)')
    .setStyle(ButtonStyle.Success);

  const components = [success];

  if (isEvil) {
    const fail = new ButtonBuilder()
      .setCustomId('avalon_mission_fail')
      .setLabel('ล้มเหลว (Fail)')
      .setStyle(ButtonStyle.Danger);
    components.push(fail);
  }

  return new ActionRowBuilder().addComponents(...components);
}

function createAssassinSelectRow(goodPlayers) {
  const options = goodPlayers.map((p) => ({
    label: p.name,
    value: p.id,
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId('avalon_assassin_select')
    .setPlaceholder('เลือกผู้เล่นที่คิดว่าเป็น Merlin')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  return new ActionRowBuilder().addComponents(menu);
}

function createLobbyRow() {
  const join = new ButtonBuilder()
    .setCustomId('avalon_join')
    .setLabel('เข้าร่วม (Join)')
    .setStyle(ButtonStyle.Success);

  const leave = new ButtonBuilder()
    .setCustomId('avalon_leave')
    .setLabel('ออก (Leave)')
    .setStyle(ButtonStyle.Secondary);

  const start = new ButtonBuilder()
    .setCustomId('avalon_start')
    .setLabel('เริ่มเกม (Start)')
    .setStyle(ButtonStyle.Primary);

  return new ActionRowBuilder().addComponents(join, leave, start);
}

module.exports = {
  createTeamSelectRow,
  createTeamVoteRow,
  createMissionPromptRow,
  createMissionVoteRow,
  createAssassinSelectRow,
  createLobbyRow,
};
