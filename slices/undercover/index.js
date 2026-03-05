const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { UndercoverGame, ROLES } = require('./game/UndercoverGame');
const config = require('./config');
const commands = require('./commands');

const activeGames = new Map();

function getGame(channelId) {
  return activeGames.get(channelId);
}

function playAgainRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('uc_join').setLabel('Join').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('uc_start').setLabel('Start').setStyle(ButtonStyle.Primary),
  );
}

/** Returns valid start config choices. Civil > Under + White. */
function getValidStartChoices(n) {
  if (n === 3 || n === 4) return [];
  const choices = [];
  const maxNonCivil = Math.floor((n - 1) / 2);
  for (let u = 1; u <= Math.min(3, maxNonCivil); u++) {
    choices.push({ undercoverCount: u, mrWhite: false, label: `${u} Undercover` });
  }
  if (n >= 5) {
    for (let u = 1; u <= Math.min(3, maxNonCivil - 1); u++) {
      choices.push({ undercoverCount: u, mrWhite: true, label: `${u} Undercover + Mr. White` });
    }
  }
  return choices;
}

function getDisplayName(game, userId) {
  return game.displayNames?.get(userId) || game.players.get(userId)?.username || 'Unknown';
}

async function ensureDisplayNames(game, guild) {
  if (!guild) return;
  for (const [userId] of game.players) {
    if (!game.displayNames.has(userId)) {
      try {
        const member = await guild.members.fetch(userId);
        game.displayNames.set(userId, member.displayName || member.user.username);
      } catch {
        game.displayNames.set(userId, game.players.get(userId).username);
      }
    }
  }
}

async function doStartGame(client, interaction, game, options) {
  const result = game.start(options);
  if (!result.success) {
    return interaction.editReply ? interaction.editReply({ content: result.message }) : interaction.reply({ content: result.message, ephemeral: true });
  }

  const guild = interaction.guild;
  if (guild) {
    for (const [userId] of game.players) {
      try {
        const member = await guild.members.fetch(userId);
        game.displayNames.set(userId, member.displayName || member.user.username);
      } catch {
        game.displayNames.set(userId, game.players.get(userId).username);
      }
    }
  }

  const orderList = game.getDescribeOrderWithNames();
  const orderText = orderList.map(({ num, name }) => `${num}. ${name}`).join('\n');
  const nextPlayer = game.getNextToDescribe();
  const nextName = nextPlayer ? getDisplayName(game, nextPlayer.id) : '-';

  const embed = new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle('🎭 Game started!')
    .setDescription(`Everyone will receive their word via **DM**!\n\nType your **one-word hint** in chat (case insensitive)`)
    .addFields(
      { name: 'Players', value: String(game.getPlayerCount()), inline: true },
      { name: 'Undercover', value: String(result.undercoverCount), inline: true },
      { name: 'Mr. White', value: result.hasMrWhite ? 'Yes' : 'No', inline: true },
      { name: 'Order', value: orderText, inline: false },
      { name: 'Your turn', value: `**${nextName}** — give your hint`, inline: false }
    )
    .setFooter({ text: 'When everyone has described, press Vote' });

  for (const [userId, player] of game.players) {
    try {
      const u = await client.users.fetch(userId);
      const msg = player.role === ROLES.MR_WHITE ? 'You have no word — pretend you know it' : `Your word: **${player.word}**`;
      await u.send(msg);
    } catch (e) {
      console.error('DM failed:', userId, e.message);
    }
  }

  const payload = { embeds: [embed], components: [] };
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
  } else if (interaction.isStringSelectMenu() || interaction.isButton()) {
    await interaction.update(payload);
  } else {
    await interaction.editReply(payload);
  }
}

// --- Slash command handler ---

