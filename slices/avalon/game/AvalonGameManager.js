const { assignRolesAndGetInfos } = require('./roles');

function createQuestSetupForPlayerCount(count) {
  const configByCount = {
    5: { teamSizes: [2, 3, 2, 3, 3], failsRequired: [1, 1, 1, 1, 1] },
    6: { teamSizes: [2, 3, 4, 3, 4], failsRequired: [1, 1, 1, 1, 1] },
    7: { teamSizes: [2, 3, 3, 4, 4], failsRequired: [1, 1, 1, 2, 1] },
    8: { teamSizes: [3, 4, 4, 5, 5], failsRequired: [1, 1, 1, 2, 1] },
    9: { teamSizes: [3, 4, 4, 5, 5], failsRequired: [1, 1, 1, 2, 1] },
    10: { teamSizes: [3, 4, 4, 5, 5], failsRequired: [1, 1, 1, 2, 1] },
  };
  const base = configByCount[count] || configByCount[10];
  return base.teamSizes.map((size, index) => ({
    index,
    teamSize: size,
    failsRequired: base.failsRequired[index],
    result: null,
  }));
}

class AvalonGame {
  constructor(channelId, hostId) {
    this.channelId = channelId;
    this.hostId = hostId;
    this.players = [];
    this.started = false;
    this.phase = 'lobby';
    this.leaderIndex = 0;
    this.currentQuestIndex = 0;
    this.quests = [];
    this.selectedTeam = [];
    this.teamVotes = new Map();
    this.missionVotes = new Map();
    this.consecutiveRejectedTeams = 0;
    this.winner = null;
    this.lobbyMessageId = null;
    this.missionPromptMessageId = null;
  }

  addPlayer(id, name) {
    if (this.started) {
      return { ok: false, message: 'เกมเริ่มไปแล้ว ไม่สามารถเข้าร่วมได้', ephemeral: true };
    }
    if (this.players.find((p) => p.id === id)) {
      return { ok: false, message: 'คุณอยู่ในรายชื่อผู้เล่นอยู่แล้ว', ephemeral: true };
    }
    if (this.players.length >= 10) {
      return { ok: false, message: 'ผู้เล่นเต็มแล้ว (สูงสุด 10 คน)', ephemeral: true };
    }
    this.players.push({ id, name, role: null });
    return {
      ok: true,
      message: `เข้าร่วมเกม Avalon เรียบร้อยแล้ว (ตอนนี้มีผู้เล่น ${this.players.length} คน)`,
    };
  }

  removePlayer(id) {
    if (this.started) {
      return { ok: false, message: 'เกมเริ่มไปแล้ว ไม่สามารถออกได้', ephemeral: true };
    }
    const before = this.players.length;
    this.players = this.players.filter((p) => p.id !== id);
    if (this.players.length === before) {
      return { ok: false, message: 'คุณยังไม่ได้อยู่ในเกมนี้', ephemeral: true };
    }
    return { ok: true, message: 'ออกจากเกมเรียบร้อยแล้ว' };
  }

  canStart() {
    if (this.started) return { ok: false, reason: 'เกมนี้เริ่มไปแล้ว' };
    if (this.players.length < 5) return { ok: false, reason: 'ต้องมีผู้เล่นอย่างน้อย 5 คนขึ้นไป' };
    return { ok: true };
  }

  assignRoles() {
    const infos = assignRolesAndGetInfos(this.players);
    this.started = true;
    this.phase = 'team_proposal';
    this.currentQuestIndex = 0;
    this.leaderIndex = 0;
    this.quests = createQuestSetupForPlayerCount(this.players.length);
    this.selectedTeam = [];
    this.teamVotes = new Map();
    this.missionVotes = new Map();
    this.consecutiveRejectedTeams = 0;
    this.winner = null;
    return infos;
  }

  getLeader() {
    if (!this.players.length) return null;
    return this.players[this.leaderIndex % this.players.length];
  }

  getCurrentQuest() {
    return this.quests[this.currentQuestIndex] != null
      ? this.quests[this.currentQuestIndex]
      : null;
  }

  getQuestTable() {
    const nums = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
    return this.quests
      .map((q, i) => {
        const icon =
          q.result === 'success' ? '✅' : q.result === 'fail' ? '❌' : '◻️';
        const active =
          i === this.currentQuestIndex && this.phase !== 'ended' ? ' 👈' : '';
        const extra =
          q.failsRequired > 1
            ? ` (ล้มเหลวเมื่อ ≥ ${q.failsRequired} ใบ)`
            : '';
        return `${nums[i]} ${icon} ภารกิจ ${i + 1}: ทีม **${q.teamSize}** คน${extra}${active}`;
      })
      .join('\n');
  }

