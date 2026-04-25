const crypto = require('crypto');

// Token sadece Vercel'den gelecek!
const TOKEN = process.env.GITHUB_TOKEN || '';
const JWT_SECRET = process.env.JWT_SECRET || 'z-ansiklopedi-gizli-anahtar-2024';

function createToken(user) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const payload = Buffer.from(JSON.stringify({
    username: user.username,
    isAdmin: user.isAdmin,
    exp: Math.floor(Date.now() / 1000) + 86400
  })).toString('base64');
  const signature = crypto.createHmac('sha256', JWT_SECRET)
    .update(header + '.' + payload)
    .digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return header + '.' + payload + '.' + signature;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch(e) { return null; }
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'z-tuz-2024').digest('hex');
}

module.exports = async function(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const url = req.url.replace('/api/auth', '');
  
  // Body parse
  let body = {};
  if (req.method === 'POST') {
    try {
      body = req.body || {};
    } catch(e) { body = {}; }
  }

  // REGISTER
  if ((url === '/register' || url === '/register/') && req.method === 'POST') {
    const { username, password } = body;
    
    if (!username || !password) {
      return res.end(JSON.stringify({ success: false, message: 'Tüm alanları doldurun' }));
    }
    
    if (!TOKEN) {
      return res.end(JSON.stringify({ success: false, message: 'Sunucu hatası: Token bulunamadı' }));
    }

    try {
      const userData = {
        username,
        password: hashPassword(password),
        yazilar: [],
        profile: { avatar: '', youtube: '', facebook: '', whatsapp: '' },
        verified: false,
        bannedUntil: null
      };

      const content = Buffer.from(JSON.stringify(userData, null, 2)).toString('base64');
      
      const r = await fetch(`https://api.github.com/repos/caliskanyazilimcy-web/A-Z-ansiklopedi-/contents/uyeler/${username}/bilgi.json`, {
        method: 'PUT',
        headers: {
          'Authorization': 'token ' + TOKEN,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'Yeni kayıt: ' + username, content })
      });

      if (r.ok) {
        return res.end(JSON.stringify({ success: true, message: 'Kayıt başarılı! Giriş yapabilirsiniz.' }));
      } else {
        const err = await r.json().catch(() => ({}));
        return res.end(JSON.stringify({ success: false, message: 'Kayıt başarısız: ' + (err.message || 'Sunucu hatası') }));
      }
    } catch(e) {
      return res.end(JSON.stringify({ success: false, message: 'Hata: ' + e.message }));
    }
  }

  // LOGIN
  if ((url === '/login' || url === '/login/') && req.method === 'POST') {
    const { username, password } = body;
    
    if (!username || !password) {
      return res.end(JSON.stringify({ success: false, message: 'Tüm alanları doldurun' }));
    }

    try {
      const r = await fetch(`https://api.github.com/repos/caliskanyazilimcy-web/A-Z-ansiklopedi-/contents/uyeler/${username}/bilgi.json`, {
        headers: { 'Authorization': 'token ' + TOKEN, 'Accept': 'application/vnd.github.v3+json' }
      });

      if (!r.ok) {
        return res.end(JSON.stringify({ success: false, message: 'Kullanıcı bulunamadı' }));
      }

      const file = await r.json();
      const user = JSON.parse(Buffer.from(file.content, 'base64').toString());
      
      if (user.password !== hashPassword(password)) {
        return res.end(JSON.stringify({ success: false, message: 'Şifre hatalı' }));
      }

      if (user.bannedUntil && new Date(user.bannedUntil).getTime() > Date.now()) {
        return res.end(JSON.stringify({ success: false, message: 'Hesabınız engellenmiş!' }));
      }

      const ADMINS = (process.env.ADMINS || 'admin,caliskanyazilimcy-web').split(',');
      const token = createToken({ username, isAdmin: ADMINS.includes(username) });

      return res.end(JSON.stringify({
        success: true,
        token,
        user: { username: user.username, isAdmin: ADMINS.includes(username), profile: user.profile || {} }
      }));
    } catch(e) {
      return res.end(JSON.stringify({ success: false, message: 'Hata: ' + e.message }));
    }
  }

  // ME
  if ((url === '/me' || url === '/me/') && req.method === 'GET') {
    const auth = req.headers.authorization;
    if (!auth) return res.end(JSON.stringify({ success: false }));
    
    const payload = verifyToken(auth.replace('Bearer ', ''));
    if (!payload) return res.end(JSON.stringify({ success: false }));
    
    return res.end(JSON.stringify({ success: true, user: payload }));
  }

  return res.end(JSON.stringify({ success: false, message: 'Geçersiz istek' }));
};
