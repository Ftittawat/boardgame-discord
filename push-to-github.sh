#!/bin/bash
# Commit และ push ขึ้น https://github.com/Chareef17/boardgame-discord
# รันในโฟลเดอร์ discord-games-bot: ./push-to-github.sh

set -e
cd "$(dirname "$0")"

if [ ! -d .git ]; then
  git init
  git remote add origin https://github.com/Chareef17/boardgame-discord.git
elif ! git remote get-url origin 2>/dev/null; then
  git remote add origin https://github.com/Chareef17/boardgame-discord.git
fi

git add -A
git status

if git diff --cached --quiet 2>/dev/null && [ -n "$(git rev-parse --verify HEAD 2>/dev/null)" ]; then
  echo "ไม่มีไฟล์เปลี่ยน — ข้าม commit"
else
  git commit -m "feat: บอทรวม Undercover, Werewolf, Avalon (vertical slice)"
fi

git branch -M main
git push -u origin main

echo "Done. Repo: https://github.com/Chareef17/boardgame-discord"
