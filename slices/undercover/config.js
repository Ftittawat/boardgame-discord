require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN || '',
  minPlayers: 3,
  maxPlayers: 20,
  votingTime: 30,
  describeTime: 45,
};
