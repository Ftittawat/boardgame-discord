// ระบบบทบาท Avalon (Merlin, Assassin, Percival, Morgana, Mordred, Oberon, Servant)
// เน้นโหมดอัตโนมัติเชิง "มาตรฐาน" ตามจำนวนผู้เล่น 5–10 คน

const ROLE_DATA = {
  MERLIN: { key: 'MERLIN', name: 'Merlin', side: 'good' },
  PERCIVAL: { key: 'PERCIVAL', name: 'Percival', side: 'good' },
  SERVANT: { key: 'SERVANT', name: 'ข้ารับใช้ของ Arthur', side: 'good' },
  ASSASSIN: { key: 'ASSASSIN', name: 'Assassin', side: 'evil' },
  MORGANA: { key: 'MORGANA', name: 'Morgana', side: 'evil' },
  MORDRED: { key: 'MORDRED', name: 'Mordred', side: 'evil' },
  OBERON: { key: 'OBERON', name: 'Oberon', side: 'evil' },
};

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getRoleLayoutForPlayerCount(count) {
  switch (count) {
    case 5:
      return [
        ROLE_DATA.MERLIN, ROLE_DATA.PERCIVAL, ROLE_DATA.SERVANT,
        ROLE_DATA.MORGANA, ROLE_DATA.ASSASSIN,
      ];
    case 6:
      return [
        ROLE_DATA.MERLIN, ROLE_DATA.PERCIVAL, ROLE_DATA.SERVANT, ROLE_DATA.SERVANT,
        ROLE_DATA.MORGANA, ROLE_DATA.ASSASSIN,
      ];
    case 7:
      return [
        ROLE_DATA.MERLIN, ROLE_DATA.PERCIVAL, ROLE_DATA.SERVANT, ROLE_DATA.SERVANT,
        ROLE_DATA.MORGANA, ROLE_DATA.ASSASSIN, ROLE_DATA.MORDRED,
      ];
    case 8:
      return [
        ROLE_DATA.MERLIN, ROLE_DATA.PERCIVAL, ROLE_DATA.SERVANT, ROLE_DATA.SERVANT, ROLE_DATA.SERVANT,
        ROLE_DATA.MORGANA, ROLE_DATA.ASSASSIN, ROLE_DATA.MORDRED,
      ];
    case 9:
      return [
        ROLE_DATA.MERLIN, ROLE_DATA.PERCIVAL, ROLE_DATA.SERVANT, ROLE_DATA.SERVANT, ROLE_DATA.SERVANT, ROLE_DATA.SERVANT,
        ROLE_DATA.MORGANA, ROLE_DATA.ASSASSIN, ROLE_DATA.MORDRED,
      ];
    case 10:
    default:
      return [
        ROLE_DATA.MERLIN, ROLE_DATA.PERCIVAL, ROLE_DATA.SERVANT, ROLE_DATA.SERVANT, ROLE_DATA.SERVANT, ROLE_DATA.SERVANT,
        ROLE_DATA.MORGANA, ROLE_DATA.ASSASSIN, ROLE_DATA.MORDRED, ROLE_DATA.OBERON,
      ].slice(0, count);
  }
}