  proposeTeam(leaderId, memberIds) {
    if (!this.started) {
      return { ok: false, message: 'เกมยังไม่เริ่ม ใช้คำสั่ง `/avalon start` ก่อน' };
    }
    if (this.phase !== 'team_proposal') {
      return {
        ok: false,
        message: 'ตอนนี้ยังไม่ใช่ช่วงเลือกทีม (อาจกำลังโหวตทีม หรือทำภารกิจอยู่)',
      };
    }
    const leader = this.getLeader();
    if (!leader || leader.id !== leaderId) {
      return { ok: false, message: 'มีเพียงหัวหน้าทีมเท่านั้นที่สามารถเลือกทีมได้' };
    }
    const quest = this.getCurrentQuest();
    if (!quest) {
      return { ok: false, message: 'ไม่พบข้อมูลภารกิจ (เกมอาจจบแล้ว)' };
    }

    const uniqueMembers = Array.from(new Set(memberIds.filter(Boolean)));
    if (uniqueMembers.length !== quest.teamSize) {
      return {
        ok: false,
        message: `จำนวนสมาชิกทีมต้องเท่ากับ ${quest.teamSize} คน (ตอนนี้เลือกมา ${uniqueMembers.length} คน)`,
      };
    }

    const invalid = uniqueMembers.find(
      (id) => !this.players.some((p) => p.id === id),
    );
    if (invalid) {
      return { ok: false, message: 'มีผู้เล่นบางคนที่ไม่ได้อยู่ในเกมนี้' };
    }

    this.selectedTeam = uniqueMembers;
    this.teamVotes = new Map();
    this.phase = 'team_vote';

    return { ok: true };
  }

  voteTeam(playerId, approve) {
    if (!this.started) return { ok: false, message: 'เกมยังไม่เริ่ม' };
    if (this.phase !== 'team_vote') {
      return { ok: false, message: 'ตอนนี้ยังไม่ใช่ช่วงโหวตทีม' };
    }
    if (!this.players.some((p) => p.id === playerId)) {
      return { ok: false, message: 'คุณไม่ได้อยู่ในเกมนี้', ephemeral: true };
    }
    if (this.teamVotes.has(playerId)) {
      return { ok: false, message: 'คุณได้โหวตไปแล้ว', ephemeral: true };
    }

    this.teamVotes.set(playerId, approve);
    const remaining = this.players.length - this.teamVotes.size;

    if (this.teamVotes.size < this.players.length) {
      return {
        ok: true,
        allVotesIn: false,
        message: `ลงคะแนนเรียบร้อยแล้ว (ยังเหลือผู้เล่นอีก ${remaining} คนที่ยังไม่ได้โหวต)`,
        ephemeral: true,
      };
    }

    const approveVoterIds = [];
    const rejectVoterIds = [];
    for (const [pid, v] of this.teamVotes.entries()) {
      if (v) approveVoterIds.push(pid);
      else rejectVoterIds.push(pid);
    }

    const approveCount = approveVoterIds.length;
    const rejectCount = rejectVoterIds.length;
    const questNo = this.currentQuestIndex + 1;
    const quest = this.getCurrentQuest();
    const teamList = this.selectedTeam.map((id) => `<@${id}>`).join(', ');
    const approved = approveCount > rejectCount;
    const rejectMentions =
      rejectVoterIds.length > 0
        ? rejectVoterIds.map((id) => `<@${id}>`).join(', ')
        : '-';

    let broadcast;

    if (approved) {
      this.phase = 'mission';
      this.consecutiveRejectedTeams = 0;
      this.missionVotes = new Map();
      broadcast =
        `**ผลโหวตทีม — ภารกิจที่ ${questNo}** (ทีม ${quest.teamSize} คน)\n` +
        `✅ เห็นด้วย: ${approveCount} | ❌ ไม่เห็นด้วย: ${rejectCount}\n` +
        `ผู้ที่โหวตไม่เห็นด้วย: ${rejectMentions}\n\n` +
        `ทีมนี้ได้รับการอนุมัติ! สมาชิกทีม: ${teamList}\n` +
        'สมาชิกทีมจะได้รับ DM เพื่อโหวตผลภารกิจ';
    } else {
      this.consecutiveRejectedTeams += 1;
      this.leaderIndex = (this.leaderIndex + 1) % this.players.length;
      const newLeader = this.getLeader();

      if (this.consecutiveRejectedTeams >= 5) {
        this.phase = 'ended';
        this.winner = 'evil';
        broadcast =
          `**ผลโหวตทีม — ภารกิจที่ ${questNo}**\n` +
          `✅ เห็นด้วย: ${approveCount} | ❌ ไม่เห็นด้วย: ${rejectCount}\n` +
          `ผู้ที่โหวตไม่เห็นด้วย: ${rejectMentions}\n\n` +
          '⚠️ ทีมถูกปฏิเสธครบ 5 ครั้งติดต่อกัน **ฝ่ายร้ายชนะทันที!**';
      } else {
        this.phase = 'team_proposal';
        broadcast =
          `**ผลโหวตทีม — ภารกิจที่ ${questNo}**\n` +
          `✅ เห็นด้วย: ${approveCount} | ❌ ไม่เห็นด้วย: ${rejectCount}\n` +
          `ผู้ที่โหวตไม่เห็นด้วย: ${rejectMentions}\n\n` +
          `ทีมนี้ถูกปฏิเสธ (ปฏิเสธติดต่อกัน ${this.consecutiveRejectedTeams}/5)\n` +
          `หัวหน้าทีมคนใหม่คือ <@${newLeader.id}>`;
      }
    }

    this.teamVotes = new Map();

    return {
      ok: true,
      allVotesIn: true,
      message: 'ลงคะแนนเรียบร้อยแล้ว',
      broadcast,
      ephemeral: true,
    };
  }

