// Ana sunucu - Tüm istekleri yönlendirir
const authHandler = require('./auth');
const postsHandler = require('./posts');

module.exports = async function(req, res) {
  // CORS header'ları
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // OPTIONS isteği (CORS preflight)
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }
  
  // JSON body parse
  if (req.method === 'POST' || req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        req.body = JSON.parse(body || '{}');
      } catch(e) {
        req.body = {};
      }
      await handleRequest(req, res);
    });
  } else {
    await handleRequest(req, res);
  }
};

async function handleRequest(req, res) {
  const url = req.url;
  
  // Auth işlemleri
  if (url.startsWith('/api/auth')) {
    return authHandler(req, res);
  }
  
  // Yazı işlemleri
  if (url.startsWith('/api/posts')) {
    return postsHandler(req, res);
  }
  
  // Admin işlemleri
  if (url.startsWith('/api/admin')) {
    return adminHandler(req, res);
  }
  
  // Ana sayfa
  res.setHeader('Content-Type', 'text/html');
  const fs = require('fs');
  const path = require('path');
  const htmlPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf-8');
  return res.end(html);
}

// Admin handler
async function adminHandler(req, res) {
  const crypto = require('crypto');
  const JWT_SECRET = process.env.JWT_SECRET || "z-ansiklopedi-gizli-anahtar-2024";
  const ADMINS = (process.env.ADMINS || "admin,caliskanyazilimcy-web").split(',');
  
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
  
  const auth = req.headers.authorization;
  if (!auth) return res.end(JSON.stringify({ success: false, message: "Yetki gerekli" }));
  
  const payload = verifyToken(auth.replace('Bearer ', ''));
  if (!payload || !ADMINS.includes(payload.username)) {
    return res.end(JSON.stringify({ success: false, message: "Admin yetkisi gerekli" }));
  }
  
  // İstatistikler
  if (req.url === '/api/admin/stats') {
    return res.end(JSON.stringify({
      success: true,
      message: "Admin paneline hoş geldiniz",
      totalUsers: 0,
      totalPosts: 0
    }));
  }
  
  return res.end(JSON.stringify({ success: false }));
}