async function runCommand(client, interaction) {
  const sub = interaction.options.getSubcommand();
  const channelId = interaction.channel.id;
  const user = interaction.user;

  if (sub === 'help') {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎭 Undercover - How to Play')
      .setDescription(`
**Rules:**
- Most players get the **same word** (Civilian)
- 1 player gets a **similar word** (Undercover)
- With 5+ players, there may be **Mr. White** — no word, separate faction; wins when voted out & guess word correctly

**Commands:** Type \`/uc\` and select
\`\`\`
/uc create - Create room (Host)
/uc join   - Join game
/uc leave  - Leave room
/uc start  - Start game — choose Undercover count & Mr. White
/uc word   - View your word
/uc vote   - Start voting
/uc end    - End game (Host)
/uc help   - Show this help
\`\`\`

**How to play:**
1. Everyone gives a **one-word hint** about their word (type in chat)
2. Use \`/uc vote\` when everyone has described
3. Vote for who you think is the Undercover
4. Player with most votes is eliminated
5. Civil wins when all Under out | Under wins when Under ≥ Civil | Mr. White wins when voted out & guess correct

**/uc start — options:**
- \`undercover\`: 1, 2 or 3
- \`mr_white\`: **Yes** = include Mr. White | **No** = exclude
      `)
      .setFooter({ text: `Minimum ${config.minPlayers} players required` });
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return true;
  }

  if (sub === 'create') {
    if (activeGames.has(channelId)) {
      await interaction.reply({ content: '⚠️ A game is already in progress', ephemeral: true });
      return true;
    }
    const game = new UndercoverGame(user.id, channelId, config);
    game.addPlayer(user.id, user.username);
    activeGames.set(channelId, game);

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🎮 Game room created!')
      .setDescription(`${user} created the room`)
      .addFields({ name: 'Players', value: `1/${config.maxPlayers}`, inline: true })
      .setFooter({ text: `Need at least ${config.minPlayers} players` });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('uc_join').setLabel('Join').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('uc_start').setLabel('Start').setStyle(ButtonStyle.Primary),
    );
    await interaction.reply({ embeds: [embed], components: [row] });
    return true;
  }

  if (sub === 'join') {
    const game = getGame(channelId);
    if (!game) { await interaction.reply({ content: '⚠️ No game here. Use `/uc create` first', ephemeral: true }); return true; }
    if (game.phase !== 'waiting') { await interaction.reply({ content: '⚠️ Game has already started', ephemeral: true }); return true; }

    const added = game.addPlayer(user.id, user.username);
    if (!added) { await interaction.reply({ content: '⚠️ You are already in or the room is full', ephemeral: true }); return true; }

    const count = game.getPlayerCount();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('uc_join').setLabel('Join').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('uc_start').setLabel('Start').setStyle(ButtonStyle.Primary),
    );
    await interaction.reply({ content: `✅ ${user} joined! (${count}/${config.maxPlayers})`, components: [row] });
    return true;
  }

  if (sub === 'leave') {
    const game = getGame(channelId);
    if (!game) { await interaction.reply({ content: '⚠️ No game', ephemeral: true }); return true; }
    if (game.phase !== 'waiting') { await interaction.reply({ content: '⚠️ Game started, cannot leave', ephemeral: true }); return true; }

    game.removePlayer(user.id);
    const count = game.getPlayerCount();
    if (count === 0) {
      activeGames.delete(channelId);
      await interaction.reply('Room closed.');
    } else {
      await interaction.reply(`✅ Left. (${count} players remaining)`);
    }
    return true;
  }

  if (sub === 'start') {
    const game = getGame(channelId);
    if (!game) { await interaction.reply({ content: '⚠️ No game', ephemeral: true }); return true; }
    if (game.hostId !== user.id) { await interaction.reply({ content: '⚠️ Host only', ephemeral: true }); return true; }

    const n = game.getPlayerCount();
    const choices = getValidStartChoices(n);

    await interaction.deferReply();

    if (choices.length === 0) {
      await doStartGame(client, interaction, game, { undercoverCount: 1, mrWhite: false });
      return true;
    }

    const options = choices.map((c) => ({
      label: c.label,
      value: `${c.undercoverCount}-${c.mrWhite ? '1' : '0'}`,
    }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('uc_start_config')
        .setPlaceholder('เลือกการตั้งค่าเกม')
        .addOptions(options)
    );

    await interaction.editReply({
      content: `**${n} คน** — เลือกการตั้งค่า:`,
      components: [row],
    });
    return true;
  }

  if (sub === 'word') {
    const game = getGame(channelId);
    if (!game) { await interaction.reply({ content: '⚠️ No game', ephemeral: true }); return true; }
    const player = game.players.get(user.id);
    if (!player) { await interaction.reply({ content: '⚠️ You are not in the game', ephemeral: true }); return true; }

    try {
      const u = await client.users.fetch(user.id);
      const msg = player.role === ROLES.MR_WHITE
        ? 'You have no word — pretend you know it'
        : `Your word: **${player.word}**`;
      await u.send(msg);
      await interaction.reply({ content: '✅ Sent your word via DM', ephemeral: true });
    } catch (e) {
      await interaction.reply({ content: '⚠️ Cannot DM you. Enable DMs from server members', ephemeral: true });
    }
    return true;
  }

  if (sub === 'vote') {
    const game = getGame(channelId);
    if (!game) { await interaction.reply({ content: '⚠️ No game', ephemeral: true }); return true; }
    if (game.hostId !== user.id) { await interaction.reply({ content: '⚠️ Host only', ephemeral: true }); return true; }
    if (game.phase !== 'describing') { await interaction.reply({ content: '⚠️ Not voting phase yet', ephemeral: true }); return true; }

    await ensureDisplayNames(game, interaction.guild);
    game.startVoting();
    const alive = game.getAlivePlayers();
    const options = alive.slice(0, 25).map(p => {
      const name = getDisplayName(game, p.id);
      return { label: name, value: p.id, description: `Vote for ${name}` };
    });

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('undercover_vote')
        .setPlaceholder('Select who you think is the Undercover')
        .addOptions(options)
    );

    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🗳️ Voting time!')
      .setDescription('Select who you think is the Undercover');

    await interaction.reply({ embeds: [embed], components: [row] });
    return true;
  }

  if (sub === 'end') {
    const game = getGame(channelId);
    if (!game) { await interaction.reply({ content: '⚠️ No game', ephemeral: true }); return true; }
    if (game.hostId !== user.id) { await interaction.reply({ content: '⚠️ Host only', ephemeral: true }); return true; }

    activeGames.delete(channelId);
    await interaction.reply('✅ Game ended.');
    return true;
  }

  return false;
}

