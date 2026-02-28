// Crime Empire - Server Enhanced
// Copyright (c) 2026 Sava — All Rights Reserved.

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(express.json());

const users = new Map();
let userIdCounter = 1;
const clans = new Map();
let clanIdCounter = 1;
const chatMessages = [];

let stocks = [
  { id: 's1', name: 'شركة الأسلحة', price: 1000, change: 0 },
  { id: 's2', name: 'مخدرات الشمال', price: 500, change: 0 },
  { id: 's3', name: 'عصابة الميناء', price: 2000, change: 0 },
  { id: 's4', name: 'شركة الغسيل', price: 800, change: 0 },
];

const gameSystems = new Map([
  ['missions', { enabled: true, name: 'المهام', icon: '💼' }],
  ['attack', { enabled: true, name: 'الهجوم', icon: '⚔️' }],
  ['skills', { enabled: true, name: 'المهارات', icon: '📈' }],
  ['casino', { enabled: true, name: 'الكازينو', icon: '🎰' }],
  ['moneylaundering', { enabled: true, name: 'غسيل المال', icon: '💸' }],
  ['spy', { enabled: true, name: 'التجسس', icon: '🕵️' }],
  ['chat', { enabled: true, name: 'الدردشة', icon: '💬' }],
  ['leaderboard', { enabled: true, name: 'الترتيب', icon: '🏆' }],
  ['stocks', { enabled: true, name: 'الأسهم', icon: '📊' }],
  ['loans', { enabled: true, name: 'القروض', icon: '🏦' }],
  ['clans', { enabled: true, name: 'العشائر', icon: '🛡️' }],
  ['weapons', { enabled: true, name: 'الأسلحة', icon: '🔫' }],
]);

const LOAN_PLANS = [
  { id: 1, name: 'قرض صغير', amount: 5000, hours: 15, interest: 0.2 },
  { id: 2, name: 'قرض متوسط', amount: 10000, hours: 30, interest: 0.25 },
  { id: 3, name: 'قرض كبير', amount: 25000, hours: 60, interest: 0.3 },
];

const WEAPONS = [
  { id: 'knife', name: 'سكين', price: 500, strBonus: 1, icon: '🔪' },
  { id: 'pistol', name: 'مسدس', price: 2000, strBonus: 3, icon: '🔫' },
  { id: 'rifle', name: 'بندقية', price: 8000, strBonus: 7, icon: '🎯' },
  { id: 'shotgun', name: 'شوتقن', price: 15000, strBonus: 12, icon: '💥' },
  { id: 'rpg', name: 'آر بي جي', price: 50000, strBonus: 25, icon: '🚀' },
];

const ADMIN_CODE = 'CRIME2026';
const GOVERNOR_CODE = 'GOV2026';
const JWT_SECRET = 'crime_empire_secret_2026';

const MISSIONS = [
  { name: 'سرقة محل صغير', reward: [500, 1500], heatGain: 5, index: 0 },
  { name: 'سرقة سيارة', reward: [1000, 3000], heatGain: 10, minStealth: 2, index: 1 },
  { name: 'سطو على بنك', reward: [5000, 15000], heatGain: 25, minStr: 3, index: 2 },
  { name: 'اختراق إلكتروني', reward: [3000, 8000], heatGain: 15, minIntel: 3, index: 3 },
  { name: 'عملية كبرى', reward: [10000, 30000], heatGain: 40, minStr: 5, minStealth: 5, minIntel: 5, index: 4 },
];

function getLevel(u) {
  return Math.floor((u.strength + u.stealth + u.intelligence) / 3);
}

function makeUser(username, passwordHash) {
  const id = String(userIdCounter++);
  return {
    id, username, passwordHash,
    money: 1000, heat: 0,
    strength: 1, stealth: 1, intelligence: 1,
    role: 'player', jail_until: 0,
    dirtyMoney: 0,
    loans: [],
    stocks: {},
    weapons: [],
    activeWeapon: null,
    clanId: null,
    clanRole: null,
    policeRelations: 0,
    createdAt: Date.now(),
  };
}

function userPublic(u) {
  return {
    id: u.id, username: u.username,
    money: u.money, heat: u.heat,
    strength: u.strength, stealth: u.stealth, intelligence: u.intelligence,
    role: u.role, jail_until: u.jail_until,
    dirtyMoney: u.dirtyMoney || 0,
    loans: u.loans || [],
    stocks: u.stocks || {},
    weapons: u.weapons || [],
    activeWeapon: u.activeWeapon,
    clanId: u.clanId,
    clanRole: u.clanRole,
    level: getLevel(u),
  };
}

