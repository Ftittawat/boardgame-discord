const ROLES = {
  WEREWOLF: {
    id: 'werewolf',
    name: 'หมาป่า',
    nameEn: 'Werewolf',
    emoji: '🐺',
    team: 'werewolf',
    description: 'เลือกผู้เล่นที่จะกัดในทุกๆ กลางคืน',
  },
  SEER: {
    id: 'seer',
    name: 'หมอดู',
    nameEn: 'Seer',
    emoji: '🔮',
    team: 'villager',
    description: 'ตรวจสอบตัวตนของผู้เล่นได้ 1 คนต่อคืน',
  },
  DOCTOR: {
    id: 'doctor',
    name: 'หมอ',
    nameEn: 'Doctor',
    emoji: '💉',
    team: 'villager',
    description: 'ปกป้องผู้เล่น 1 คนต่อคืน จากการถูกหมาป่ากัด',
  },
  HUNTER: {
    id: 'hunter',
    name: 'นักล่า',
    nameEn: 'Hunter',
    emoji: '🏹',
    team: 'villager',
    description: 'เมื่อตาย สามารถเลือกยิงผู้เล่น 1 คนไปด้วย',
  },
  VILLAGER: {
    id: 'villager',
    name: 'ชาวบ้าน',
    nameEn: 'Villager',
    emoji: '👨‍🌾',
    team: 'villager',
    description: 'ร่วมกันหาและโหวตขับไล่หมาป่าในตอนกลางวัน',
  },
};

function getRoleDistribution(playerCount) {
  const roles = [];
  let werewolfCount;
  if (playerCount <= 5) werewolfCount = 1;
  else if (playerCount <= 9) werewolfCount = 2;
  else werewolfCount = 3;

  for (let i = 0; i < werewolfCount; i++) roles.push(ROLES.WEREWOLF);
  roles.push(ROLES.SEER);
  roles.push(ROLES.DOCTOR);
  if (playerCount >= 8) roles.push(ROLES.HUNTER);
  while (roles.length < playerCount) roles.push(ROLES.VILLAGER);
  return roles;
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getRoleById(roleId) {
  return Object.values(ROLES).find((r) => r.id === roleId) || null;
}

module.exports = { ROLES, getRoleDistribution, shuffle, getRoleById };