  voteMission(playerId, choice) {
    if (!this.started) return { ok: false, message: 'เกมยังไม่เริ่ม' };
    if (this.phase !== 'mission') {
      return { ok: false, message: 'ตอนนี้ยังไม่ใช่ช่วงโหวตผลภารกิจ' };
    }
    const quest = this.getCurrentQuest();
    if (!quest) return { ok: false, message: 'ไม่พบข้อมูลภารกิจ (เกมอาจจบแล้ว)' };
    if (!this.selectedTeam.includes(playerId)) {
      return {
        ok: false,
        message: 'มีเพียงสมาชิกทีมภารกิจเท่านั้นที่สามารถโหวตได้',
        ephemeral: true,
      };
    }
    if (this.missionVotes.has(playerId)) {
      return { ok: false, message: 'คุณได้โหวตไปแล้ว', ephemeral: true };
    }
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return { ok: false, message: 'ไม่พบข้อมูลผู้เล่น', ephemeral: true };

    const finalChoice =
      player.role.side === 'good' && choice === 'fail' ? 'success' : choice;

    this.missionVotes.set(playerId, finalChoice);
    const remaining = this.selectedTeam.length - this.missionVotes.size;

    if (this.missionVotes.size < this.selectedTeam.length) {
      return {
        ok: true,
        allVotesIn: false,
        message: `ลงคะแนนภารกิจเรียบร้อยแล้ว (ยังเหลือสมาชิกทีมอีก ${remaining} คน)`,
        ephemeral: true,
      };
    }

    let failCount = 0;
    for (const v of this.missionVotes.values()) {
      if (v === 'fail') failCount += 1;
    }
    const questNo = this.currentQuestIndex + 1;
    const success = failCount < quest.failsRequired;
    quest.result = success ? 'success' : 'fail';

    this.missionVotes = new Map();
    this.selectedTeam = [];

    const successTotal = this.quests.filter((q) => q.result === 'success').length;
    const failTotal = this.quests.filter((q) => q.result === 'fail').length;

    let broadcast;

    const resultLine =
      `**ผลภารกิจที่ ${questNo}** (ทีม ${quest.teamSize} คน): ${success ? '✅ สำเร็จ' : '❌ ล้มเหลว'}\n` +
      `มีการ์ดล้มเหลว ${failCount} ใบ (ต้องมีอย่างน้อย ${quest.failsRequired} ใบจึงจะล้มเหลว)\n`;

    const scoreLine = `\n📊 คะแนนรวม: ฝ่ายดีสำเร็จ ${successTotal} | ฝ่ายร้ายล้มเหลว ${failTotal}\n`;

    if (successTotal >= 3) {
      const hasAssassin = this.players.some((p) => p.role.key === 'ASSASSIN');
      if (hasAssassin) {
        this.phase = 'assassin_guess';
        broadcast =
          resultLine +
          scoreLine +
          '\n🎯 ฝ่ายดีชนะภารกิจครบ 3 ครั้ง! แต่ Assassin ยังมีโอกาสเดาว่าใครคือ Merlin';
      } else {
        this.phase = 'ended';
        this.winner = 'good';
        broadcast =
          resultLine +
          scoreLine +
          '\n🏆 ฝ่ายดีชนะภารกิจครบ 3 ครั้ง และไม่มี Assassin — **ฝ่ายดีชนะ!**';
      }
    } else if (failTotal >= 3) {
      this.phase = 'ended';
      this.winner = 'evil';
      broadcast =
        resultLine +
        scoreLine +
        '\n💀 ฝ่ายร้ายทำให้ภารกิจล้มเหลวครบ 3 ครั้ง — **ฝ่ายร้ายชนะ!**';
    } else {
      this.phase = 'team_proposal';
      this.currentQuestIndex += 1;
      this.leaderIndex = (this.leaderIndex + 1) % this.players.length;
      const newLeader = this.getLeader();
      const nextQuest = this.getCurrentQuest();
      broadcast =
        resultLine +
        scoreLine +
        `\nเข้าสู่ภารกิจที่ ${this.currentQuestIndex + 1} (ทีม ${nextQuest.teamSize} คน)\n` +
        `หัวหน้าทีมคนใหม่คือ <@${newLeader.id}>`;
    }

    return {
      ok: true,
      allVotesIn: true,
      message: 'ลงคะแนนภารกิจเรียบร้อยแล้ว',
      broadcast,
      ephemeral: true,
    };
  }