function auth(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  try {
    const d = jwt.verify(token, JWT_SECRET);
    const user = users.get(d.id);
    if (!user) return res.status(401).json({ error: 'مستخدم غير موجود' });
    req.user = user; next();
  } catch { res.status(401).json({ error: 'جلسة منتهية' }); }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'أدمن فقط' });
  next();
}

function govOnly(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'governor')
    return res.status(403).json({ error: 'حكام فقط' });
  next();
}

function sys(name) {
  return (req, res, next) => {
    const s = gameSystems.get(name);
    if (!s || !s.enabled) return res.status(403).json({ error: `نظام "${s?.name || name}" معطل حالياً` });
    next();
  };
}

// تحديث أسعار الأسهم كل دقيقة
setInterval(() => {
  stocks.forEach(s => {
    const ch = (Math.random() - 0.48) * 0.1;
    s.change = Math.round(ch * 100) / 100;
    s.price = Math.max(100, Math.round(s.price * (1 + ch)));
  });
}, 60000);

// === تسجيل ودخول ===
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'أدخل الاسم وكلمة المرور' });
  if (username.length < 3) return res.status(400).json({ error: 'الاسم قصير جداً' });
  if (password.length < 6) return res.status(400).json({ error: 'كلمة المرور قصيرة (6 أحرف)' });
  for (const u of users.values())
    if (u.username.toLowerCase() === username.toLowerCase())
      return res.status(400).json({ error: 'الاسم مستخدم' });
  const hash = await bcrypt.hash(password, 10);
  const user = makeUser(username, hash);
  if (users.size === 0) user.role = 'admin';
  users.set(user.id, user);
  res.json({ message: 'تم إنشاء الحساب' });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  let found = null;
  for (const u of users.values())
    if (u.username.toLowerCase() === username.toLowerCase()) { found = u; break; }
  if (!found) return res.status(400).json({ error: 'اسم المستخدم أو كلمة المرور خاطئة' });
  if (!await bcrypt.compare(password, found.passwordHash))
    return res.status(400).json({ error: 'اسم المستخدم أو كلمة المرور خاطئة' });
  res.json({ token: jwt.sign({ id: found.id }, JWT_SECRET, { expiresIn: '7d' }) });
});

app.get('/api/me', auth, (req, res) => res.json(userPublic(req.user)));

// === المهام ===
app.get('/api/missions', auth, sys('missions'), (req, res) => res.json(MISSIONS));

app.post('/api/mission', auth, sys('missions'), (req, res) => {
  const user = req.user;
  if (user.jail_until > Date.now()) return res.status(400).json({ error: 'أنت في السجن!' });
  const mission = MISSIONS[req.body.missionIndex];
  if (!mission) return res.status(400).json({ error: 'مهمة غير موجودة' });
  if (mission.minStealth && user.stealth < mission.minStealth)
    return res.status(400).json({ error: `تحتاج تخفي ${mission.minStealth}` });
  if (mission.minStr && user.strength < mission.minStr)
    return res.status(400).json({ error: `تحتاج قوة ${mission.minStr}` });
  if (mission.minIntel && user.intelligence < mission.minIntel)
    return res.status(400).json({ error: `تحتاج ذكاء ${mission.minIntel}` });
  const catchChance = Math.min(0.6, (user.heat / 100) * 0.4 + (1 / (user.stealth + 1)) * 0.3);
  if (Math.random() < catchChance) {
    user.jail_until = Date.now() + 2 * 60 * 1000;
    user.heat = 0;
    return res.json({ success: false, jailed: true, jail_until: user.jail_until });
  }
  const reward = Math.floor(Math.random() * (mission.reward[1] - mission.reward[0])) + mission.reward[0];
  user.money += reward;
  user.dirtyMoney = (user.dirtyMoney || 0) + reward;
  user.heat = Math.min(100, user.heat + mission.heatGain);
  res.json({ success: true, mission: mission.name, reward });
});

