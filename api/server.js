const authHandler = require('./auth');
const postsHandler = require('./posts');

module.exports = async function(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  // Body parse
  if (req.method === 'POST' || req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try { req.body = JSON.parse(body || '{}'); } catch(e) { req.body = {}; }
      await router(req, res);
    });
  } else {
    await router(req, res);
  }
};

async function router(req, res) {
  const url = req.url;

  // API routes
  if (url.startsWith('/api/auth')) return authHandler(req, res);
  if (url.startsWith('/api/posts')) return postsHandler(req, res);
  if (url.startsWith('/api/admin')) return adminHandler(req, res);

  // Ana sayfa - HTML gönder
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Z-Ansiklopedi</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
    .card { background: white; padding: 40px; border-radius: 16px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #1a73e8; }
    p { color: #666; }
    .btn { display: inline-block; padding: 12px 30px; background: #1a73e8; color: white; text-decoration: none; border-radius: 50px; margin-top: 20px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="card">
    <h1>📚 Z-Ansiklopedi</h1>
    <p>Sunucu çalışıyor! Frontend yakında burada olacak.</p>
    <p style="font-size:0.8rem;">API: <code>/api/auth</code> | <code>/api/posts</code> | <code>/api/admin</code></p>
    <a href="/api/posts/list" class="btn">API Test</a>
  </div>
</body>
</html>`;
  res.end(html);
}

// Admin handler
async function adminHandler(req, res) {
  const url = req.url.replace('/api/admin', '');
  res.setHeader('Content-Type', 'application/json');

  const result = await authHandler.verifyRequest(req);
  if (!result || !result.isAdmin) {
    res.statusCode = 401;
    res.end(JSON.stringify({ success: false, message: 'Admin yetkisi gerekli' }));
    return;
  }

  if (url === '/flags' && req.method === 'GET') {
    const reports = await loadReports();
    res.end(JSON.stringify({ success: true, reports: reports || [] }));
  } else {
    res.end(JSON.stringify({ success: true, message: 'Admin API hazır' }));
  }
}

async function loadReports() {
  try {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER || 'caliskanyazilimcy-web';
    const repo = process.env.GITHUB_REPO || 'A-Z-ansiklopedi-';
    
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/reports/bildirimler.json`, {
      headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!res.ok) return [];
    const file = await res.json();
    return JSON.parse(Buffer.from(file.content, 'base64').toString());
  } catch(e) { return []; }
}

// Auth handler'a verifyRequest ekle
authHandler.verifyRequest = async function(req) {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const token = auth.replace('Bearer ', '');
  const crypto = require('crypto');
  const JWT_SECRET = process.env.JWT_SECRET || 'z-ansiklopedi-gizli-anahtar-2024';
  try {
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[0], 'base64').toString());
    if (payload.exp < Date.now()) return null;
    const hash = crypto.createHmac('sha256', JWT_SECRET).update(JSON.stringify(payload)).digest('hex');
    if (hash !== parts[1]) return null;
    return payload;
  } catch(e) { return null; }
};