  assassinGuess(assassinId, targetId) {
    if (!this.started) return { ok: false, message: 'เกมยังไม่เริ่ม' };
    if (this.phase !== 'assassin_guess') {
      return { ok: false, message: 'ตอนนี้ยังไม่ใช่ช่วงให้ Assassin เดา Merlin' };
    }
    const assassin = this.players.find((p) => p.role.key === 'ASSASSIN');
    if (!assassin) return { ok: false, message: 'ในเกมนี้ไม่มี Assassin' };
    if (assassin.id !== assassinId) {
      return { ok: false, message: 'มีเพียง Assassin เท่านั้นที่สามารถใช้คำสั่งนี้ได้' };
    }
    const target = this.players.find((p) => p.id === targetId);
    if (!target) return { ok: false, message: 'ไม่พบผู้เล่นเป้าหมาย' };

    const isMerlin = target.role.key === 'MERLIN';
    this.phase = 'ended';
    this.winner = isMerlin ? 'evil' : 'good';

    const resultText = isMerlin
      ? `🗡️ Assassin เดาถูกว่า <@${target.id}> คือ **Merlin** — **ฝ่ายร้ายชนะ!**`
      : `🛡️ Assassin เดาผิด! <@${target.id}> ไม่ใช่ Merlin — **ฝ่ายดีชนะ!**`;

    const roleReveal = this.players
      .map((p) => `<@${p.id}> — ${p.role.name} (${p.role.side === 'good' ? 'ฝ่ายดี' : 'ฝ่ายร้าย'})`)
      .join('\n');

    return {
      ok: true,
      message: 'คุณได้ทำการเดาเรียบร้อยแล้ว',
      broadcast:
        `**ผลการเดาของ Assassin**\n${resultText}\n\n` +
        `**เฉลยบทบาททุกคน**\n${roleReveal}`,
      ephemeral: true,
    };
  }

  getStatus() {
    const questIcons =
      this.quests.length === 0
        ? 'ยังไม่มีภารกิจ (เกมยังไม่เริ่ม)'
        : this.getQuestTable();

    let phaseText = '';
    switch (this.phase) {
      case 'lobby':
        phaseText = 'ยังอยู่ในช่วงเตรียมผู้เล่น (ยังไม่เริ่มเกม)';
        break;
      case 'team_proposal':
        phaseText = 'กำลังรอหัวหน้าทีมเลือกทีมสำหรับภารกิจ';
        break;
      case 'team_vote':
        phaseText = 'กำลังอยู่ในช่วงโหวตทีม';
        break;
      case 'mission':
        phaseText = 'ทีมที่ได้รับเลือกกำลังลงคะแนนผลภารกิจ';
        break;
      case 'assassin_guess':
        phaseText = 'กำลังรอ Assassin เดาว่าใครคือ Merlin';
        break;
      case 'ended':
        phaseText =
          this.winner === 'good'
            ? 'เกมจบแล้ว: ฝ่ายดีเป็นผู้ชนะ 🏆'
            : this.winner === 'evil'
              ? 'เกมจบแล้ว: ฝ่ายร้ายเป็นผู้ชนะ 💀'
              : 'เกมจบแล้ว';
        break;
      default:
        phaseText = 'ไม่ทราบสถานะเกม';
    }

    const leader = this.getLeader();
    return { questIcons, phaseText, leaderId: leader ? leader.id : null };
  }
}

class AvalonGameManager {
  constructor() {
    this.games = new Map();
  }

  createGame(channelId, hostId) {
    const game = new AvalonGame(channelId, hostId);
    this.games.set(channelId, game);
    return game;
  }

  getGame(channelId) {
    return this.games.get(channelId);
  }

  removeGame(channelId) {
    this.games.delete(channelId);
  }
}

module.exports = { AvalonGame, AvalonGameManager };