// === الهجوم ===
app.post('/api/attack', auth, sys('attack'), (req, res) => {
  const atk = req.user;
  if (atk.jail_until > Date.now()) return res.status(400).json({ error: 'أنت في السجن!' });
  const tgt = users.get(req.body.targetId);
  if (!tgt || tgt.id === atk.id) return res.status(400).json({ error: 'هدف غير صالح' });
  if (tgt.jail_until > Date.now()) return res.status(400).json({ error: 'الهدف في السجن' });
  const wBonus = atk.activeWeapon ? (WEAPONS.find(w => w.id === atk.activeWeapon)?.strBonus || 0) : 0;
  const atkPow = atk.strength + wBonus;
  const success = Math.random() < 0.3 + (atkPow / (atkPow + tgt.strength)) * 0.5;
  atk.heat = Math.min(100, atk.heat + 20);
  if (success) {
    const stolen = Math.floor(tgt.money * 0.1);
    tgt.money -= stolen; atk.money += stolen;
    return res.json({ success: true, stolen });
  }
  res.json({ success: false });
});

// === المهارات ===
app.post('/api/upgrade', auth, sys('skills'), (req, res) => {
  const user = req.user;
  const { stat } = req.body;
  if (!['strength', 'stealth', 'intelligence'].includes(stat))
    return res.status(400).json({ error: 'مهارة غير صحيحة' });
  const cost = user[stat] * 5000;
  if (user.money < cost) return res.status(400).json({ error: 'مال غير كافٍ' });
  user.money -= cost; user[stat]++;
  res.json({ newLevel: user[stat] });
});

app.post('/api/surrender', auth, (req, res) => {
  req.user.heat = 0;
  req.user.jail_until = Date.now() + 2 * 60 * 1000;
  res.json({ message: 'سلّمت نفسك', jail_until: req.user.jail_until });
});

app.post('/api/become-admin', auth, (req, res) => {
  const { code } = req.body;
  if (code === ADMIN_CODE) { req.user.role = 'admin'; return res.json({ message: 'أصبحت أدمن! 👑', role: 'admin' }); }
  if (code === GOVERNOR_CODE) { req.user.role = 'governor'; return res.json({ message: 'أصبحت حاكماً! 🏛️', role: 'governor' }); }
  res.status(400).json({ error: 'كود خاطئ' });
});

app.get('/api/leaderboard', auth, sys('leaderboard'), (req, res) => {
  res.json([...users.values()].sort((a, b) => b.money - a.money).slice(0, 50).map(u => {
    const p = userPublic(u);
    if (u.role === 'admin') p.role = 'player'; // إخفاء الأدمن
    return p;
  }));
});

// === الكازينو ===
app.post('/api/casino/bet', auth, sys('casino'), (req, res) => {
  const user = req.user;
  const { amount, choice } = req.body;
  if (!amount || amount <= 0 || amount > 100000) return res.status(400).json({ error: 'مبلغ غير صحيح (الحد 100,000)' });
  if (user.money < amount) return res.status(400).json({ error: 'مال غير كافٍ' });
  user.money -= amount;
  const result = Math.floor(Math.random() * 37);
  const isRed = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(result);
  let won = 0;
  if (choice === 'red' && isRed) won = amount * 2;
  else if (choice === 'black' && !isRed && result !== 0) won = amount * 2;
  else if (Number(choice) === result) won = amount * 35;
  user.money += won;
  res.json({ result, isRed, won, profit: won - amount });
});

// === الأسهم ===
app.get('/api/stocks', auth, sys('stocks'), (req, res) => res.json({ stocks, portfolio: req.user.stocks || {} }));

app.post('/api/stocks/buy', auth, sys('stocks'), (req, res) => {
  const user = req.user;
  const { stockId, quantity } = req.body;
  const stock = stocks.find(s => s.id === stockId);
  if (!stock) return res.status(400).json({ error: 'سهم غير موجود' });
  if (quantity <= 0) return res.status(400).json({ error: 'كمية غير صحيحة' });
  const total = stock.price * quantity;
  if (user.money < total) return res.status(400).json({ error: 'مال غير كافٍ' });
  user.money -= total;
  if (!user.stocks) user.stocks = {};
  user.stocks[stockId] = (user.stocks[stockId] || 0) + quantity;
  res.json({ message: `اشتريت ${quantity} سهم من ${stock.name}`, total });
});

