require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN || '',
  clientId: process.env.CLIENT_ID || '', // optional: ไม่ใช้ใน deploy (ดึงจาก client.application.id อัตโนมัติ)
};
