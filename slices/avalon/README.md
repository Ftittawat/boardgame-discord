# Slice: Avalon

เกม The Resistance: Avalon — ทำงานเต็มในบอทรวม (เหมือน Undercover / Werewolf)

## โครงสร้าง

- `game/roles.js` — บทบาทและสุ่มบทบาท
- `game/AvalonGameManager.js` — AvalonGame + AvalonGameManager
- `commands/avalonCommands.js` — คำสั่ง /avalon และ execute
- `index.js` — slice entry (getCommands, handleInteraction)

## ซิงค์กับ repo avalon เดิม

โค้ดในโฟลเดอร์นี้เป็น CommonJS เวอร์ชันเดียวกับที่ใช้ใน [avalon-discord-bot](https://github.com/Chareef17/avalon-discord-bot). ถ้าต้องการอัปเดต repo นั้นให้รองรับทั้งรันเดี่ยวและใช้เป็น slice:

1. โคลน repo: `git clone https://github.com/Chareef17/avalon-discord-bot.git`
2. ใน repo ที่โคลนมา:
   - ลบ `"type": "module"` จาก `package.json` (ถ้ามี)
   - แทนที่ `src/game/roles.js` และ `src/game/AvalonGameManager.js` ด้วยเนื้อจาก `slices/avalon/game/` (แก้ path ใน AvalonGameManager ให้ require จาก `./roles.js`)
   - แทนที่ `src/commands/avalonCommands.js` ด้วย `slices/avalon/commands/avalonCommands.js`
   - อัปเดต `src/bot.js` ให้ใช้ `require()` แทน `import` และใช้ `createAvalonCommands()` จาก commands, `AvalonGameManager` จาก game
   - เพิ่ม `src/slice.js` ที่ export `{ name, getCommands, handleInteraction }` เหมือน `slices/avalon/index.js` (path ใช้ `./game/`, `./commands/`)
3. Commit และ push ขึ้น GitHub