app.post('/api/stocks/sell', auth, sys('stocks'), (req, res) => {
  const user = req.user;
  const { stockId, quantity } = req.body;
  const stock = stocks.find(s => s.id === stockId);
  if (!stock) return res.status(400).json({ error: 'سهم غير موجود' });
  if (!user.stocks?.[stockId] || user.stocks[stockId] < quantity)
    return res.status(400).json({ error: 'لا تملك كمية كافية' });
  const total = stock.price * quantity;
  user.money += total;
  user.stocks[stockId] -= quantity;
  res.json({ message: `بعت ${quantity} سهم من ${stock.name}`, total });
});

// === غسيل المال ===
app.post('/api/launder', auth, sys('moneylaundering'), (req, res) => {
  const user = req.user;
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'مبلغ غير صحيح' });
  if ((user.dirtyMoney || 0) < amount) return res.status(400).json({ error: 'مال قذر غير كافٍ' });
  const fee = Math.floor(amount * 0.25);
  user.dirtyMoney -= amount;
  user.money += (amount - fee);
  res.json({ message: `تم غسل ${amount.toLocaleString()} $`, fee, net: amount - fee });
});

// === التجسس ===
app.post('/api/spy', auth, sys('spy'), (req, res) => {
  const user = req.user;
  const cost = user.intelligence * 1000;
  if (user.money < cost) return res.status(400).json({ error: `تحتاج ${cost.toLocaleString()} $` });
  const target = users.get(req.body.targetId);
  if (!target || target.id === user.id) return res.status(400).json({ error: 'هدف غير صالح' });
  user.money -= cost;
  if (Math.random() < 0.3 + user.intelligence * 0.1) {
    return res.json({ success: true, info: { money: target.money, heat: target.heat, strength: target.strength, jail_until: target.jail_until } });
  }
  res.json({ success: false, message: 'فشلت عملية التجسس' });
});

// === القروض ===
app.get('/api/loans/plans', auth, sys('loans'), (req, res) => res.json(LOAN_PLANS));

app.post('/api/loans/take', auth, sys('loans'), (req, res) => {
  const user = req.user;
  if (getLevel(user) < 3) return res.status(400).json({ error: 'يجب أن تكون مستوى 3 أو أعلى للحصول على قرض' });
  const plan = LOAN_PLANS.find(p => p.id === req.body.planId);
  if (!plan) return res.status(400).json({ error: 'خطة قرض غير موجودة' });
  const existing = (user.loans || []).find(l => l.planId === plan.id && l.status === 'active');
  if (existing) return res.status(400).json({ error: 'لديك قرض نشط من هذا النوع' });
  if (!user.loans) user.loans = [];
  const dueAt = Date.now() + plan.hours * 3600000;
  const totalDue = Math.floor(plan.amount * (1 + plan.interest));
  user.loans.push({ planId: plan.id, planName: plan.name, amount: plan.amount, totalDue, dueAt, takenAt: Date.now(), status: 'active' });
  user.money += plan.amount;
  res.json({ message: `تم منحك ${plan.name} بقيمة ${plan.amount.toLocaleString()} $`, dueAt, totalDue });
});

app.post('/api/loans/repay', auth, sys('loans'), (req, res) => {
  const user = req.user;
  const loan = (user.loans || []).find(l => l.planId === req.body.planId && l.status === 'active');
  if (!loan) return res.status(400).json({ error: 'لا يوجد قرض نشط' });
  let due = loan.totalDue;
  if (Date.now() > loan.dueAt) {
    const hoursLate = Math.floor((Date.now() - loan.dueAt) / 3600000);
    due += Math.floor(loan.amount * 0.05 * hoursLate);
  }
  if (user.money < due) return res.status(400).json({ error: `تحتاج ${due.toLocaleString()} $ لسداد القرض` });
  user.money -= due;
  loan.status = 'repaid';
  res.json({ message: 'تم سداد القرض ✅', paid: due });
});

// === الأسلحة ===
app.get('/api/weapons', auth, sys('weapons'), (req, res) => res.json({ weapons: WEAPONS, owned: req.user.weapons || [], active: req.user.activeWeapon }));

