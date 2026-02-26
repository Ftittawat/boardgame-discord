const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const { loadSlices } = require('./load-slices');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
  ],
});

const slices = loadSlices();

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const { REST, Routes } = require('discord.js');
  const allCommands = [];
  for (const slice of slices) {
    const cmds = slice.getCommands();
    if (Array.isArray(cmds)) {
      const json = cmds.map((c) => (typeof c.toJSON === 'function' ? c.toJSON() : c));
      allCommands.push(...json);
    }
  }

  const rest = new REST({ version: '10' }).setToken(config.token);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: allCommands });
    console.log(`Registered ${allCommands.length} command(s) from ${slices.length} slice(s): ${slices.map((s) => s.name).join(', ')}`);
  } catch (err) {
    console.error('Command registration failed:', err);
  }

  const activities = slices.map((s) => `/${s.name === 'undercover' ? 'uc' : s.name}`).join(', ');
  client.user.setActivity(activities, { type: 3 });
});

client.on('interactionCreate', async (interaction) => {
  for (const slice of slices) {
    try {
      const handled = await slice.handleInteraction(client, interaction);
      if (handled) return;
    } catch (err) {
      console.error(`[slice ${slice.name}]`, err);
      try {
        const msg = { content: '❌ เกิดข้อผิดพลาด', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg).catch(() => {});
        } else {
          await interaction.reply(msg).catch(() => {});
        }
      } catch {
        // ignore
      }
      return;
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  for (const slice of slices) {
    if (typeof slice.handleMessage !== 'function') continue;
    try {
      const handled = await slice.handleMessage(client, message);
      if (handled) return;
    } catch (err) {
      console.error(`[slice ${slice.name}] message:`, err);
    }
  }
});

client.login(config.token).catch((err) => {
  console.error('Login failed:', err.message);
  console.log('Set DISCORD_TOKEN in .env');
  process.exit(1);
});
