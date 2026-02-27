// Crime Empire - Server (Vercel Compatible)
// Copyright (c) 2026 Sava — All Rights Reserved.

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(express.json());

// ===== قاعدة البيانات (في الذاكرة) =====
const users = new Map();
let userIdCounter = 1;

const ADMIN_CODE = 'CRIME2026';
const JWT_SECRET = 'crime_empire_secret_key_2026';

const MISSIONS = [
  { name: 'سرقة محل صغير', reward: [500, 1500], heatGain: 5, index: 0 },
  { name: 'سرقة سيارة', reward: [1000, 3000], heatGain: 10, minStealth: 2, index: 1 },
  { name: 'سطو على بنك', reward: [5000, 15000], heatGain: 25, minStr: 3, index: 2 },
  { name: 'اختراق إلكتروني', reward: [3000, 8000], heatGain: 15, minIntel: 3, index: 3 },
  { name: 'عملية كبرى', reward: [10000, 30000], heatGain: 40, minStr: 5, minStealth: 5, minIntel: 5, index: 4 },
];

function makeUser(username, passwordHash) {
  const id = String(userIdCounter++);
  return {
    id, username, passwordHash,
    money: 1000, heat: 0,
    strength: 1, stealth: 1, intelligence: 1,
    role: 'player', jail_until: 0,
    createdAt: Date.now(),
  };
}

function userPublic(u) {
  return {
    id: u.id, username: u.username,
    money: u.money, heat: u.heat,
    strength: u.strength, stealth: u.stealth, intelligence: u.intelligence,
    role: u.role, jail_until: u.jail_until,
  };
}

function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = users.get(decoded.id);
    if (!user) return res.status(401).json({ error: 'مستخدم غير موجود' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'جلسة منتهية، سجّل دخولك مجدداً' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
  next();
}

// تسجيل
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'أدخل الاسم وكلمة المرور' });
  if (username.length < 3) return res.status(400).json({ error: 'الاسم قصير جداً (3 أحرف على الأقل)' });
  if (password.length < 6) return res.status(400).json({ error: 'كلمة المرور قصيرة (6 أحرف على الأقل)' });

  for (const u of users.values()) {
    if (u.username.toLowerCase() === username.toLowerCase())
      return res.status(400).json({ error: 'الاسم مستخدم بالفعل' });
  }

  const hash = await bcrypt.hash(password, 10);
  const user = makeUser(username, hash);
  if (users.size === 0) user.role = 'admin';
  users.set(user.id, user);
  res.json({ message: 'تم إنشاء الحساب بنجاح' });
});