app.post('/api/weapons/buy', auth, sys('weapons'), (req, res) => {
  const user = req.user;
  const weapon = WEAPONS.find(w => w.id === req.body.weaponId);
  if (!weapon) return res.status(400).json({ error: 'سلاح غير موجود' });
  if ((user.weapons || []).includes(weapon.id)) return res.status(400).json({ error: 'تملك هذا السلاح' });
  if (user.money < weapon.price) return res.status(400).json({ error: 'مال غير كافٍ' });
  user.money -= weapon.price;
  if (!user.weapons) user.weapons = [];
  user.weapons.push(weapon.id);
  res.json({ message: `اشتريت ${weapon.name} ${weapon.icon}` });
});

app.post('/api/weapons/equip', auth, sys('weapons'), (req, res) => {
  const user = req.user;
  const { weaponId } = req.body;
  if (weaponId && !(user.weapons || []).includes(weaponId))
    return res.status(400).json({ error: 'لا تملك هذا السلاح' });
  user.activeWeapon = weaponId || null;
  const w = WEAPONS.find(x => x.id === weaponId);
  res.json({ message: weaponId ? `تم تجهيز ${w.name}` : 'تم خلع السلاح' });
});

// === العشائر ===
app.get('/api/clans', auth, sys('clans'), (req, res) => {
  res.json([...clans.values()].map(c => ({
    id: c.id, name: c.name, tag: c.tag,
    leaderId: c.leaderId, leaderName: c.leaderName,
    members: c.members.length, treasury: c.treasury,
    description: c.description,
  })));
});

app.post('/api/clans/create', auth, sys('clans'), (req, res) => {
  const user = req.user;
  if (user.clanId) return res.status(400).json({ error: 'أنت بالفعل في عشيرة' });
  if (user.money < 10000) return res.status(400).json({ error: 'تحتاج 10,000 $ لإنشاء عشيرة' });
  const { name, tag, description } = req.body;
  if (!name || !tag) return res.status(400).json({ error: 'أدخل الاسم والتاج' });
  if (tag.length > 5) return res.status(400).json({ error: 'التاج 5 أحرف كحد أقصى' });
  for (const c of clans.values()) {
    if (c.name.toLowerCase() === name.toLowerCase()) return res.status(400).json({ error: 'اسم العشيرة مستخدم' });
  }
  user.money -= 10000;
  const id = String(clanIdCounter++);
  const clan = { id, name, tag: tag.toUpperCase(), description: description || '', leaderId: user.id, leaderName: user.username, members: [{ id: user.id, username: user.username, role: 'leader' }], deputies: [], treasury: 0, createdAt: Date.now() };
  clans.set(id, clan);
  user.clanId = id; user.clanRole = 'leader';
  res.json({ message: `تم إنشاء عشيرة "${name}" 🔥` });
});

app.post('/api/clans/join', auth, sys('clans'), (req, res) => {
  const user = req.user;
  if (user.clanId) return res.status(400).json({ error: 'أنت بالفعل في عشيرة' });
  const clan = clans.get(req.body.clanId);
  if (!clan) return res.status(400).json({ error: 'عشيرة غير موجودة' });
  clan.members.push({ id: user.id, username: user.username, role: 'member' });
  user.clanId = clan.id; user.clanRole = 'member';
  res.json({ message: `انضممت إلى عشيرة ${clan.name}` });
});

app.post('/api/clans/leave', auth, sys('clans'), (req, res) => {
  const user = req.user;
  if (!user.clanId) return res.status(400).json({ error: 'لست في عشيرة' });
  if (user.clanRole === 'leader') return res.status(400).json({ error: 'القائد لا يمكنه المغادرة' });
  const clan = clans.get(user.clanId);
  if (clan) clan.members = clan.members.filter(m => m.id !== user.id);
  user.clanId = null; user.clanRole = null;
  res.json({ message: 'غادرت العشيرة' });
});

// دعم خزينة العشيرة (أي عضو)
app.post('/api/clans/donate', auth, sys('clans'), (req, res) => {
  const user = req.user;
  if (!user.clanId) return res.status(400).json({ error: 'لست في عشيرة' });
  const { amount } = req.body;
  if (!amount || amount <= 0 || user.money < amount) return res.status(400).json({ error: 'مبلغ غير صحيح أو مال غير كافٍ' });
  const clan = clans.get(user.clanId);
  if (!clan) return res.status(400).json({ error: 'عشيرة غير موجودة' });
  user.money -= amount;
  clan.treasury += amount;
  res.json({ message: `تبرعت بـ ${amount.toLocaleString()} $ 💰`, treasury: clan.treasury });
});

