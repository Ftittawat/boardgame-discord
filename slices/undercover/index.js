const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { UndercoverGame, ROLES } = require('./game/UndercoverGame');
const config = require('./config');
const commands = require('./commands');

const activeGames = new Map();

function getGame(channelId) {
  return activeGames.get(channelId);
}

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
- With 5+ players, there may be **Mr. White** with no word

**Commands:** Type \`/uc\` and select
\`\`\`
/uc create   - Create room (Host)
/uc join     - Join game
/uc leave    - Leave room
/uc start    - Start game (Host)
/uc word     - View your word
/uc vote     - Start voting (Host)
/uc end      - End game (Host)
/uc help     - Show this help
\`\`\`

**How to play:**
1. Everyone gives a **one-word hint** about their word
2. Host uses \`/uc vote\` when everyone has described
3. Vote for who you think is the Undercover
4. Player with most votes is eliminated
5. Civilians win by eliminating all Undercover
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
      .setDescription(`${user} is the Host\n\nUse \`/uc join\` to join`)
      .addFields({ name: 'Players', value: `1/${config.maxPlayers}`, inline: true })
      .addFields({ name: 'Start game', value: '`/uc start` (Host)', inline: true })
      .setFooter({ text: `Need at least ${config.minPlayers} players` });
    await interaction.reply({ embeds: [embed] });
    return true;
  }

  if (sub === 'join') {
    const game = getGame(channelId);
    if (!game) {
      await interaction.reply({ content: '⚠️ No game here. Use `/uc create` first', ephemeral: true });
      return true;
    }
    if (game.phase !== 'waiting') {
      await interaction.reply({ content: '⚠️ Game has already started', ephemeral: true });
      return true;
    }
    const added = game.addPlayer(user.id, user.username);
    if (!added) {
      await interaction.reply({ content: '⚠️ You are already in or the room is full', ephemeral: true });
      return true;
    }
    const count = game.getPlayerCount();
    await interaction.reply(`✅ ${user} joined! (${count}/${config.maxPlayers})`);
    return true;
  }

  if (sub === 'leave') {
    const game = getGame(channelId);
    if (!game) {
      await interaction.reply({ content: '⚠️ No game', ephemeral: true });
      return true;
    }
    if (game.phase !== 'waiting') {
      await interaction.reply({ content: '⚠️ Game started, cannot leave', ephemeral: true });
      return true;
    }
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
    if (!game) {
      await interaction.reply({ content: '⚠️ No game', ephemeral: true });
      return true;
    }
    if (game.hostId !== user.id) {
      await interaction.reply({ content: '⚠️ Host only', ephemeral: true });
      return true;
    }
    const result = game.start();
    if (!result.success) {
      await interaction.reply({ content: result.message, ephemeral: true });
      return true;
    }

    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle('🎭 Game started!')
      .setDescription(`Everyone will receive their word via **DM**!\n\nGive a **one-word hint** about your word (type in chat)`)
      .addFields(
        { name: 'Players', value: String(game.getPlayerCount()), inline: true },
        { name: 'Mr. White', value: result.hasMrWhite ? 'Yes' : 'No', inline: true }
      )
      .setFooter({ text: 'Host uses /uc vote when everyone has described' });

    for (const [userId, player] of game.players) {
      try {
        const u = await client.users.fetch(userId);
        let msg = '';
        if (player.role === ROLES.MR_WHITE) {
          msg = '🃏 You are **Mr. White**!\nYou have no word — pretend you know it';
        } else if (player.role === ROLES.UNDERCOVER) {
          msg = `🔴 Your word: **${player.word}**\n(You are the Undercover!)`;
        } else {
          msg = `🟢 Your word: **${player.word}**`;
        }
        await u.send(msg);
      } catch (e) {
        console.error('Undercover DM failed:', userId, e.message);
      }
    }

    await interaction.reply({ embeds: [embed] });
    return true;
  }

  if (sub === 'word') {
    const game = getGame(channelId);
    if (!game) {
      await interaction.reply({ content: '⚠️ No game', ephemeral: true });
      return true;
    }
    const player = game.players.get(user.id);
    if (!player) {
      await interaction.reply({ content: '⚠️ You are not in the game', ephemeral: true });
      return true;
    }
    try {
      const u = await client.users.fetch(user.id);
      const msg = player.role === ROLES.MR_WHITE
        ? '🃏 You are **Mr. White** — you have no word'
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
    if (!game) {
      await interaction.reply({ content: '⚠️ No game', ephemeral: true });
      return true;
    }
    if (game.hostId !== user.id) {
      await interaction.reply({ content: '⚠️ Host only', ephemeral: true });
      return true;
    }
    if (game.phase !== 'describing') {
      await interaction.reply({ content: '⚠️ Not voting phase yet', ephemeral: true });
      return true;
    }
    game.startVoting();
    const alive = game.getAlivePlayers();
    const options = alive.slice(0, 25).map(p => ({
      label: p.username,
      value: p.id,
      description: `Vote for ${p.username}`,
    }));

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
    if (!game) {
      await interaction.reply({ content: '⚠️ No game', ephemeral: true });
      return true;
    }
    if (game.hostId !== user.id) {
      await interaction.reply({ content: '⚠️ Host only', ephemeral: true });
      return true;
    }
    activeGames.delete(channelId);
    await interaction.reply('✅ Game ended.');
    return true;
  }

  return false;
}

