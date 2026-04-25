const crypto = require('crypto');
const JWT_SECRET = process.env.JWT_SECRET || 'z-ansiklopedi-gizli-anahtar-2024';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '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';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'caliskanyazilimcy-web';
const GITHUB_REPO = process.env.GITHUB_REPO || 'A-Z-ansiklopedi-';

function createToken(user) {
  const payload = JSON.stringify({ username: user.username, isAdmin: user.isAdmin, exp: Date.now() + 86400000 });
  const hash = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
  return Buffer.from(payload).toString('base64') + '.' + hash;
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

// Büyük dosyaları okumak için özel fonksiyon
async function getFileContent(filePath) {
  const response = await ghAPI(filePath);
  if (!response.ok) return null;

  const fileData = await response.json();

  // Dosya 1MB'den büyükse git_url ile al
  if (fileData.size > 1000000 && fileData.git_url) {
    const gitResponse = await fetch(fileData.git_url, {
      headers: { 'Authorization': 'token ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!gitResponse.ok) return null;
    const gitData = await gitResponse.json();
    return JSON.parse(Buffer.from(gitData.content, 'base64').toString());
  }

  // Küçük dosyalar için doğrudan content
  if (fileData.content) {
    return JSON.parse(Buffer.from(fileData.content, 'base64').toString());
  }

  return null;
}

async function getUserData(username) {
  return await getFileContent(`uyeler/${username}/bilgi.json`);
}

async function saveUserData(userData) {
  const check = await ghAPI(`uyeler/${userData.username}/bilgi.json`);
  const content = Buffer.from(JSON.stringify(userData, null, 2)).toString('base64');

  if (check.ok) {
    const fileData = await check.json();
    return ghAPI(`uyeler/${userData.username}/bilgi.json`, 'PUT', {
      message: 'Profil güncellendi',
      content: content,
      sha: fileData.sha
    });
  } else {
    return ghAPI(`uyeler/${userData.username}/bilgi.json`, 'PUT', {
      message: 'Yeni kullanıcı kaydı',
      content: content
    });
  }
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

    try {
      const userData = await getUserData(username);
      
      if (!userData) {
        res.end(JSON.stringify({ success: false, message: 'Kullanıcı bulunamadı' }));
        return;
      }

      const hashedInput = hashPassword(password);
      
      if (userData.password !== hashedInput) {
        res.end(JSON.stringify({ success: false, message: 'Şifre hatalı' }));
        return;
      }

      // Ban kontrolü
      if (userData.bannedUntil && new Date(userData.bannedUntil).getTime() > Date.now()) {
        res.end(JSON.stringify({ success: false, message: 'Hesabınız ' + new Date(userData.bannedUntil).toLocaleDateString('tr-TR') + ' tarihine kadar engellenmiş!' }));
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
    } catch(e) {
      res.end(JSON.stringify({ success: false, message: 'Giriş hatası: ' + e.message }));
    }
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
      res.end(JSON.stringify({ success: false, message: 'Kullanıcı adı en az 3 karakter olmalı' }));
      return;
    }

    if (password.length < 3) {
      res.end(JSON.stringify({ success: false, message: 'Şifre en az 3 karakter olmalı' }));
      return;
    }

    try {
      const existing = await getUserData(username);
      if (existing) {
        res.end(JSON.stringify({ success: false, message: 'Bu kullanıcı adı zaten alınmış!' }));
        return;
      }

      const ADMINS = (process.env.ADMINS || 'admin,caliskanyazilimcy-web').split(',');
      
      const userData = {
        username: username,
        password: hashPassword(password),
        yazilar: [],
        profile: { avatar: '', youtube: '', facebook: '', whatsapp: '' },
        verified: false,
        bannedUntil: null,
        isAdmin: ADMINS.includes(username)
      };

      const saveResult = await saveUserData(userData);
      
      if (saveResult.ok) {
        res.end(JSON.stringify({ success: true, message: 'Kayıt başarılı! Giriş yapabilirsiniz.' }));
      } else {
        const err = await saveResult.json();
        res.end(JSON.stringify({ success: false, message: 'Kayıt başarısız: ' + (err.message || 'Bilinmeyen hata') }));
      }
    } catch(e) {
      res.end(JSON.stringify({ success: false, message: 'Kayıt hatası: ' + e.message }));
    }
    return;
  }

  // ME
  if ((path === '/me' || path === '/me/') && req.method === 'GET') {
    const auth = req.headers.authorization;
    if (!auth) { res.end(JSON.stringify({ success: false })); return; }
    
    const token = auth.replace('Bearer ', '');
    try {
      const parts = token.split('.');
      if (parts.length < 2) { res.end(JSON.stringify({ success: false })); return; }
      
      const payload = JSON.parse(Buffer.from(parts[0], 'base64').toString());
      
      if (payload.exp < Date.now()) {
        res.end(JSON.stringify({ success: false, message: 'Oturum süresi doldu' }));
        return;
      }
      
      const hash = crypto.createHmac('sha256', JWT_SECRET).update(JSON.stringify(payload)).digest('hex');
      if (hash !== parts[1]) { res.end(JSON.stringify({ success: false })); return; }
      
      res.end(JSON.stringify({ success: true, user: payload }));
    } catch(e) {
      res.end(JSON.stringify({ success: false }));
    }
    return;
  }

  res.end(JSON.stringify({ success: false, message: 'Geçersiz istek' }));
};
