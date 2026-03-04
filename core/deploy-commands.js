require('dotenv').config();
const { Client, REST, Routes } = require('discord.js');
const { loadSlices } = require('./load-slices');

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Need DISCORD_TOKEN in .env');
  process.exit(1);
}

const slices = loadSlices();
const allCommands = [];
for (const slice of slices) {
  const cmds = slice.getCommands();
  if (Array.isArray(cmds)) {
    const json = cmds.map((c) => (typeof c.toJSON === 'function' ? c.toJSON() : c));
    allCommands.push(...json);
  }
}

const rest = new REST({ version: '10' }).setToken(token);
const client = new Client({ intents: [] });

client.once('ready', async () => {
  try {
    const clientId = client.application.id;
    console.log(`Registering ${allCommands.length} command(s) from ${slices.length} slice(s)...`);
    await rest.put(Routes.applicationCommands(clientId), { body: allCommands });
    console.log('Done.');
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(token).catch((e) => {
  console.error(e);
  process.exit(1);
});
