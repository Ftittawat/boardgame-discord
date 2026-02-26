const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { ROLES, getRoleDistribution, shuffle } = require('./roles');

const TIMING = {
  NIGHT: 60_000,
  DISCUSSION: 60_000,
  VOTE: 45_000,
  HUNTER: 30_000,
};

const COLOR = {
  LOBBY: 0x3498db,
  NIGHT: 0x1a1a2e,
  DAY: 0xf39c12,
  DEATH: 0xe74c3c,
  VILLAGE_WIN: 0x2ecc71,
  WOLF_WIN: 0xe74c3c,
  INFO: 0x9b59b6,
};

class Game {
  constructor(channel, host, client) {
    this.channel = channel;
    this.host = host;
    this.client = client;
    this.players = new Map();
    this.phase = 'lobby';
    this.round = 0;
    this.nightActions = {};
    this.nightProcessed = false;
    this.actionsNeeded = 0;
    this.actionsReceived = 0;
    this.dayVotes = new Map();
    this.dayVoteProcessed = false;
    this.lastDoctorTarget = null;
    this.hunterPending = false;
    this.hunterResolve = null;
    this.lobbyMessage = null;
    this.timer = null;
    this.addPlayer(host);
  }

  get id() {
    return this.channel.id;
  }

  addPlayer(user) {
    if (this.phase !== 'lobby') return { success: false, msg: 'เกมเริ่มไปแล้ว ไม่สามารถเข้าร่วมได้' };
    if (this.players.has(user.id)) return { success: false, msg: 'คุณอยู่ในเกมแล้ว' };
    if (this.players.size >= 16) return { success: false, msg: 'เกมเต็มแล้ว (สูงสุด 16 คน)' };
    this.players.set(user.id, {
      id: user.id,
      user,
      displayName: user.globalName || user.username,
      role: null,
      alive: true,
    });
    return { success: true, msg: `${user.globalName || user.username} เข้าร่วมเกมแล้ว!` };
  }

  removePlayer(userId) {
    if (this.phase !== 'lobby') return { success: false, msg: 'ไม่สามารถออกจากเกมที่เริ่มแล้วได้' };
    if (!this.players.has(userId)) return { success: false, msg: 'คุณไม่ได้อยู่ในเกม' };
    if (userId === this.host.id) return { success: false, msg: 'เจ้าของห้องไม่สามารถออกจากเกมได้' };
    this.players.delete(userId);
    return { success: true, msg: 'ออกจากเกมแล้ว' };
  }