// سحب من خزينة (القائد والمساعدون فقط)
app.post('/api/clans/withdraw', auth, sys('clans'), (req, res) => {
  const user = req.user;
  if (!user.clanId) return res.status(400).json({ error: 'لست في عشيرة' });
  if (user.clanRole !== 'leader' && user.clanRole !== 'deputy')
    return res.status(403).json({ error: 'فقط القائد والمساعدون يمكنهم السحب' });
  const { amount } = req.body;
  const clan = clans.get(user.clanId);
  if (!clan || clan.treasury < amount) return res.status(400).json({ error: 'خزينة غير كافية' });
  clan.treasury -= amount;
  user.money += amount;
  res.json({ message: `سحبت ${amount.toLocaleString()} $ من الخزينة`, treasury: clan.treasury });
});

// تعيين مساعد (القائد فقط)
app.post('/api/clans/deputy', auth, sys('clans'), (req, res) => {
  const user = req.user;
  if (user.clanRole !== 'leader') return res.status(403).json({ error: 'فقط القائد يعين مساعدين' });
  const clan = clans.get(user.clanId);
  const member = clan?.members.find(m => m.id === req.body.targetId);
  if (!member) return res.status(400).json({ error: 'اللاعب ليس في عشيرتك' });
  const tgt = users.get(req.body.targetId);
  if (tgt) tgt.clanRole = 'deputy';
  member.role = 'deputy';
  res.json({ message: `تم تعيين ${member.username} مساعداً` });
});

app.get('/api/clans/:id', auth, sys('clans'), (req, res) => {
  const clan = clans.get(req.params.id);
  if (!clan) return res.status(404).json({ error: 'عشيرة غير موجودة' });
  res.json(clan);
});

// === الدردشة ===
app.get('/api/chat', auth, sys('chat'), (req, res) => res.json(chatMessages.slice(-50)));

app.post('/api/chat', auth, sys('chat'), (req, res) => {
  const { message } = req.body;
  if (!message?.trim() || message.length > 200) return res.status(400).json({ error: 'رسالة غير صحيحة' });
  const user = req.user;
  const msg = {
    id: Date.now(), userId: user.id, username: user.username,
    role: user.role === 'admin' ? 'player' : user.role, // إخفاء الأدمن
    message: message.trim(), time: Date.now(),
  };
  chatMessages.push(msg);
  if (chatMessages.length > 200) chatMessages.shift();
  res.json({ message: msg });
});

// === لوحة الأدمن ===
app.get('/api/admin/users', auth, adminOnly, (req, res) => {
  res.json([...users.values()].map(u => ({ ...userPublic(u), role: u.role })));
});

app.get('/api/admin/systems', auth, adminOnly, (req, res) => {
  const list = [];
  gameSystems.forEach((v, k) => list.push({ id: k, ...v }));
  res.json(list);
});

app.post('/api/admin/systems/:id/toggle', auth, adminOnly, (req, res) => {
  const s = gameSystems.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'نظام غير موجود' });
  s.enabled = req.body.enabled;
  res.json({ message: `${s.enabled ? 'تم تفعيل' : 'تم تعطيل'} نظام "${s.name}"` });
});

app.post('/api/admin/systems/new', auth, adminOnly, (req, res) => {
  const { id, name, icon } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'أدخل المعرف والاسم' });
  if (gameSystems.has(id)) return res.status(400).json({ error: 'المعرف مستخدم' });
  gameSystems.set(id, { enabled: true, name, icon: icon || '⚙️' });
  res.json({ message: `تم إضافة نظام "${name}"` });
});

// إعطاء فلوس
app.post('/api/admin/give-money', auth, adminOnly, (req, res) => {
  const { targetId, amount } = req.body;
  const target = users.get(targetId);
  if (!target) return res.status(404).json({ error: 'لاعب غير موجود' });
  if (!amount || amount <= 0) return res.status(400).json({ error: 'مبلغ غير صحيح' });
  target.money += Number(amount);
  res.json({ message: `تم إعطاء ${Number(amount).toLocaleString()} $ لـ ${target.username} ✅` });
});

