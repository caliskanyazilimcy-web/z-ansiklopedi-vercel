const fs = require('fs');
const path = require('path');
const authHandler = require('./auth');
const postsHandler = require('./posts');

module.exports = async function(req, res) {
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

  // Ana sayfa - index.html dosyasını oku
  try {
    const htmlPath = path.join(__dirname, '..', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  } catch(e) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Z-Ansiklopedi</title></head><body style="font-family:Arial;text-align:center;padding:50px;"><h1>📚 Z-Ansiklopedi</h1><p>Sunucu çalışıyor!</p><p style="color:red;">index.html bulunamadı: ${e.message}</p></body></html>`);
  }
}

// Admin handler
async function adminHandler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const auth = req.headers.authorization;
  if (!auth) {
    res.end(JSON.stringify({ success: false, message: 'Yetki gerekli' }));
    return;
  }
  res.end(JSON.stringify({ success: true, message: 'Admin API' }));
}
