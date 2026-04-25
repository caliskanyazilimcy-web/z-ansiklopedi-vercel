const TOKEN = process.env.GITHUB_TOKEN || '';
const JWT_SECRET = process.env.JWT_SECRET || 'z-ansiklopedi-gizli-anahtar-2024';

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch(e) { return null; }
}

module.exports = async function(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const url = req.url.replace('/api/posts', '');

  // LIST
  if ((url === '/list' || url === '/list/') && req.method === 'GET') {
    try {
      const r = await fetch('https://api.github.com/repos/caliskanyazilimcy-web/A-Z-ansiklopedi-/contents/uyeler', {
        headers: { 'Authorization': 'token ' + TOKEN, 'Accept': 'application/vnd.github.v3+json' }
      });
      
      if (!r.ok) {
        return res.end(JSON.stringify({ success: true, posts: [], totalPosts: 0, totalUsers: 0 }));
      }
      
      const dirs = await r.json();
      let allPosts = [];
      let totalUsers = 0;

      for (let d of dirs) {
        if (d.type === 'dir') {
          totalUsers++;
          try {
            const f = await fetch(`https://api.github.com/repos/caliskanyazilimcy-web/A-Z-ansiklopedi-/contents/uyeler/${d.name}/bilgi.json`, {
              headers: { 'Authorization': 'token ' + TOKEN, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (f.ok) {
              const fData = await f.json();
              const uData = JSON.parse(Buffer.from(fData.content, 'base64').toString());
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
      return res.end(JSON.stringify({ success: true, posts: allPosts, totalPosts: allPosts.length, totalUsers }));
    } catch(e) {
      return res.end(JSON.stringify({ success: true, posts: [], totalPosts: 0, totalUsers: 0 }));
    }
  }

  // CREATE
  if ((url === '/create' || url === '/create/') && req.method === 'POST') {
    const auth = req.headers.authorization;
    if (!auth) return res.end(JSON.stringify({ success: false, message: 'Giriş yapın' }));
    
    const payload = verifyToken(auth.replace('Bearer ', ''));
    if (!payload) return res.end(JSON.stringify({ success: false, message: 'Oturum süresi doldu' }));

    const { title, content } = req.body || {};
    if (!title) return res.end(JSON.stringify({ success: false, message: 'Başlık gerekli' }));

    try {
      const f = await fetch(`https://api.github.com/repos/caliskanyazilimcy-web/A-Z-ansiklopedi-/contents/uyeler/${payload.username}/bilgi.json`, {
        headers: { 'Authorization': 'token ' + TOKEN, 'Accept': 'application/vnd.github.v3+json' }
      });
      
      if (!f.ok) return res.end(JSON.stringify({ success: false, message: 'Kullanıcı bulunamadı' }));
      
      const fData = await f.json();
      const userData = JSON.parse(Buffer.from(fData.content, 'base64').toString());

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
      const updateRes = await fetch(`https://api.github.com/repos/caliskanyazilimcy-web/A-Z-ansiklopedi-/contents/uyeler/${payload.username}/bilgi.json`, {
        method: 'PUT',
        headers: {
          'Authorization': 'token ' + TOKEN,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'Yeni yazı: ' + title, content: newContent, sha: fData.sha })
      });

      if (updateRes.ok) {
        return res.end(JSON.stringify({ success: true, post }));
      } else {
        const err = await updateRes.json().catch(() => ({}));
        return res.end(JSON.stringify({ success: false, message: 'Kayıt hatası: ' + (err.message || '') }));
      }
    } catch(e) {
      return res.end(JSON.stringify({ success: false, message: 'Hata: ' + e.message }));
    }
  }

  // GET by ID
  if (url.startsWith('/get/') && req.method === 'GET') {
    const postId = parseInt(url.replace('/get/', ''));
    try {
      const r = await fetch('https://api.github.com/repos/caliskanyazilimcy-web/A-Z-ansiklopedi-/contents/uyeler', {
        headers: { 'Authorization': 'token ' + TOKEN, 'Accept': 'application/vnd.github.v3+json' }
      });
      const dirs = await r.json();
      
      for (let d of dirs) {
        if (d.type === 'dir') {
          const f = await fetch(`https://api.github.com/repos/caliskanyazilimcy-web/A-Z-ansiklopedi-/contents/uyeler/${d.name}/bilgi.json`, {
            headers: { 'Authorization': 'token ' + TOKEN, 'Accept': 'application/vnd.github.v3+json' }
          });
          if (f.ok) {
            const fData = await f.json();
            const uData = JSON.parse(Buffer.from(fData.content, 'base64').toString());
            const post = (uData.yazilar || []).find(p => p.id === postId);
            if (post) {
              return res.end(JSON.stringify({ success: true, post }));
            }
          }
        }
      }
      return res.end(JSON.stringify({ success: false, message: 'Yazı bulunamadı' }));
    } catch(e) {
      return res.end(JSON.stringify({ success: false, message: 'Hata' }));
    }
  }

  return res.end(JSON.stringify({ success: false, message: 'Geçersiz istek' }));
};
