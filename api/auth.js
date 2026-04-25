const crypto = require('crypto');
const JWT_SECRET = process.env.JWT_SECRET || 'z-ansiklopedi-gizli-anahtar-2024';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'caliskanyazilimcy-web';
const GITHUB_REPO = process.env.GITHUB_REPO || 'A-Z-ansiklopedi-';

function createToken(user) {
  const payload = JSON.stringify({ username: user.username, isAdmin: user.isAdmin, exp: Date.now() + 86400000 });
  const hash = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
  return Buffer.from(payload).toString('base64') + '.' + hash;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[0], 'base64').toString());
    if (payload.exp < Date.now()) return null;
    const hash = crypto.createHmac('sha256', JWT_SECRET).update(JSON.stringify(payload)).digest('hex');
    if (hash !== parts[1]) return null;
    return payload;
  } catch(e) { return null; }
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'z-tuz-2024').digest('hex');
}

async function ghAPI(path, method = 'GET', body = null) {
  const options = {
    method,
    headers: { 'Authorization': 'token ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github.v3+json' }
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, options);
  return res;
}

async function getUserData(username) {
  const res = await ghAPI(`uyeler/${username}/bilgi.json`);
  if (!res.ok) return null;
  const file = await res.json();
  return JSON.parse(Buffer.from(file.content, 'base64').toString());
}

async function saveUserData(userData) {
  const check = await ghAPI(`uyeler/${userData.username}/bilgi.json`);
  if (!check.ok) {
    // Yeni kullanıcı
    const content = Buffer.from(JSON.stringify(userData)).toString('base64');
    return ghAPI(`uyeler/${userData.username}/bilgi.json`, 'PUT', { message: 'Yeni kayıt', content });
  }
  const fileData = await check.json();
  const content = Buffer.from(JSON.stringify(userData)).toString('base64');
  return ghAPI(`uyeler/${userData.username}/bilgi.json`, 'PUT', { message: 'Güncelleme', content, sha: fileData.sha });
}

module.exports = async function(req, res) {
  const path = req.url.replace('/api/auth', '');
  res.setHeader('Content-Type', 'application/json');

  // LOGIN
  if ((path === '/login' || path === '/login/') && req.method === 'POST') {
    const { username, password } = req.body || {};
    if (!username || !password) {
      res.end(JSON.stringify({ success: false, message: 'Tüm alanları doldurun' }));
      return;
    }
    const userData = await getUserData(username);
    if (!userData) {
      res.end(JSON.stringify({ success: false, message: 'Kullanıcı bulunamadı' }));
      return;
    }
    if (userData.password !== hashPassword(password)) {
      res.end(JSON.stringify({ success: false, message: 'Şifre hatalı' }));
      return;
    }
    const ADMINS = (process.env.ADMINS || 'admin,caliskanyazilimcy-web').split(',');
    userData.isAdmin = ADMINS.includes(username);
    const token = createToken(userData);
    res.end(JSON.stringify({
      success: true,
      token,
      user: { username: userData.username, isAdmin: userData.isAdmin, profile: userData.profile || {} }
    }));
    return;
  }

  // REGISTER
  if ((path === '/register' || path === '/register/') && req.method === 'POST') {
    const { username, password } = req.body || {};
    if (!username || !password) {
      res.end(JSON.stringify({ success: false, message: 'Tüm alanları doldurun' }));
      return;
    }
    if (username.length < 3) {
      res.end(JSON.stringify({ success: false, message: 'Kullanıcı adı en az 3 karakter' }));
      return;
    }
    const existing = await getUserData(username);
    if (existing) {
      res.end(JSON.stringify({ success: false, message: 'Bu kullanıcı adı alınmış' }));
      return;
    }
    const ADMINS = (process.env.ADMINS || 'admin,caliskanyazilimcy-web').split(',');
    const userData = {
      username,
      password: hashPassword(password),
      yazilar: [],
      profile: { avatar: '', youtube: '', facebook: '', whatsapp: '' },
      verified: false,
      bannedUntil: null,
      isAdmin: ADMINS.includes(username)
    };
    await saveUserData(userData);
    res.end(JSON.stringify({ success: true, message: 'Kayıt başarılı' }));
    return;
  }

  // ME
  if ((path === '/me' || path === '/me/') && req.method === 'GET') {
    const auth = req.headers.authorization;
    if (!auth) { res.end(JSON.stringify({ success: false })); return; }
    const payload = verifyToken(auth.replace('Bearer ', ''));
    if (!payload) { res.end(JSON.stringify({ success: false })); return; }
    res.end(JSON.stringify({ success: true, user: payload }));
    return;
  }

  res.end(JSON.stringify({ success: false, message: 'Geçersiz istek' }));
};