  async startGame() {
    if (this.players.size < 4) return { success: false, msg: 'ต้องมีผู้เล่นอย่างน้อย 4 คน' };
    this.phase = 'starting';
    this.assignRoles();
    const dmResults = await this.sendRoleDMs();
    if (dmResults.failed.length > 0) {
      const names = dmResults.failed.map((id) => this.players.get(id)?.displayName).join(', ');
      await this.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.DEATH)
            .setDescription(`⚠️ ไม่สามารถส่ง DM ให้: ${names}\nกรุณาเปิด DM แล้วลองใหม่`),
        ],
      });
      this.phase = 'lobby';
      this.players.forEach((p) => (p.role = null));
      return { success: false, msg: 'ส่ง DM ไม่สำเร็จ' };
    }
    await this.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.INFO)
          .setTitle('🎭 เกมหมาป่าเริ่มแล้ว!')
          .setDescription(`ผู้เล่นทั้งหมด ${this.players.size} คนได้รับบทบาทแล้ว\nตรวจสอบ DM ของคุณเพื่อดูบทบาท!`)
          .addFields({
            name: '👥 ผู้เล่น',
            value: [...this.players.values()].map((p) => p.displayName).join(', '),
          }),
      ],
    });
    await this.sleep(3000);
    await this.startNight();
    return { success: true };
  }

  assignRoles() {
    const distribution = getRoleDistribution(this.players.size);
    const shuffled = shuffle(distribution);
    const playerArr = [...this.players.values()];
    playerArr.forEach((player, i) => { player.role = shuffled[i]; });
  }

  async sendRoleDMs() {
    const results = { success: [], failed: [] };
    for (const player of this.players.values()) {
      try {
        const embed = new EmbedBuilder()
          .setColor(player.role.team === 'werewolf' ? COLOR.DEATH : COLOR.VILLAGE_WIN)
          .setTitle(`${player.role.emoji} บทบาทของคุณ: ${player.role.name}`)
          .setDescription(player.role.description)
          .addFields({ name: '🏠 ห้อง', value: `#${this.channel.name}` });
        if (player.role.id === 'werewolf') {
          const otherWolves = [...this.players.values()]
            .filter((p) => p.role.id === 'werewolf' && p.id !== player.id)
            .map((p) => p.displayName);
          if (otherWolves.length > 0) embed.addFields({ name: '🐺 หมาป่าคนอื่น', value: otherWolves.join(', ') });
        }
        await player.user.send({ embeds: [embed] });
        results.success.push(player.id);
      } catch {
        results.failed.push(player.id);
      }
    }
    return results;
  }

  async startNight() {
    this.phase = 'night';
    this.round++;
    this.nightProcessed = false;
    this.actionsReceived = 0;
    this.nightActions = { werewolfVotes: new Map(), seerTarget: null, doctorTarget: null };
    const livingWolves = this.getLivingByRole('werewolf');
    const seer = this.getLivingByRole('seer')[0];
    const doctor = this.getLivingByRole('doctor')[0];
    this.actionsNeeded = livingWolves.length + (seer ? 1 : 0) + (doctor ? 1 : 0);
    const endTimestamp = Math.floor((Date.now() + TIMING.NIGHT) / 1000);
    await this.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.NIGHT)
          .setTitle(`🌙 คืนที่ ${this.round}`)
          .setDescription(`ความมืดปกคลุมหมู่บ้าน... ทุกคนหลับตา\nกลางคืนจะสิ้นสุด <t:${endTimestamp}:R>`)
          .setFooter({ text: 'ผู้ที่มีบทบาทพิเศษ กรุณาตรวจสอบ DM' }),
      ],
    });
    await this.sendWerewolfDMs(livingWolves);
    if (seer) await this.sendSeerDM(seer);
    if (doctor) await this.sendDoctorDM(doctor);
    if (this.actionsNeeded === 0) {
      await this.processNight();
      return;
    }
    this.timer = setTimeout(() => this.processNight(), TIMING.NIGHT);
  }

  async sendWerewolfDMs(wolves) {
    const targets = this.getLivingPlayers().filter((p) => p.role.id !== 'werewolf');
    if (targets.length === 0) return;
    const options = targets.map((p) => ({ label: p.displayName, value: p.id, emoji: '🎯' }));
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ww:kill:${this.id}`)
        .setPlaceholder('เลือกเป้าหมายที่จะกัด...')
        .addOptions(options)
    );
    for (const wolf of wolves) {
      try {
        const embed = new EmbedBuilder()
          .setColor(COLOR.DEATH)
          .setTitle(`🐺 กลางคืน - คืนที่ ${this.round}`)
          .setDescription('เลือกผู้เล่นที่จะกัดคืนนี้');
        if (wolves.length > 1) {
          const packNames = wolves.filter((w) => w.id !== wolf.id).map((w) => w.displayName);
          embed.addFields({ name: '🐺 ฝูงของคุณ', value: packNames.join(', ') });
        }
        await wolf.user.send({ embeds: [embed], components: [row] });
      } catch {
        this.actionsNeeded--;
      }
    }
  }

  async sendSeerDM(seer) {
    const targets = this.getLivingPlayers().filter((p) => p.id !== seer.id);
    if (targets.length === 0) return;
    const options = targets.map((p) => ({ label: p.displayName, value: p.id, emoji: '👤' }));
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ww:check:${this.id}`)
        .setPlaceholder('เลือกผู้เล่นที่จะตรวจสอบ...')
        .addOptions(options)
    );
    try {
      await seer.user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.INFO)
            .setTitle(`🔮 กลางคืน - คืนที่ ${this.round}`)
            .setDescription('เลือกผู้เล่นที่จะตรวจสอบตัวตน'),
        ],
        components: [row],
      });
    } catch {
      this.actionsNeeded--;
    }
  }

  async sendDoctorDM(doctor) {
    let targets = this.getLivingPlayers();
    if (this.lastDoctorTarget) targets = targets.filter((p) => p.id !== this.lastDoctorTarget);
    if (targets.length === 0) return;
    const options = targets.map((p) => ({
      label: p.displayName + (p.id === doctor.id ? ' (ตัวเอง)' : ''),
      value: p.id,
      emoji: '🛡️',
    }));
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ww:protect:${this.id}`)
        .setPlaceholder('เลือกผู้เล่นที่จะปกป้อง...')
        .addOptions(options)
    );
    try {
      const desc = this.lastDoctorTarget
        ? 'เลือกผู้เล่นที่จะปกป้องคืนนี้\n⚠️ ไม่สามารถปกป้องคนเดิมซ้อนคืนได้'
        : 'เลือกผู้เล่นที่จะปกป้องคืนนี้';
      await doctor.user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.VILLAGE_WIN)
            .setTitle(`💉 กลางคืน - คืนที่ ${this.round}`)
            .setDescription(desc),
        ],
        components: [row],
      });
    } catch {
      this.actionsNeeded--;
    }
  }

  handleNightAction(userId, action, targetId) {
    if (this.phase !== 'night' || this.nightProcessed) return { success: false, msg: 'ไม่ใช่เวลากลางคืน' };
    const player = this.players.get(userId);
    if (!player || !player.alive) return { success: false, msg: 'คุณไม่ได้อยู่ในเกมนี้' };
    switch (action) {
      case 'kill': {
        if (player.role.id !== 'werewolf') return { success: false, msg: 'คุณไม่ใช่หมาป่า' };
        if (this.nightActions.werewolfVotes.has(userId)) return { success: false, msg: 'คุณเลือกแล้ว' };
        this.nightActions.werewolfVotes.set(userId, targetId);
        const target = this.players.get(targetId);
        this.actionsReceived++;
        if (this.actionsReceived >= this.actionsNeeded) {
          clearTimeout(this.timer);
          this.processNight();
        }
        return { success: true, msg: `เลือก ${target?.displayName} แล้ว` };
      }
      case 'check': {
        if (player.role.id !== 'seer') return { success: false, msg: 'คุณไม่ใช่หมอดู' };
        if (this.nightActions.seerTarget) return { success: false, msg: 'คุณตรวจสอบแล้ว' };
        this.nightActions.seerTarget = targetId;
        this.actionsReceived++;
        if (this.actionsReceived >= this.actionsNeeded) {
          clearTimeout(this.timer);
          this.processNight();
        }
        return { success: true, msg: 'บันทึกการตรวจสอบแล้ว' };
      }
      case 'protect': {
        if (player.role.id !== 'doctor') return { success: false, msg: 'คุณไม่ใช่หมอ' };
        if (this.nightActions.doctorTarget) return { success: false, msg: 'คุณเลือกแล้ว' };
        this.nightActions.doctorTarget = targetId;
        this.lastDoctorTarget = targetId;
        this.actionsReceived++;
        if (this.actionsReceived >= this.actionsNeeded) {
          clearTimeout(this.timer);
          this.processNight();
        }
        const target = this.players.get(targetId);
        return { success: true, msg: `ปกป้อง ${target?.displayName} แล้ว` };
      }
      default:
        return { success: false, msg: 'การกระทำไม่ถูกต้อง' };
    }
  }

  async processNight() {
    if (this.nightProcessed) return;
    this.nightProcessed = true;
    clearTimeout(this.timer);
    const voteCount = new Map();
    for (const targetId of this.nightActions.werewolfVotes.values()) {
      voteCount.set(targetId, (voteCount.get(targetId) || 0) + 1);
    }
    let killTarget = null;
    if (voteCount.size > 0) {
      const maxVotes = Math.max(...voteCount.values());
      const topTargets = [...voteCount.entries()].filter(([, v]) => v === maxVotes).map(([id]) => id);
      killTarget = topTargets[Math.floor(Math.random() * topTargets.length)];
    }
    const protected_ = this.nightActions.doctorTarget;
    const saved = killTarget && killTarget === protected_;
    const victim = killTarget && !saved ? this.players.get(killTarget) : null;

    const seer = this.getLivingByRole('seer')[0];
    if (seer && this.nightActions.seerTarget) {
      const checked = this.players.get(this.nightActions.seerTarget);
      if (checked) {
        const isWolf = checked.role.team === 'werewolf';
        try {
          await seer.user.send({
            embeds: [
              new EmbedBuilder()
                .setColor(isWolf ? COLOR.DEATH : COLOR.VILLAGE_WIN)
                .setTitle('🔮 ผลการตรวจสอบ')
                .setDescription(`**${checked.displayName}** เป็น ${isWolf ? '🐺 **หมาป่า**!' : '👨‍🌾 **ฝ่ายชาวบ้าน**'}`),
            ],
          });
        } catch {}
      }
    }
    if (victim) victim.alive = false;

    let resultText;
    if (!killTarget) resultText = '🌅 ดวงอาทิตย์ขึ้นแล้ว... หมาป่าไม่ได้ลงมือคืนนี้\nไม่มีใครเสียชีวิต';
    else if (saved) resultText = '🌅 ดวงอาทิตย์ขึ้นแล้ว... หมอปกป้องเป้าหมายได้สำเร็จ!\nไม่มีใครเสียชีวิต';
    else resultText = `🌅 ดวงอาทิตย์ขึ้นแล้ว...\n💀 **${victim.displayName}** ถูกหมาป่ากัดตายเมื่อคืน!\nบทบาท: ${victim.role.emoji} ${victim.role.name}`;

    if (victim && victim.role.id === 'hunter') {
      await this.channel.send({
        embeds: [new EmbedBuilder().setColor(COLOR.DEATH).setTitle('☀️ เช้าวันใหม่').setDescription(resultText)],
      });
      const winner = this.checkWinCondition();
      if (winner) { await this.endGame(winner); return; }
      await this.handleHunterRevenge(victim);
      const winner2 = this.checkWinCondition();
      if (winner2) { await this.endGame(winner2); return; }
      await this.startDayDiscussion();
      return;
    }
    const winner = this.checkWinCondition();
    if (winner) {
      await this.channel.send({
        embeds: [new EmbedBuilder().setColor(COLOR.DEATH).setTitle('☀️ เช้าวันใหม่').setDescription(resultText)],
      });
      await this.endGame(winner);
      return;
    }
    await this.channel.send({
      embeds: [new EmbedBuilder().setColor(COLOR.DAY).setTitle('☀️ เช้าวันใหม่').setDescription(resultText)],
    });
    await this.startDayDiscussion();
  }

  async startDayDiscussion() {
    this.phase = 'day_discussion';
    const endTimestamp = Math.floor((Date.now() + TIMING.DISCUSSION) / 1000);
    const livingList = this.getLivingPlayers().map((p) => `• ${p.displayName}`).join('\n');
    await this.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.DAY)
          .setTitle('💬 เวลาอภิปราย')
          .setDescription(`ถึงเวลาหารือกันว่าใครเป็นหมาป่า!\nการโหวตจะเริ่มขึ้น <t:${endTimestamp}:R>`)
          .addFields({ name: `🧍 ผู้เล่นที่ยังมีชีวิต (${this.getLivingPlayers().length})`, value: livingList }),
      ],
    });
    this.timer = setTimeout(() => this.startDayVote(), TIMING.DISCUSSION);
  }

  async startDayVote() {
    this.phase = 'day_vote';
    this.dayVotes = new Map();
    this.dayVoteProcessed = false;
    const livingPlayers = this.getLivingPlayers();
    const endTimestamp = Math.floor((Date.now() + TIMING.VOTE) / 1000);
    const options = livingPlayers.map((p) => ({ label: p.displayName, value: p.id, emoji: '🗳️' }));
    options.push({ label: 'ข้ามโหวต', value: 'skip', emoji: '⏭️' });
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ww:vote:${this.id}`)
        .setPlaceholder('เลือกคนที่จะขับไล่...')
        .addOptions(options)
    );
    await this.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.DAY)
          .setTitle('🗳️ เวลาโหวต!')
          .setDescription(`เลือกผู้เล่นที่จะขับไล่ออกจากหมู่บ้าน\nการโหวตจะปิด <t:${endTimestamp}:R>`)
          .setFooter({ text: 'เลือกจากเมนูด้านล่าง • สามารถเปลี่ยนโหวตได้' }),
      ],
      components: [row],
    });
    this.timer = setTimeout(() => this.processDayVote(), TIMING.VOTE);
  }

  handleDayVote(userId, targetId) {
    if (this.phase !== 'day_vote' || this.dayVoteProcessed) return { success: false, msg: 'ไม่ใช่เวลาโหวต' };
    const player = this.players.get(userId);
    if (!player || !player.alive) return { success: false, msg: 'คุณไม่สามารถโหวตได้' };
    if (targetId !== 'skip' && userId === targetId) return { success: false, msg: 'ไม่สามารถโหวตตัวเองได้' };
    this.dayVotes.set(userId, targetId);
    const livingCount = this.getLivingPlayers().length;
    if (this.dayVotes.size >= livingCount) {
      clearTimeout(this.timer);
      this.processDayVote();
    }
    if (targetId === 'skip') return { success: true, msg: 'ข้ามโหวตแล้ว' };
    const target = this.players.get(targetId);
    return { success: true, msg: `โหวต ${target?.displayName} แล้ว` };
  }

  async processDayVote() {
    if (this.dayVoteProcessed) return;
    this.dayVoteProcessed = true;
    clearTimeout(this.timer);
    const voteCount = new Map();
    const voterList = new Map();
    for (const [voterId, targetId] of this.dayVotes) {
      if (targetId === 'skip') continue;
      voteCount.set(targetId, (voteCount.get(targetId) || 0) + 1);
      if (!voterList.has(targetId)) voterList.set(targetId, []);
      voterList.get(targetId).push(this.players.get(voterId)?.displayName || 'Unknown');
    }
    let resultText = '**📊 ผลการโหวต:**\n';
    if (voteCount.size === 0) resultText += 'ไม่มีใครได้รับโหวต\n';
    else {
      const sorted = [...voteCount.entries()].sort((a, b) => b[1] - a[1]);
      for (const [targetId, count] of sorted) {
        const target = this.players.get(targetId);
        const voters = voterList.get(targetId).join(', ');
        resultText += `• ${target?.displayName}: ${count} โหวต (จาก: ${voters})\n`;
      }
    }
    const skipCount = [...this.dayVotes.values()].filter((v) => v === 'skip').length;
    if (skipCount > 0) resultText += `• ข้ามโหวต: ${skipCount} คน\n`;
    const noVoteCount = this.getLivingPlayers().length - this.dayVotes.size;
    if (noVoteCount > 0) resultText += `• ไม่ลงคะแนน: ${noVoteCount} คน\n`;

    let eliminatedId = null;
    if (voteCount.size > 0) {
      const maxVotes = Math.max(...voteCount.values());
      const topTargets = [...voteCount.entries()].filter(([, v]) => v === maxVotes);
      if (topTargets.length === 1) eliminatedId = topTargets[0][0];
    }

    if (!eliminatedId) {
      resultText += '\n**ไม่มีใครถูกขับไล่** (เสมอกัน หรือ ไม่มีโหวต)';
      await this.channel.send({
        embeds: [new EmbedBuilder().setColor(COLOR.DAY).setTitle('📊 ผลการโหวต').setDescription(resultText)],
      });
      const winner = this.checkWinCondition();
      if (winner) { await this.endGame(winner); return; }
      await this.sleep(3000);
      await this.startNight();
      return;
    }

    const eliminated = this.players.get(eliminatedId);
    eliminated.alive = false;
    resultText += `\n⚰️ **${eliminated.displayName}** ถูกขับไล่ออกจากหมู่บ้าน!\nบทบาท: ${eliminated.role.emoji} ${eliminated.role.name}`;
    await this.channel.send({
      embeds: [new EmbedBuilder().setColor(COLOR.DEATH).setTitle('📊 ผลการโหวต').setDescription(resultText)],
    });
    if (eliminated.role.id === 'hunter') {
      const winner = this.checkWinCondition();
      if (winner) { await this.endGame(winner); return; }
      await this.handleHunterRevenge(eliminated);
    }
    const winner = this.checkWinCondition();
    if (winner) { await this.endGame(winner); return; }
    await this.sleep(3000);
    await this.startNight();
  }

  async handleHunterRevenge(hunter) {
    this.phase = 'hunter_revenge';
    this.hunterPending = true;
    const targets = this.getLivingPlayers();
    if (targets.length === 0) { this.hunterPending = false; return; }
    const options = targets.map((p) => ({ label: p.displayName, value: p.id, emoji: '🎯' }));
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ww:shoot:${this.id}`)
        .setPlaceholder('เลือกเป้าหมายที่จะยิง...')
        .addOptions(options)
    );
    await this.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.DEATH)
          .setTitle('🏹 นักล่าถูกกำจัด!')
          .setDescription(`**${hunter.displayName}** เป็นนักล่า! สามารถเลือกยิงผู้เล่น 1 คนก่อนตาย`),
      ],
    });
    try {
      const endTimestamp = Math.floor((Date.now() + TIMING.HUNTER) / 1000);
      await hunter.user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.DEATH)
            .setTitle('🏹 เลือกเป้าหมายของคุณ!')
            .setDescription(`คุณกำลังจะตาย... เลือกคนที่จะยิงไปด้วย!\nหมดเวลา <t:${endTimestamp}:R>`),
        ],
        components: [row],
      });
    } catch {
      await this.channel.send({
        embeds: [new EmbedBuilder().setColor(COLOR.DAY).setDescription('🏹 นักล่าไม่ได้เลือกเป้าหมาย')],
      });
      this.hunterPending = false;
      return;
    }
    return new Promise((resolve) => {
      this.hunterResolve = resolve;
      this.timer = setTimeout(() => {
        if (this.hunterPending) {
          this.hunterPending = false;
          this.channel.send({
            embeds: [new EmbedBuilder().setColor(COLOR.DAY).setDescription('🏹 นักล่าไม่ได้เลือกเป้าหมายทันเวลา')],
          });
          resolve();
        }
      }, TIMING.HUNTER);
    });
  }

  async handleHunterShoot(hunterId, targetId) {
    if (!this.hunterPending) return { success: false, msg: 'ไม่ใช่เวลายิง' };
    const hunter = this.players.get(hunterId);
    if (!hunter || hunter.role.id !== 'hunter') return { success: false, msg: 'คุณไม่ใช่นักล่า' };
    const target = this.players.get(targetId);
    if (!target || !target.alive) return { success: false, msg: 'เป้าหมายไม่ถูกต้อง' };
    target.alive = false;
    this.hunterPending = false;
    clearTimeout(this.timer);
    await this.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.DEATH)
          .setTitle('🏹💥 นักล่ายิง!')
          .setDescription(`**${hunter.displayName}** ยิง **${target.displayName}** ก่อนตาย!\nบทบาท: ${target.role.emoji} ${target.role.name}`),
      ],
    });
    if (this.hunterResolve) { this.hunterResolve(); this.hunterResolve = null; }
    return { success: true, msg: `ยิง ${target.displayName} แล้ว` };
  }

  checkWinCondition() {
    const livingWolves = this.getLivingByRole('werewolf').length;
    const livingVillagers = this.getLivingPlayers().length - livingWolves;
    if (livingWolves === 0) return 'villager';
    if (livingWolves >= livingVillagers) return 'werewolf';
    return null;
  }

  async endGame(winnerTeam) {
    this.phase = 'ended';
    clearTimeout(this.timer);
    const isWolfWin = winnerTeam === 'werewolf';
    const title = isWolfWin ? '🐺 หมาป่าชนะ!' : '🏘️ ชาวบ้านชนะ!';
    const desc = isWolfWin ? 'หมาป่าครองหมู่บ้านแล้ว... ไม่มีใครรอดชีวิต' : 'ชาวบ้านกำจัดหมาป่าได้สำเร็จ! หมู่บ้านปลอดภัยอีกครั้ง';
    const roleReveal = [...this.players.values()]
      .map((p) => `${p.alive ? '✅' : '💀'} **${p.displayName}** — ${p.role.emoji} ${p.role.name}`)
      .join('\n');
    await this.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(isWolfWin ? COLOR.WOLF_WIN : COLOR.VILLAGE_WIN)
          .setTitle(title)
          .setDescription(`${desc}\n\n**📋 เฉลยบทบาททั้งหมด:**\n${roleReveal}`)
          .setFooter({ text: `จบเกม • ${this.round} คืน • ใช้ /werewolf เพื่อเริ่มเกมใหม่` }),
      ],
    });
  }

  getLivingPlayers() {
    return [...this.players.values()].filter((p) => p.alive);
  }

  getLivingByRole(roleId) {
    return [...this.players.values()].filter((p) => p.alive && p.role?.id === roleId);
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  destroy() {
    clearTimeout(this.timer);
    this.phase = 'ended';
  }

  createLobbyEmbed() {
    const playerList =
      this.players.size > 0
        ? [...this.players.values()]
            .map((p, i) => `${i + 1}. ${p.displayName}${p.id === this.host.id ? ' 👑' : ''}`)
            .join('\n')
        : 'ยังไม่มีผู้เล่น';
    return new EmbedBuilder()
      .setColor(COLOR.LOBBY)
      .setTitle('🐺 เกมหมาป่า — รอผู้เล่น')
      .setDescription('กดปุ่มด้านล่างเพื่อเข้าร่วมเกม!')
      .addFields(
        { name: `👥 ผู้เล่น (${this.players.size}/16)`, value: playerList },
        { name: '📌 ข้อมูลเกม', value: `ผู้เล่นขั้นต่ำ: 4 คน | สูงสุด: 16 คน\nเจ้าของห้อง: ${this.host.globalName || this.host.username}` }
      )
      .setFooter({ text: 'เจ้าของห้องกด "เริ่มเกม" เมื่อพร้อม' });
  }

  createLobbyComponents() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ww:join:${this.id}`).setLabel('เข้าร่วม').setStyle(ButtonStyle.Success).setEmoji('✋'),
      new ButtonBuilder().setCustomId(`ww:leave:${this.id}`).setLabel('ออกจากเกม').setStyle(ButtonStyle.Secondary).setEmoji('🚪'),
      new ButtonBuilder().setCustomId(`ww:start:${this.id}`).setLabel('เริ่มเกม').setStyle(ButtonStyle.Primary).setEmoji('🎮')
    );
  }
}

module.exports = Game;