// --- Interaction handler (slash + buttons + selects + modals) ---

async function handleInteraction(client, interaction) {
  if (interaction.isChatInputCommand() && interaction.commandName === 'uc') {
    return runCommand(client, interaction);
  }

  // Button: Join
  if (interaction.isButton() && interaction.customId === 'uc_join') {
    const game = getGame(interaction.channel.id);
    if (!game) { await interaction.reply({ content: '⚠️ No game here. Use `/uc create` first', ephemeral: true }); return true; }
    if (game.phase !== 'waiting') { await interaction.reply({ content: '⚠️ Game has already started', ephemeral: true }); return true; }

    const user = interaction.user;
    const added = game.addPlayer(user.id, user.username);
    if (!added) { await interaction.reply({ content: '⚠️ You are already in or the room is full', ephemeral: true }); return true; }

    const count = game.getPlayerCount();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('uc_join').setLabel('Join').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('uc_start').setLabel('Start').setStyle(ButtonStyle.Primary),
    );
    await interaction.reply({ content: `✅ ${user} joined! (${count}/${config.maxPlayers})`, components: [row] });
    return true;
  }

  // Button: Start
  if (interaction.isButton() && interaction.customId === 'uc_start') {
    const game = getGame(interaction.channel.id);
    if (!game) { await interaction.reply({ content: '⚠️ No game', ephemeral: true }); return true; }
    if (game.phase !== 'waiting') { await interaction.reply({ content: '⚠️ Game has already started', ephemeral: true }); return true; }
    if (game.hostId !== interaction.user.id) { await interaction.reply({ content: '⚠️ Host only', ephemeral: true }); return true; }

    const n = game.getPlayerCount();
    const choices = getValidStartChoices(n);

    await interaction.deferReply();

    if (choices.length === 0) {
      await doStartGame(client, interaction, game, { undercoverCount: 1, mrWhite: false });
      return true;
    }

    const options = choices.map((c) => ({
      label: c.label,
      value: `${c.undercoverCount}-${c.mrWhite ? '1' : '0'}`,
    }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('uc_start_config')
        .setPlaceholder('เลือกการตั้งค่าเกม')
        .addOptions(options)
    );

    await interaction.editReply({
      content: `**${n} คน** — เลือกการตั้งค่า:`,
      components: [row],
    });
    return true;
  }

  // Button: Vote
  if (interaction.isButton() && interaction.customId === 'uc_vote') {
    const game = getGame(interaction.channel.id);
    if (!game) { await interaction.reply({ content: '⚠️ No game', ephemeral: true }); return true; }
    if (game.hostId !== interaction.user.id) { await interaction.reply({ content: '⚠️ Host only', ephemeral: true }); return true; }
    if (game.phase !== 'describing') { await interaction.reply({ content: '⚠️ Not voting phase yet', ephemeral: true }); return true; }

    await ensureDisplayNames(game, interaction.guild);
    game.startVoting();
    const alive = game.getAlivePlayers();
    const voteOptions = alive.slice(0, 25).map(p => {
      const name = getDisplayName(game, p.id);
      return { label: name, value: p.id, description: `Vote for ${name}` };
    });

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('undercover_vote')
        .setPlaceholder('Select who you think is the Undercover')
        .addOptions(voteOptions)
    );

    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🗳️ Voting time!')
      .setDescription('Select who you think is the Undercover');

    await interaction.reply({ embeds: [embed], components: [row] });
    return true;
  }

  // Select: start config
  if (interaction.isStringSelectMenu() && interaction.customId === 'uc_start_config') {
    const game = getGame(interaction.channel.id);
    if (!game || game.phase !== 'waiting') {
      await interaction.reply({ content: '⚠️ Cannot start now', ephemeral: true });
      return true;
    }
    if (game.hostId !== interaction.user.id) {
      await interaction.reply({ content: '⚠️ Host only', ephemeral: true });
      return true;
    }
    const [u, w] = interaction.values[0].split('-').map(Number);
    await interaction.deferUpdate();
    await doStartGame(client, interaction, game, { undercoverCount: u, mrWhite: w === 1 });
    return true;
  }

  // Select: vote
  if (interaction.isStringSelectMenu() && interaction.customId === 'undercover_vote') {
    const game = getGame(interaction.channel.id);
    if (!game || game.phase !== 'voting') {
      await interaction.reply({ content: '⚠️ Cannot vote now', ephemeral: true });
      return true;
    }
    await ensureDisplayNames(game, interaction.guild);

    const targetId = interaction.values[0];
    const ok = game.vote(interaction.user.id, targetId);
    if (!ok) {
      await interaction.reply({ content: '⚠️ Cannot vote', ephemeral: true });
      return true;
    }

    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply({ content: '✅ Vote recorded' });

    if (!game.allVoted()) return true;

    const counts = game.getVoteCounts();
    let maxVotes = 0;
    const topIds = [];
    for (const [id, count] of counts) {
      if (count > maxVotes) {
        maxVotes = count;
        topIds.length = 0;
        topIds.push(id);
      } else if (count === maxVotes) {
        topIds.push(id);
      }
    }

    // Tie
    if (topIds.length > 1) {
      const tieEmbed = new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('🗳️ Vote result — Tie!')
        .setDescription(`No one eliminated (${maxVotes} votes each)`);
      game.resetRound();
      const orderList = game.getDescribeOrderWithNames();
      const orderText = orderList.map(({ num, name }) => `${num}. ${name}`).join('\n');
      const nextPlayer = game.getNextToDescribe();
      const nextName = nextPlayer ? getDisplayName(game, nextPlayer.id) : '-';
      const nextEmbed = new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('Next round')
        .addFields(
          { name: 'Order', value: orderText, inline: false },
          { name: 'Your turn', value: `**${nextName}** — give your hint`, inline: false }
        )
        .setFooter({ text: 'When everyone has described, press Vote' });
      await interaction.channel.send({ embeds: [tieEmbed, nextEmbed] });
      return true;
    }

    const eliminatedId = topIds[0];
    const eliminated = game.players.get(eliminatedId);
    game.eliminatePlayer(eliminatedId);

    let roleText = '';
    if (eliminated.role === ROLES.UNDERCOVER) roleText = '🔴 Undercover';
    else if (eliminated.role === ROLES.MR_WHITE) roleText = '🃏 Mr. White';
    else roleText = '🟢 Civilian';

    // Mr. White guess
    if (eliminated.role === ROLES.MR_WHITE) {
      const voteEmbed = new EmbedBuilder()
        .setColor(0x99AAB5)
        .setTitle('🗳️ Vote result')
        .setDescription(`${getDisplayName(game, eliminatedId)} (${roleText}) — ${maxVotes} votes`);
      game.pendingMrWhiteGuess = eliminatedId;
      const guessEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🃏 Guess the word')
        .setDescription('Click the button below — correct guess = **Mr. White wins!**');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`mrwhite_guess_${interaction.channel.id}`)
          .setLabel('Guess word')
          .setStyle(ButtonStyle.Primary)
      );
      await interaction.channel.send({ embeds: [voteEmbed, guessEmbed], components: [row] });
      return true;
    }

    const check = game.checkGameEnd();

    const voteEmbed = new EmbedBuilder()
      .setColor(0x99AAB5)
      .setTitle('🗳️ Vote result')
      .setDescription(`${getDisplayName(game, eliminatedId)} (${roleText}) — ${maxVotes} votes`);

    if (check.civiliansWin) {
      const resultEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('🏆 Civilians win!')
        .setDescription(`Civilian: **${game.wordPair[0]}** · Undercover: **${game.wordPair[1]}**`)
        .setFooter({ text: 'Press Start to play again' });
      game.resetToWaiting();
      await interaction.channel.send({ embeds: [voteEmbed, resultEmbed], components: [playAgainRow()] });
    } else if (check.undercoverWin) {
      const resultEmbed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('🏆 Undercover wins!')
        .setDescription(`Civilian: **${game.wordPair[0]}** · Undercover: **${game.wordPair[1]}**`)
        .setFooter({ text: 'Press Start to play again' });
      game.resetToWaiting();
      await interaction.channel.send({ embeds: [voteEmbed, resultEmbed], components: [playAgainRow()] });
    } else {
      game.resetRound();
      const orderList = game.getDescribeOrderWithNames();
      const orderText = orderList.map(({ num, name }) => `${num}. ${name}`).join('\n');
      const nextPlayer = game.getNextToDescribe();
      const nextName = nextPlayer ? getDisplayName(game, nextPlayer.id) : '-';
      const nextEmbed = new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('Next round')
        .addFields(
          { name: 'Order', value: orderText, inline: false },
          { name: 'Your turn', value: `**${nextName}** — give your hint`, inline: false }
        )
        .setFooter({ text: 'When everyone has described, press Vote' });
      await interaction.channel.send({ embeds: [voteEmbed, nextEmbed] });
    }
    return true;
  }

  // Button: Mr. White guess
  if (interaction.isButton() && interaction.customId.startsWith('mrwhite_guess_')) {
    const channelId = interaction.customId.replace('mrwhite_guess_', '');
    const game = getGame(channelId);
    if (!game || !game.pendingMrWhiteGuess) {
      await interaction.reply({ content: '⚠️ Cannot do this', ephemeral: true });
      return true;
    }
    if (interaction.user.id !== game.pendingMrWhiteGuess) {
      await interaction.reply({ content: '⚠️ Only the voted-out Mr. White can guess', ephemeral: true });
      return true;
    }
    const modal = new ModalBuilder()
      .setCustomId(`mrwhite_modal_${channelId}`)
      .setTitle('Guess the Civilian word');
    const input = new TextInputBuilder()
      .setCustomId('guess')
      .setLabel('Type the word you think Civilians have')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('One word')
      .setMaxLength(50)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
    return true;
  }

  // Modal: Mr. White guess result
  if (interaction.isModalSubmit() && interaction.customId.startsWith('mrwhite_modal_')) {
    const channelId = interaction.customId.replace('mrwhite_modal_', '');
    const game = getGame(channelId);
    if (!game || !game.pendingMrWhiteGuess) {
      await interaction.reply({ content: '⚠️ Guess time expired', ephemeral: true });
      return true;
    }
    await ensureDisplayNames(game, interaction.guild);
    const guess = interaction.fields.getTextInputValue('guess');
    delete game.pendingMrWhiteGuess;

    if (game.checkMrWhiteGuess(guess)) {
      const resultEmbed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('🏆 Mr. White wins!')
        .setDescription(`Correctly guessed **${game.wordPair[0]}**!\n\nCivilian: **${game.wordPair[0]}** · Undercover: **${game.wordPair[1]}**`)
        .setFooter({ text: 'Press Start to play again' });
      game.resetToWaiting();
      await interaction.reply({ embeds: [resultEmbed], components: [playAgainRow()] });
      return true;
    }

    const wrongEmbed = new EmbedBuilder()
      .setColor(0x99AAB5)
      .setTitle('❌ Wrong guess')
      .setDescription(`Guessed: **${guess}** · Correct: **${game.wordPair[0]}**`);

    const check = game.checkGameEnd();
    if (check.civiliansWin) {
      const resultEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('🏆 Civilians win!')
        .setDescription(`Civilian: **${game.wordPair[0]}** · Undercover: **${game.wordPair[1]}**`)
        .setFooter({ text: 'Press Start to play again' });
      game.resetToWaiting();
      await interaction.reply({ embeds: [wrongEmbed, resultEmbed], components: [playAgainRow()] });
    } else if (check.undercoverWin) {
      const resultEmbed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('🏆 Undercover wins!')
        .setDescription(`Civilian: **${game.wordPair[0]}** · Undercover: **${game.wordPair[1]}**`)
        .setFooter({ text: 'Press Start to play again' });
      game.resetToWaiting();
      await interaction.reply({ embeds: [wrongEmbed, resultEmbed], components: [playAgainRow()] });
    } else {
      game.resetRound();
      const orderList = game.getDescribeOrderWithNames();
      const orderText = orderList.map(({ num, name }) => `${num}. ${name}`).join('\n');
      const nextPlayer = game.getNextToDescribe();
      const nextName = nextPlayer ? getDisplayName(game, nextPlayer.id) : '-';
      const nextEmbed = new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('Next round')
        .addFields(
          { name: 'Order', value: orderText, inline: false },
          { name: 'Your turn', value: `**${nextName}** — give your hint`, inline: false }
        )
        .setFooter({ text: 'When everyone has described, press Vote' });
      await interaction.reply({ embeds: [wrongEmbed, nextEmbed] });
    }
    return true;
  }

  return false;
}

// --- Message handler (descriptions in chat) ---

async function handleMessage(client, message) {
  const game = getGame(message.channel.id);
  if (!game || game.phase !== 'describing') return false;

  const player = game.players.get(message.author.id);
  if (!player || player.eliminated) return false;

  if (message.content.startsWith('/')) return false;

  const desc = message.content.trim().slice(0, 50);
  if (!desc) return false;

  const ok = game.submitDescription(message.author.id, desc);
  if (!ok) return false;

  const count = game.descriptions.size;
  const total = game.getAlivePlayers().length;

  if (count >= total) {
    const voteRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('uc_vote').setLabel('Vote').setStyle(ButtonStyle.Danger),
    );
    await message.reply({ content: `✅ Everyone has described!`, components: [voteRow] });
  } else {
    await ensureDisplayNames(game, message.guild);
    const nextPlayer = game.getNextToDescribe();
    const nextName = nextPlayer ? getDisplayName(game, nextPlayer.id) : '-';
    await message.reply(`📝 Recorded (${count}/${total})\n\n**${nextName}** — your turn to give a hint`);
  }
  return true;
}

module.exports = {
  name: 'undercover',
  getCommands: () => commands,
  handleInteraction,
  handleMessage,
};
