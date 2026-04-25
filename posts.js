const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || "z-ansiklopedi-gizli-anahtar-2024";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || "caliskanyazilimcy-web";
const GITHUB_REPO = process.env.GITHUB_REPO || "A-Z-ansiklopedi-";

function verifyToken(token) {
  try {
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[0], 'base64').toString());
    if (payload.exp < Date.now()) return null;
    const hash = crypto.createHmac('sha256', JWT_SECRET).update(JSON.stringify(payload)).digest('hex');
    if (hash !== parts[1]) return null;
    return payload;
  } catch(e) { return null; }
}

async function ghAPI(path, method = "GET", body = null) {
  const options = {
    method,
    headers: { "Authorization": "token " + GITHUB_TOKEN, "Accept": "application/vnd.github.v3+json" }
  };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, options);
  return response;
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  
  const path = req.url.replace('/api/posts', '');
  
  // TÜM YAZILARI LİSTELE
  if (path === '/list' && req.method === 'GET') {
    try {
      const response = await ghAPI("uyeler");
      if (!response.ok) {
        return res.end(JSON.stringify({ success: true, posts: [], totalPosts: 0, totalUsers: 0 }));
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
              const uData = JSON.parse(decodeURIComponent(escape(Buffer.from(fData.content, 'base64').toString())));
              uData.yazilar.forEach(p => {
                allPosts.push({
                  id: p.id,
                  title: p.title,
                  content: p.content,
                  author: p.author,
                  date: p.date,
                  reads: p.reads || 0
                });
              });
            }
          } catch(e) {}
        }
      }
      
      allPosts.sort((a, b) => b.id - a.id);
      
      return res.end(JSON.stringify({
        success: true,
        posts: allPosts,
        totalPosts: allPosts.length,
        totalUsers
      }));
    } catch(e) {
      return res.end(JSON.stringify({ success: false, message: "Veri yüklenemedi" }));
    }
  }
  
  // YAZI DETAY
  if (path.startsWith('/get/') && req.method === 'GET') {
    const postId = parseInt(path.replace('/get/', ''));
    
    try {
      const response = await ghAPI("uyeler");
      const dirs = await response.json();
      
      for (let d of dirs) {
        if (d.type === 'dir') {
          const f = await ghAPI(`uyeler/${d.name}/bilgi.json`);
          if (f.ok) {
            const fData = await f.json();
            const uData = JSON.parse(decodeURIComponent(escape(Buffer.from(fData.content, 'base64').toString())));
            const post = uData.yazilar.find(p => p.id === postId);
            if (post) {
              return res.end(JSON.stringify({ success: true, post }));
            }
          }
        }
      }
      
      return res.end(JSON.stringify({ success: false, message: "Yazı bulunamadı" }));
    } catch(e) {
      return res.end(JSON.stringify({ success: false, message: "Hata" }));
    }
  }
  
  // YENİ YAZI
  if (path === '/create' && req.method === 'POST') {
    const auth = req.headers.authorization;
    if (!auth) return res.end(JSON.stringify({ success: false, message: "Giriş yapın" }));
    
    const payload = verifyToken(auth.replace('Bearer ', ''));
    if (!payload) return res.end(JSON.stringify({ success: false, message: "Oturum süresi dolmuş" }));
    
    const { title, content } = req.body;
    if (!title) return res.end(JSON.stringify({ success: false, message: "Başlık gerekli" }));
    
    try {
      const f = await ghAPI(`uyeler/${payload.username}/bilgi.json`);
      const fData = await f.json();
      const userData = JSON.parse(decodeURIComponent(escape(Buffer.from(fData.content, 'base64').toString())));
      
      const post = {
        id: Date.now(),
        title,
        content,
        plain: content.replace(/<[^>]*>/g, '').trim(),
        author: payload.username,
        date: new Date().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' }),
        reads: 0
      };
      
      userData.yazilar.unshift(post);
      const newContent = Buffer.from(unescape(encodeURIComponent(JSON.stringify(userData)))).toString('base64');
      await ghAPI(`uyeler/${payload.username}/bilgi.json`, "PUT", {
        message: `Yeni yazı: ${title}`,
        content: newContent,
        sha: fData.sha
      });
      
      return res.end(JSON.stringify({ success: true, post }));
    } catch(e) {
      return res.end(JSON.stringify({ success: false, message: "Yayınlama hatası" }));
    }
  }
  
  return res.end(JSON.stringify({ success: false, message: "Geçersiz istek" }));
};