async function handleInteraction(client, interaction) {
  if (interaction.isChatInputCommand() && interaction.commandName === 'uc') {
    return runCommand(client, interaction);
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'undercover_vote') {
    const game = getGame(interaction.channel.id);
    if (!game || game.phase !== 'voting') {
      await interaction.reply({ content: '⚠️ Cannot vote now', ephemeral: true });
      return true;
    }
    const targetId = interaction.values[0];
    const ok = game.vote(interaction.user.id, targetId);
    if (!ok) {
      await interaction.reply({ content: '⚠️ Cannot vote', ephemeral: true });
      return true;
    }
    await interaction.reply({ content: '✅ Vote recorded', ephemeral: true });

    if (!game.allVoted()) return true;

    const counts = game.getVoteCounts();
    let maxVotes = 0;
    let eliminatedId = null;
    for (const [id, count] of counts) {
      if (count > maxVotes) {
        maxVotes = count;
        eliminatedId = id;
      }
    }

    const eliminated = game.players.get(eliminatedId);
    game.eliminatePlayer(eliminatedId);

    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🗳️ Vote result')
      .setDescription(`${eliminated.username} was eliminated (${maxVotes} votes)`);

    let roleText = '';
    if (eliminated.role === ROLES.UNDERCOVER) roleText = '🔴 **Undercover**';
    else if (eliminated.role === ROLES.MR_WHITE) roleText = '🃏 **Mr. White**';
    else roleText = '🟢 **Civilian**';
    embed.addFields({ name: 'Role', value: roleText, inline: false });

    const check = game.checkGameEnd();

    if (check.civiliansWin) {
      embed.addFields({ name: '🏆 Result', value: '**Civilians win!**', inline: false });
      game.endGame();
      activeGames.delete(interaction.channel.id);
    } else if (check.undercoverWin) {
      embed.addFields({ name: '🏆 Result', value: '**Undercover wins!**', inline: false });
      embed.addFields(
        { name: 'Civilian word', value: game.wordPair[0], inline: true },
        { name: 'Undercover word', value: game.wordPair[1], inline: true }
      );
      game.endGame();
      activeGames.delete(interaction.channel.id);
    } else {
      embed.setFooter({ text: 'Next round — give your one-word hint' });
      game.resetRound();
    }

    await interaction.channel.send({ embeds: [embed] });
    return true;
  }

  return false;
}

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
    await message.reply(`✅ Everyone has described! Host use \`/uc vote\``);
  } else {
    await message.reply(`📝 Recorded (${count}/${total})`);
  }
  return true;
}

module.exports = {
  name: 'undercover',
  getCommands: () => commands,
  handleInteraction,
  handleMessage,
};
