// API Route: /api/auth/*
const crypto = require('crypto');

// GİZLİ ANAHTAR (JWT için - sadece sunucuda!)
const JWT_SECRET = process.env.JWT_SECRET || "z-ansiklopedi-gizli-anahtar-2024";

// GitHub token (sadece sunucuda, kullanıcı asla göremez!)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || "caliskanyazilimcy-web";
const GITHUB_REPO = process.env.GITHUB_REPO || "A-Z-ansiklopedi-";

// Basit JWT
function createToken(user) {
  const payload = JSON.stringify({ username: user.username, isAdmin: user.isAdmin, exp: Date.now() + 86400000 });
  const hash = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
  return Buffer.from(payload).toString('base64') + '.' + hash;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[0], 'base64').toString());
    if (payload.exp < Date.now()) return null;
    const hash = crypto.createHmac('sha256', JWT_SECRET).update(JSON.stringify(payload)).digest('hex');
    if (hash !== parts[1]) return null;
    return payload;
  } catch(e) {
    return null;
  }
}

// Şifre hashleme
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + "z-tuz-2024").digest('hex');
}

// GitHub API çağrısı
async function ghAPI(path, method = "GET", body = null) {
  const options = {
    method,
    headers: {
      "Authorization": "token " + GITHUB_TOKEN,
      "Accept": "application/vnd.github.v3+json"
    }
  };
  if (body) options.body = JSON.stringify(body);
  
  const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, options);
  return response;
}

// Kullanıcı dosyasını oku
async function getUserData(username) {
  const response = await ghAPI(`uyeler/${username}/bilgi.json`);
  if (!response.ok) return null;
  const file = await response.json();
  return JSON.parse(decodeURIComponent(escape(Buffer.from(file.content, 'base64').toString())));
}

// Kullanıcı dosyasını kaydet
async function saveUserData(userData) {
  const check = await ghAPI(`uyeler/${userData.username}/bilgi.json`);
  const fileData = await check.json();
  const content = Buffer.from(unescape(encodeURIComponent(JSON.stringify(userData)))).toString('base64');
  return ghAPI(`uyeler/${userData.username}/bilgi.json`, "PUT", {
    message: "Güncelleme",
    content: content,
    sha: fileData.sha
  });
}

// Ana handler
module.exports = async function(req, res) {
  const { method, url } = req;
  const path = url.replace('/api/auth', '');
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  
  // LOGIN
  if (path === '/login' && method === 'POST') {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.end(JSON.stringify({ success: false, message: "Kullanıcı adı ve şifre gerekli" }));
    }
    
    const userData = await getUserData(username);
    if (!userData) {
      return res.end(JSON.stringify({ success: false, message: "Kullanıcı bulunamadı" }));
    }
    
    if (userData.password !== hashPassword(password)) {
      return res.end(JSON.stringify({ success: false, message: "Şifre hatalı" }));
    }
    
    // Admin kontrolü
    const ADMINS = (process.env.ADMINS || "admin,caliskanyazilimcy-web").split(',');
    userData.isAdmin = ADMINS.includes(username);
    
    const token = createToken(userData);
    
    return res.end(JSON.stringify({
      success: true,
      token,
      user: {
        username: userData.username,
        isAdmin: userData.isAdmin,
        profile: userData.profile || {}
      }
    }));
  }
  
  // REGISTER
  if (path === '/register' && method === 'POST') {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.end(JSON.stringify({ success: false, message: "Tüm alanları doldurun" }));
    }
    
    if (username.length < 3) {
      return res.end(JSON.stringify({ success: false, message: "Kullanıcı adı en az 3 karakter olmalı" }));
    }
    
    const existing = await getUserData(username);
    if (existing) {
      return res.end(JSON.stringify({ success: false, message: "Bu kullanıcı adı alınmış" }));
    }
    
    const ADMINS = (process.env.ADMINS || "admin,caliskanyazilimcy-web").split(',');
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
    
    return res.end(JSON.stringify({ success: true, message: "Kayıt başarılı" }));
  }
  
  // ME (kullanıcı bilgisi)
  if (path === '/me' && method === 'GET') {
    const auth = req.headers.authorization;
    if (!auth) return res.end(JSON.stringify({ success: false }));
    
    const token = auth.replace('Bearer ', '');
    const payload = verifyToken(token);
    if (!payload) return res.end(JSON.stringify({ success: false }));
    
    return res.end(JSON.stringify({
      success: true,
      user: {
        username: payload.username,
        isAdmin: payload.isAdmin
      }
    }));
  }
  
  return res.end(JSON.stringify({ success: false, message: "Geçersiz istek" }));
};