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
    return this.quests[this.currentQuestIndex] != null ? this.quests[this.currentQuestIndex] : null;
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
        message: `จำนวนสมาชิกทีมต้องเท่ากับ ${quest.teamSize} คน`,
      };
    }

    const invalid = uniqueMembers.find((id) => !this.players.some((p) => p.id === id));
    if (invalid) {
      return { ok: false, message: 'มีผู้เล่นบางคนที่ไม่ได้อยู่ในเกมนี้' };
    }

    this.selectedTeam = uniqueMembers;
    this.teamVotes = new Map();
    this.phase = 'team_vote';

    const teamList = this.selectedTeam.map((id) => `<@${id}>`).join(', ');
    return {
      ok: true,
      message:
        `หัวหน้าทีม <@${leader.id}> ได้เสนอทีมสำหรับภารกิจที่ ${this.currentQuestIndex + 1}\n` +
        `สมาชิกทีม: ${teamList}\n\n` +
        'ผู้เล่นทุกคนในเกม ใช้คำสั่ง `/avalon vote_team` เพื่อลงคะแนนเห็นด้วย/ไม่เห็นด้วยกับทีมนี้',
    };
  }

  voteTeam(playerId, approve) {
    if (!this.started) return { ok: false, message: 'เกมยังไม่เริ่ม' };
    if (this.phase !== 'team_vote') {
      return { ok: false, message: 'ตอนนี้ยังไม่ใช่ช่วงโหวตทีม' };
    }
    if (!this.players.some((p) => p.id === playerId)) {
      return { ok: false, message: 'คุณไม่ได้อยู่ในเกมนี้', ephemeral: true };
    }

    this.teamVotes.set(playerId, approve);
    const remaining = this.players.length - this.teamVotes.size;

    let broadcast = null;
    if (this.teamVotes.size === this.players.length) {
      let approveCount = 0;
      let rejectCount = 0;
      for (const v of this.teamVotes.values()) {
        if (v) approveCount += 1;
        else rejectCount += 1;
      }

      const questNo = this.currentQuestIndex + 1;
      const teamList = this.selectedTeam.map((id) => `<@${id}>`).join(', ');
      const approved = approveCount > rejectCount;

      if (approved) {
        this.phase = 'mission';
        this.consecutiveRejectedTeams = 0;
        broadcast =
          `**ผลโหวตทีม ภารกิจที่ ${questNo}**\n` +
          `เห็นด้วย: ${approveCount} | ไม่เห็นด้วย: ${rejectCount}\n` +
          `ทีมนี้ได้รับการอนุมัติ สมาชิกทีม: ${teamList}\n\n` +
          'สมาชิกทีมใช้คำสั่ง `/avalon mission_vote` เพื่อโหวต สำเร็จ/ล้มเหลว (ฝ่ายดีต้องโหวตสำเร็จเท่านั้น)';
      } else {
        this.consecutiveRejectedTeams += 1;
        this.leaderIndex = (this.leaderIndex + 1) % this.players.length;
        const newLeader = this.getLeader();

        if (this.consecutiveRejectedTeams >= 5) {
          this.phase = 'ended';
          this.winner = 'evil';
          broadcast =
            `**ผลโหวตทีม ภารกิจที่ ${questNo}**\n` +
            `เห็นด้วย: ${approveCount} | ไม่เห็นด้วย: ${rejectCount}\n` +
            'ทีมถูกปฏิเสธครบ 5 ครั้งติดต่อกัน ฝ่ายร้ายชนะทันที!';
        } else {
          this.phase = 'team_proposal';
          broadcast =
            `**ผลโหวตทีม ภารกิจที่ ${questNo}**\n` +
            `เห็นด้วย: ${approveCount} | ไม่เห็นด้วย: ${rejectCount}\n` +
            'ทีมนี้ถูกปฏิเสธ หัวหน้าทีมจะหมุนไปคนถัดไป\n' +
            `หัวหน้าทีมคนใหม่คือ <@${newLeader.id}> ใช้คำสั่ง \`/avalon propose_team\` เพื่อเสนอทีมใหม่`;
        }
      }

      this.teamVotes = new Map();
    }

    return {
      ok: true,
      message:
        remaining > 0
          ? `ลงคะแนนเรียบร้อยแล้ว (ยังเหลือผู้เล่นอีก ${remaining} คนที่ยังไม่ได้โหวต)`
          : 'ลงคะแนนเรียบร้อยแล้ว',
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
      return { ok: false, message: 'มีเพียงสมาชิกทีมภารกิจเท่านั้นที่สามารถโหวตได้', ephemeral: true };
    }
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return { ok: false, message: 'ไม่พบข้อมูลผู้เล่น', ephemeral: true };
    if (this.missionVotes.has(playerId)) {
      return { ok: false, message: 'คุณได้โหวตไปแล้ว', ephemeral: true };
    }

    let finalChoice = choice;
    let note = '';
    if (player.role.side === 'good' && choice === 'fail') {
      finalChoice = 'success';
      note = ' (คุณเป็นฝ่ายดี จึงถือว่าโหวตสำเร็จเท่านั้น)';
    }

    this.missionVotes.set(playerId, finalChoice);
    const remaining = this.selectedTeam.length - this.missionVotes.size;

    let broadcast = null;
    if (this.missionVotes.size === this.selectedTeam.length) {
      let failCount = 0;
      for (const v of this.missionVotes.values()) {
        if (v === 'fail') failCount += 1;
      }
      const questNo = this.currentQuestIndex + 1;
      const success = failCount < quest.failsRequired;
      quest.result = success ? 'success' : 'fail';

      this.missionVotes = new Map();
      this.selectedTeam = [];

      const successCount = this.quests.filter((q) => q.result === 'success').length;
      const failCountTotal = this.quests.filter((q) => q.result === 'fail').length;

      if (successCount >= 3) {
        const hasAssassin = this.players.some((p) => p.role.key === 'ASSASSIN');
        if (hasAssassin) {
          this.phase = 'assassin_guess';
          broadcast =
            `**ผลภารกิจที่ ${questNo}**: ${success ? 'สำเร็จ' : 'ล้มเหลว'}\n` +
            `มีการ์ดล้มเหลว ${failCount} ใบ (ต้องมีอย่างน้อย ${quest.failsRequired} ใบจึงจะล้มเหลว)\n\n` +
            `ตอนนี้ฝ่ายดีชนะภารกิจครบ 3 ครั้งแล้ว!\n` +
            'ให้ Assassin ใช้คำสั่ง `/avalon assassin_guess` เพื่อเดาว่าใครคือ Merlin';
        } else {
          this.phase = 'ended';
          this.winner = 'good';
          broadcast =
            `**ผลภารกิจที่ ${questNo}**: ${success ? 'สำเร็จ' : 'ล้มเหลว'}\n` +
            `มีการ์ดล้มเหลว ${failCount} ใบ\n\n` +
            'ฝ่ายดีชนะภารกิจครบ 3 ครั้ง และไม่มี Assassin เกมจบ ฝ่ายดีชนะ!';
        }
      } else if (failCountTotal >= 3) {
        this.phase = 'ended';
        this.winner = 'evil';
        broadcast =
          `**ผลภารกิจที่ ${questNo}**: ${success ? 'สำเร็จ' : 'ล้มเหลว'}\n` +
          `มีการ์ดล้มเหลว ${failCount} ใบ\n\n` +
          'ฝ่ายร้ายทำให้ภารกิจล้มเหลวครบ 3 ครั้ง เกมจบ ฝ่ายร้ายชนะ!';
      } else {
        this.phase = 'team_proposal';
        this.currentQuestIndex += 1;
        this.leaderIndex = (this.leaderIndex + 1) % this.players.length;
        const newLeader = this.getLeader();
        broadcast =
          `**ผลภารกิจที่ ${questNo}**: ${success ? 'สำเร็จ' : 'ล้มเหลว'}\n` +
          `มีการ์ดล้มเหลว ${failCount} ใบ\n\n` +
          `ตอนนี้ผลรวมภารกิจ: ฝ่ายดีสำเร็จ ${successCount} ครั้ง | ฝ่ายร้ายล้มเหลว ${failCountTotal} ครั้ง\n` +
          `เข้าสู่ภารกิจที่ ${this.currentQuestIndex + 1}\n` +
          `หัวหน้าทีมคนใหม่คือ <@${newLeader.id}> ใช้คำสั่ง \`/avalon propose_team\` เพื่อเลือกทีม`;
      }
    }

    return {
      ok: true,
      message: `ลงคะแนนภารกิจเรียบร้อยแล้ว${note}${remaining > 0 ? ` (ยังเหลือสมาชิกทีมอีก ${remaining} คนที่ยังไม่ได้โหวต)` : ''}`,
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
      ? `Assassin เดาถูกว่า <@${target.id}> คือ Merlin ฝ่ายร้ายชนะ!`
      : `Assassin เดาผิด <@${target.id}> ไม่ใช่ Merlin ฝ่ายดีชนะ!`;

    return {
      ok: true,
      message: 'คุณได้ทำการเดาเรียบร้อยแล้ว',
      broadcast: `**ผลการเดาของ Assassin**\n${resultText}`,
      ephemeral: true,
    };
  }

  getStatus() {
    const questIcons =
      this.quests.length === 0
        ? 'ยังไม่มีภารกิจ (เกมยังไม่เริ่ม)'
        : this.quests
            .map((q, i) => {
              const icon = q.result === 'success' ? '✅' : q.result === 'fail' ? '❌' : '◻️';
              return `${icon} ภารกิจที่ ${i + 1} (ทีม ${q.teamSize} คน, ล้มเหลวเมื่อการ์ดล้มเหลว ≥ ${q.failsRequired})`;
            })
            .join('\n');

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
            ? 'เกมจบแล้ว: ฝ่ายดีเป็นผู้ชนะ'
            : this.winner === 'evil'
              ? 'เกมจบแล้ว: ฝ่ายร้ายเป็นผู้ชนะ'
              : 'เกมจบแล้ว';
        break;
      default:
        phaseText = 'ไม่ทราบสถานะเกม (ผิดปกติ)';
    }

    const leader = this.getLeader();
    return {
      questIcons,
      phaseText,
      leaderId: leader ? leader.id : null,
    };
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