// إعطاء سلاح
app.post('/api/admin/give-weapon', auth, adminOnly, (req, res) => {
  const { targetId, weaponId } = req.body;
  const target = users.get(targetId);
  if (!target) return res.status(404).json({ error: 'لاعب غير موجود' });
  const weapon = WEAPONS.find(w => w.id === weaponId);
  if (!weapon) return res.status(400).json({ error: 'سلاح غير موجود' });
  if (!target.weapons) target.weapons = [];
  if (target.weapons.includes(weaponId)) return res.status(400).json({ error: 'اللاعب يملك هذا السلاح' });
  target.weapons.push(weaponId);
  res.json({ message: `تم إعطاء ${weapon.name} ${weapon.icon} لـ ${target.username}` });
});

// إعادة ضبط الأسهم
app.post('/api/admin/reset-stocks', auth, adminOnly, (req, res) => {
  stocks = [
    { id: 's1', name: 'شركة الأسلحة', price: 1000, change: 0 },
    { id: 's2', name: 'مخدرات الشمال', price: 500, change: 0 },
    { id: 's3', name: 'عصابة الميناء', price: 2000, change: 0 },
    { id: 's4', name: 'شركة الغسيل', price: 800, change: 0 },
  ];
  for (const u of users.values()) u.stocks = {};
  res.json({ message: 'تم إعادة ضبط نظام الأسهم ✅' });
});

// تعيين/إزالة حاكم
app.post('/api/admin/set-governor', auth, adminOnly, (req, res) => {
  const target = users.get(req.body.targetId);
  if (!target) return res.status(404).json({ error: 'لاعب غير موجود' });
  target.role = 'governor';
  res.json({ message: `تم تعيين ${target.username} حاكماً 🏛️` });
});

app.post('/api/admin/remove-governor', auth, adminOnly, (req, res) => {
  const target = users.get(req.body.targetId);
  if (!target) return res.status(404).json({ error: 'لاعب غير موجود' });
  if (target.role !== 'governor') return res.status(400).json({ error: 'ليس حاكماً' });
  target.role = 'player';
  res.json({ message: `تم إزالة ${target.username} من منصب الحاكم` });
});

app.post('/api/admin/jail/:id', auth, adminOnly, (req, res) => {
  const target = users.get(req.params.id);
  if (!target) return res.status(404).json({ error: 'مستخدم غير موجود' });
  target.jail_until = Date.now() + (req.body.minutes || 10) * 60000;
  res.json({ message: `تم سجن ${target.username}` });
});

app.post('/api/admin/release/:id', auth, adminOnly, (req, res) => {
  const target = users.get(req.params.id);
  if (!target) return res.status(404).json({ error: 'مستخدم غير موجود' });
  target.jail_until = 0;
  res.json({ message: `تم إفراج ${target.username}` });
});

// === صلاحيات الحاكم ===
app.get('/api/gov/players', auth, govOnly, (req, res) => {
  res.json([...users.values()].map(u => ({
    id: u.id, username: u.username, money: u.money,
    heat: u.heat, jail_until: u.jail_until, level: getLevel(u),
    role: u.role === 'admin' ? 'player' : u.role,
    clanId: u.clanId,
  })));
});

app.post('/api/gov/jail/:id', auth, govOnly, (req, res) => {
  const target = users.get(req.params.id);
  if (!target) return res.status(404).json({ error: 'لاعب غير موجود' });
  if (target.role === 'admin') return res.status(403).json({ error: 'لا يمكنك سجن هذا اللاعب' });
  target.jail_until = Date.now() + (req.body.minutes || 10) * 60000;
  res.json({ message: `تم سجن ${target.username}` });
});

app.post('/api/gov/release/:id', auth, govOnly, (req, res) => {
  const target = users.get(req.params.id);
  if (!target) return res.status(404).json({ error: 'لاعب غير موجود' });
  if (target.role === 'admin') return res.status(403).json({ error: 'غير مصرح' });
  target.jail_until = 0;
  res.json({ message: `تم إفراج ${target.username}` });
});

app.post('/api/gov/give-money', auth, govOnly, (req, res) => {
  const { targetId, amount } = req.body;
  const target = users.get(targetId);
  if (!target) return res.status(404).json({ error: 'لاعب غير موجود' });
  if (target.role === 'admin') return res.status(403).json({ error: 'غير مصرح' });
  if (!amount || amount <= 0) return res.status(400).json({ error: 'مبلغ غير صحيح' });
  target.money += Number(amount);
  res.json({ message: `تم إعطاء ${Number(amount).toLocaleString()} $ لـ ${target.username}` });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

module.exports = app;