function buildRoleDescriptionForPlayer(player, allPlayers) {
  const role = player.role;
  const evilPlayers = allPlayers.filter((p) => p.role.side === 'evil');
  const visibleEvilsForMerlin = evilPlayers.filter(
    (p) => p.role.key !== 'MORDRED' && p.role.key !== 'OBERON',
  );

  if (role.key === 'MERLIN') {
    const list = visibleEvilsForMerlin.length > 0
      ? visibleEvilsForMerlin.map((p) => `<@${p.id}>`).join(', ')
      : 'ไม่มีข้อมูลฝ่ายร้าย (ผิดปกติ)';
    return [
      'คุณคือ **Merlin** ฝ่ายดี',
      'คุณรู้ตัวตนของฝ่ายร้าย (ยกเว้น Mordred และ Oberon)',
      `คุณเห็นว่าผู้เล่นฝ่ายร้ายคือ: ${list}`,
      'ระวังอย่าให้ตนเองโดนจับได้ในตอนท้ายเกม มิฉะนั้นฝ่ายร้ายจะชนะ',
    ].join('\n');
  }

  if (role.key === 'PERCIVAL') {
    const candidates = allPlayers.filter(
      (p) => p.role.key === 'MERLIN' || p.role.key === 'MORGANA',
    );
    const list = candidates.length > 0
      ? candidates.map((p) => `<@${p.id}>`).join(', ')
      : 'ไม่มีข้อมูล (ผิดปกติ)';
    return [
      'คุณคือ **Percival** ฝ่ายดี',
      'คุณรู้ว่าในกลุ่มต่อไปนี้ มี Merlin ซ่อนอยู่ แต่ไม่รู้ว่าใครเป็นใคร:',
      list,
    ].join('\n');
  }

  if (role.side === 'good') {
    return [
      `คุณคือ **${role.name}** ฝ่ายดี`,
      'หน้าที่ของคุณคือช่วยให้ภารกิจสำเร็จ และพยายามระบุให้ได้ว่าใครคือฝ่ายร้าย',
    ].join('\n');
  }

  if (role.key === 'OBERON') {
    return [
      'คุณคือ **Oberon** ฝ่ายร้ายที่โดดเดี่ยว',
      'คุณไม่รู้ว่าฝ่ายร้ายคนอื่นคือใครบ้าง และพวกเขาก็ไม่รู้ว่าคุณเป็นฝ่ายร้าย',
      'เป้าหมายของคุณคือทำให้ภารกิจล้มเหลว โดยไม่ให้ใครจับได้',
    ].join('\n');
  }

  const otherEvils = evilPlayers.filter(
    (p) => p.id !== player.id && p.role.key !== 'OBERON',
  );
  const list = otherEvils.length > 0
    ? otherEvils.map((p) => `<@${p.id}> (${p.role.name})`).join(', ')
    : 'ไม่มีเพื่อนร่วมทีมฝ่ายร้าย (ผิดปกติ)';

  if (role.key === 'ASSASSIN') {
    return [
      'คุณคือ **Assassin** ฝ่ายร้าย',
      `คุณรู้ว่าฝ่ายร้ายคนอื่นคือ: ${list}`,
      'ถ้าฝ่ายดีชนะภารกิจครบ 3 ครั้ง คุณจะมีโอกาสเดาว่าใครคือ Merlin',
      'ถ้าคุณเดาถูก ฝ่ายร้ายจะชนะทันที',
    ].join('\n');
  }
  if (role.key === 'MORGANA') {
    return [
      'คุณคือ **Morgana** ฝ่ายร้าย',
      `คุณรู้ว่าฝ่ายร้ายคนอื่นคือ: ${list}`,
      'Percival จะมองเห็นคุณเป็นหนึ่งในตัวเลือกที่อาจเป็น Merlin',
    ].join('\n');
  }
  if (role.key === 'MORDRED') {
    return [
      'คุณคือ **Mordred** ฝ่ายร้าย',
      `คุณรู้ว่าฝ่ายร้ายคนอื่นคือ: ${list}`,
      'Merlin จะไม่เห็นว่าคุณเป็นฝ่ายร้าย ทำให้คุณซ่อนตัวจากสายตาของ Merlin ได้',
    ].join('\n');
  }

  return [
    `คุณคือ **${role.name}** ฝ่ายร้าย`,
    `คุณรู้ว่าฝ่ายร้ายคนอื่นคือ: ${list}`,
    'หน้าที่ของคุณคือทำให้ภารกิจล้มเหลว โดยไม่ให้ฝ่ายดีจับได้ทั้งหมด',
  ].join('\n');
}

function assignRolesAndGetInfos(players) {
  const layout = getRoleLayoutForPlayerCount(players.length);
  const shuffledPlayers = shuffleArray(players);
  const shuffledRoles = shuffleArray(layout);

  for (let i = 0; i < shuffledPlayers.length; i++) {
    shuffledPlayers[i].role = shuffledRoles[i];
  }

  return shuffledPlayers.map((p) => ({
    id: p.id,
    roleName: p.role.name,
    description: buildRoleDescriptionForPlayer(p, shuffledPlayers),
  }));
}

module.exports = { assignRolesAndGetInfos };