// دخول
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  let found = null;
  for (const u of users.values()) {
    if (u.username.toLowerCase() === username.toLowerCase()) { found = u; break; }
  }
  if (!found) return res.status(400).json({ error: 'اسم المستخدم أو كلمة المرور خاطئة' });
  const ok = await bcrypt.compare(password, found.passwordHash);
  if (!ok) return res.status(400).json({ error: 'اسم المستخدم أو كلمة المرور خاطئة' });
  const token = jwt.sign({ id: found.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

// بياناتي
app.get('/api/me', authMiddleware, (req, res) => {
  res.json(userPublic(req.user));
});

// المهام
app.get('/api/missions', authMiddleware, (req, res) => {
  res.json(MISSIONS);
});

app.post('/api/mission', authMiddleware, (req, res) => {
  const user = req.user;
  if (user.jail_until > Date.now()) return res.status(400).json({ error: 'أنت في السجن!' });

  const { missionIndex } = req.body;
  const mission = MISSIONS[missionIndex];
  if (!mission) return res.status(400).json({ error: 'مهمة غير موجودة' });

  if (mission.minStealth && user.stealth < mission.minStealth)
    return res.status(400).json({ error: `تحتاج تخفي ${mission.minStealth}` });
  if (mission.minStr && user.strength < mission.minStr)
    return res.status(400).json({ error: `تحتاج قوة ${mission.minStr}` });
  if (mission.minIntel && user.intelligence < mission.minIntel)
    return res.status(400).json({ error: `تحتاج ذكاء ${mission.minIntel}` });

  const catchChance = Math.min(0.6, (user.heat / 100) * 0.4 + (1 / (user.stealth + 1)) * 0.3);
  const caught = Math.random() < catchChance;

  if (caught) {
    user.jail_until = Date.now() + 2 * 60 * 1000;
    user.heat = 0;
    return res.json({ success: false, jailed: true, jail_until: user.jail_until });
  }

  const reward = Math.floor(Math.random() * (mission.reward[1] - mission.reward[0])) + mission.reward[0];
  user.money += reward;
  user.heat = Math.min(100, user.heat + mission.heatGain);
  res.json({ success: true, mission: mission.name, reward });
});

// هجوم
app.post('/api/attack', authMiddleware, (req, res) => {
  const attacker = req.user;
  if (attacker.jail_until > Date.now()) return res.status(400).json({ error: 'أنت في السجن!' });

  const target = users.get(req.body.targetId);
  if (!target) return res.status(400).json({ error: 'اللاعب غير موجود' });
  if (target.id === attacker.id) return res.status(400).json({ error: 'لا تقدر تهاجم نفسك' });
  if (target.jail_until > Date.now()) return res.status(400).json({ error: 'الهدف في السجن' });

  const successChance = 0.3 + (attacker.strength / (attacker.strength + target.strength)) * 0.5;
  const success = Math.random() < successChance;
  attacker.heat = Math.min(100, attacker.heat + 20);

  if (success) {
    const stolen = Math.floor(target.money * 0.1);
    target.money -= stolen;
    attacker.money += stolen;
    return res.json({ success: true, stolen });
  }
  res.json({ success: false });
});

// ترقية مهارة
app.post('/api/upgrade', authMiddleware, (req, res) => {
  const user = req.user;
  const { stat } = req.body;
  if (!['strength', 'stealth', 'intelligence'].includes(stat))
    return res.status(400).json({ error: 'مهارة غير صحيحة' });

  const cost = user[stat] * 5000;
  if (user.money < cost) return res.status(400).json({ error: 'مال غير كافٍ' });
  user.money -= cost;
  user[stat]++;
  res.json({ newLevel: user[stat] });
});

// تسليم النفس
app.post('/api/surrender', authMiddleware, (req, res) => {
  const user = req.user;
  user.heat = 0;
  user.jail_until = Date.now() + 2 * 60 * 1000;
  res.json({ message: 'سلّمت نفسك — ستخرج بعد دقيقتين', jail_until: user.jail_until });
});

// كود الأدمن
app.post('/api/become-admin', authMiddleware, (req, res) => {
  if (req.body.code !== ADMIN_CODE) return res.status(400).json({ error: 'كود خاطئ' });
  req.user.role = 'admin';
  res.json({ message: 'أصبحت أدمن! 👑' });
});

// ترتيب
app.get('/api/leaderboard', authMiddleware, (req, res) => {
  const sorted = [...users.values()]
    .sort((a, b) => b.money - a.money)
    .slice(0, 50)
    .map(userPublic);
  res.json(sorted);
});

// أدمن
app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  res.json([...users.values()].map(userPublic));
});

app.post('/api/admin/jail/:id', authMiddleware, adminMiddleware, (req, res) => {
  const target = users.get(req.params.id);
  if (!target) return res.status(404).json({ error: 'مستخدم غير موجود' });
  const mins = req.body.minutes || 10;
  target.jail_until = Date.now() + mins * 60 * 1000;
  res.json({ message: 'تم السجن' });
});

app.post('/api/admin/release/:id', authMiddleware, adminMiddleware, (req, res) => {
  const target = users.get(req.params.id);
  if (!target) return res.status(404).json({ error: 'مستخدم غير موجود' });
  target.jail_until = 0;
  res.json({ message: 'تم الإفراج' });
});

// صفحة اللعبة - يجب أن يكون آخر شيء
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

module.exports = app;
