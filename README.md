# Discord Games Bot (Vertical Slice)

บอท Discord เดียว รันหลายเกม: **Undercover**, **Werewolf**, **Avalon** (และเพิ่มเกมอื่นในอนาคตได้)

## โครงสร้างแบบ Vertical Slice

แต่ละเกมเป็น **slice** แยกใน `slices/<ชื่อเกม>/` มีคำสั่งและ logic ของตัวเอง ไม่แชร์ state กับเกมอื่น

```
discord-games-bot/
├── core/                 # ตัวกลางบอท
│   ├── index.js          # เริ่มบอท, ลงทะเบียนคำสั่งทุก slice, ส่ง interaction/message ไป slice
│   ├── config.js         # อ่าน .env
│   ├── load-slices.js    # โหลด slices จาก slices/*
│   └── deploy-commands.js # ใช้ลงทะเบียน slash commands (ต้องมี CLIENT_ID)
├── slices/
│   ├── undercover/       # เกม Undercover (/uc)
│   ├── werewolf/         # เกมหมาป่า (/werewolf)
│   └── avalon/           # เกม Avalon (/avalon) — ยังเป็น stub
├── package.json
├── .env.example
└── README.md
```

## การเตรียมตัว

1. ติดตั้ง Node.js 18+
2. ในโฟลเดอร์โปรเจกต์:

   ```bash
   npm install
   cp .env.example .env
   ```

3. แก้ `.env`:
   - `DISCORD_TOKEN` — Bot Token จาก [Discord Developer Portal](https://discord.com/developers/applications) → Application → Bot
   - เปิด Privileged Gateway Intents: **Message Content Intent**, **Server Members Intent** (และ Presence ถ้าต้องการ)

4. (ถ้าต้องการลงทะเบียนคำสั่งแยก) ใส่ `CLIENT_ID` ใน `.env` แล้วรัน:

   ```bash
   npm run deploy
   ```

   ถ้าไม่รัน deploy บอทจะลงทะเบียนคำสั่งเองตอน `npm start` (ใช้ `client.user.id`)

## การรันบอท

```bash
npm start
```

## คำสั่งรวม

| คำสั่ง | เกม |
|--------|------|
| `/uc` (create, join, start, word, vote, end, help) | Undercover |
| `/werewolf` | Werewolf (ปุ่มเข้าร่วม/เริ่มในห้อง) |
| `/avalon` (setup, join, start, …) | Avalon (ยังเป็น stub) |

## เพิ่มเกมใหม่ (slice ใหม่)

1. สร้างโฟลเดอร์ `slices/<ชื่อเกม>/` เช่น `slices/mygame/`
2. สร้าง `slices/mygame/index.js` ที่ export:
   - **name** (string): ชื่อ slice
   - **getCommands()**: return อาร์เรย์ของ `SlashCommandBuilder` (หรือ object ที่มี `.toJSON()`)
   - **handleInteraction(client, interaction)**: return `true` ถ้าเป็น interaction ของเกมนี้
   - **handleMessage(client, message)** (optional): return `true` ถ้าเป็น message ที่เกมนี้รับผิดชอบ
3. รีสตาร์ทบอท — core จะโหลด slice ใหม่อัตโนมัติ

ตัวอย่างโครงใน slice:

```js
const { SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder().setName('mygame').setDescription('เกมของฉัน'),
];

async function handleInteraction(client, interaction) {
  if (interaction.isChatInputCommand() && interaction.commandName === 'mygame') {
    // จัดการคำสั่ง /mygame
    return true;
  }
  return false;
}

module.exports = {
  name: 'mygame',
  getCommands: () => commands,
  handleInteraction,
};
```

## ที่มาโค้ดเกม

- Undercover: [undercover-discord-bot](https://github.com/Chareef17/undercover-discord-bot)
- Werewolf: [werewolf-discord-bot](https://github.com/Chareef17/werewolf-discord-bot)
- Avalon: [avalon-discord-bot](https://github.com/Chareef17/avalon-discord-bot) — เชื่อมเต็มแล้ว (CommonJS ใน slice) ดู `slices/avalon/README.md` สำหรับการซิงค์กับ repo เดิม
