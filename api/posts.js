const crypto = require('crypto');
const JWT_SECRET = process.env.JWT_SECRET || 'z-ansiklopedi-gizli-anahtar-2024';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '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';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'caliskanyazilimcy-web';
const GITHUB_REPO = process.env.GITHUB_REPO || 'A-Z-ansiklopedi-';

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

  if (fileData.size > 1000000 && fileData.git_url) {
    const gitResponse = await fetch(fileData.git_url, {
      headers: { 'Authorization': 'token ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!gitResponse.ok) return null;
    const gitData = await gitResponse.json();
    return JSON.parse(Buffer.from(gitData.content, 'base64').toString());
  }

  if (fileData.content) {
    return JSON.parse(Buffer.from(fileData.content, 'base64').toString());
  }

  return null;
}

module.exports = async function(req, res) {
  const path = req.url.replace('/api/posts', '');
  res.setHeader('Content-Type', 'application/json');

  // LIST
  if ((path === '/list' || path === '/list/') && req.method === 'GET') {
    try {
      const response = await ghAPI('uyeler');
      if (!response.ok) {
        res.end(JSON.stringify({ success: true, posts: [], totalPosts: 0, totalUsers: 0 }));
        return;
      }
      const dirs = await response.json();
      let allPosts = [];
      let totalUsers = 0;

      for (let d of dirs) {
        if (d.type === 'dir') {
          totalUsers++;
          try {
            const f = await ghAPI(`uyeler/${d.name}/bilgi.json`);
            if (f.ok) {
              const fData = await f.json();
              // Büyük dosya kontrolü
              let uData;
              if (fData.size > 1000000 && fData.git_url) {
                const gitRes = await fetch(fData.git_url, {
                  headers: { 'Authorization': 'token ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github.v3+json' }
                });
                const gitData = await gitRes.json();
                uData = JSON.parse(Buffer.from(gitData.content, 'base64').toString());
              } else {
                uData = JSON.parse(Buffer.from(fData.content, 'base64').toString());
              }
              (uData.yazilar || []).forEach(p => {
                allPosts.push({ 
                  id: p.id, title: p.title, content: p.content, 
                  author: p.author, date: p.date, reads: p.reads || 0 
                });
              });
            }
          } catch(e) {}
        }
      }

      allPosts.sort((a, b) => (b.id || 0) - (a.id || 0));
      res.end(JSON.stringify({ success: true, posts: allPosts, totalPosts: allPosts.length, totalUsers }));
    } catch(e) {
      res.end(JSON.stringify({ success: true, posts: [], totalPosts: 0, totalUsers: 0 }));
    }
    return;
  }

  // GET by ID
  if (path.startsWith('/get/') && req.method === 'GET') {
    const postId = parseInt(path.replace('/get/', ''));
    try {
      const response = await ghAPI('uyeler');
      const dirs = await response.json();
      for (let d of dirs) {
        if (d.type === 'dir') {
          const uData = await getFileContent(`uyeler/${d.name}/bilgi.json`);
          if (uData) {
            const post = (uData.yazilar || []).find(p => p.id === postId);
            if (post) {
              post.reads = (post.reads || 0) + 1;
              const newContent = Buffer.from(JSON.stringify(uData, null, 2)).toString('base64');
              const f = await ghAPI(`uyeler/${d.name}/bilgi.json`);
              const fData = await f.json();
              await ghAPI(`uyeler/${d.name}/bilgi.json`, 'PUT', {
                message: 'Okunma sayısı',
                content: newContent,
                sha: fData.sha
              });
              res.end(JSON.stringify({ success: true, post }));
              return;
            }
          }
        }
      }
      res.end(JSON.stringify({ success: false, message: 'Yazı bulunamadı' }));
    } catch(e) {
      res.end(JSON.stringify({ success: false, message: 'Hata: ' + e.message }));
    }
    return;
  }

  // CREATE
  if ((path === '/create' || path === '/create/') && req.method === 'POST') {
    const auth = req.headers.authorization;
    if (!auth) { res.end(JSON.stringify({ success: false, message: 'Giriş yapın' })); return; }
    
    const payload = verifyToken(auth.replace('Bearer ', ''));
    if (!payload) { res.end(JSON.stringify({ success: false, message: 'Oturum süresi doldu' })); return; }

    const { title, content } = req.body || {};
    if (!title) { res.end(JSON.stringify({ success: false, message: 'Başlık gerekli' })); return; }

    try {
      const userData = await getFileContent(`uyeler/${payload.username}/bilgi.json`);
      if (!userData) {
        res.end(JSON.stringify({ success: false, message: 'Kullanıcı bulunamadı' }));
        return;
      }

      const post = {
        id: Date.now(),
        title,
        content: content || '',
        plain: (content || '').replace(/<[^>]*>/g, '').trim(),
        author: payload.username,
        date: new Date().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' }),
        reads: 0
      };

      userData.yazilar = userData.yazilar || [];
      userData.yazilar.unshift(post);
      
      const newContent = Buffer.from(JSON.stringify(userData, null, 2)).toString('base64');
      const f = await ghAPI(`uyeler/${payload.username}/bilgi.json`);
      const fData = await f.json();
      const updateRes = await ghAPI(`uyeler/${payload.username}/bilgi.json`, 'PUT', {
        message: `Yeni yazı: ${title}`,
        content: newContent,
        sha: fData.sha
      });

      if (updateRes.ok) {
        res.end(JSON.stringify({ success: true, post }));
      } else {
        const err = await updateRes.json();
        res.end(JSON.stringify({ success: false, message: 'Kayıt hatası: ' + (err.message || '') }));
      }
    } catch(e) {
      res.end(JSON.stringify({ success: false, message: 'Yayınlama hatası: ' + e.message }));
    }
    return;
  }

  // DELETE
  if (path.startsWith('/delete/') && req.method === 'DELETE') {
    const auth = req.headers.authorization;
    if (!auth) { res.end(JSON.stringify({ success: false, message: 'Giriş yapın' })); return; }
    
    const payload = verifyToken(auth.replace('Bearer ', ''));
    if (!payload) { res.end(JSON.stringify({ success: false, message: 'Oturum süresi doldu' })); return; }

    const postId = parseInt(path.replace('/delete/', ''));
    
    try {
      const userData = await getFileContent(`uyeler/${payload.username}/bilgi.json`);
      userData.yazilar = (userData.yazilar || []).filter(p => p.id !== postId);
      
      const newContent = Buffer.from(JSON.stringify(userData, null, 2)).toString('base64');
      const f = await ghAPI(`uyeler/${payload.username}/bilgi.json`);
      const fData = await f.json();
      await ghAPI(`uyeler/${payload.username}/bilgi.json`, 'PUT', {
        message: 'Yazı silindi',
        content: newContent,
        sha: fData.sha
      });
      
      res.end(JSON.stringify({ success: true }));
    } catch(e) {
      res.end(JSON.stringify({ success: false, message: 'Silme hatası' }));
    }
    return;
  }

  // REPORT
  if ((path === '/report' || path === '/report/') && req.method === 'POST') {
    const auth = req.headers.authorization;
    if (!auth) { res.end(JSON.stringify({ success: false, message: 'Giriş yapın' })); return; }
    
    const payload = verifyToken(auth.replace('Bearer ', ''));
    if (!payload) { res.end(JSON.stringify({ success: false, message: 'Oturum süresi doldu' })); return; }

    const { postId, author, reason, description } = req.body || {};
    
    try {
      let reports = [];
      const checkData = await getFileContent('reports/bildirimler.json');
      if (checkData) {
        reports = checkData;
      }

      reports.push({
        id: Date.now(),
        postId, author, reason,
        description: description || '',
        reporter: payload.username,
        date: new Date().toLocaleDateString('tr-TR'),
        status: 'pending'
      });

      const newContent = Buffer.from(JSON.stringify(reports, null, 2)).toString('base64');
      
      const check = await ghAPI('reports/bildirimler.json');
      if (check.ok) {
        const fData = await check.json();
        await ghAPI('reports/bildirimler.json', 'PUT', {
          message: 'Yeni şikayet',
          content: newContent,
          sha: fData.sha
        });
      } else {
        await ghAPI('reports/bildirimler.json', 'PUT', {
          message: 'İlk şikayet',
          content: newContent
        });
      }
      
      res.end(JSON.stringify({ success: true, message: 'Şikayet alındı' }));
    } catch(e) {
      res.end(JSON.stringify({ success: false, message: 'Hata: ' + e.message }));
    }
    return;
  }

  res.end(JSON.stringify({ success: false, message: 'Geçersiz istek: ' + path }));
};
