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

  if (req.method === 'POST' || req.method === 'PUT') {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', async () => {
      try { req.body = JSON.parse(raw || '{}'); } catch(e) { req.body = {}; }
      await router(req, res);
    });
  } else {
    await router(req, res);
  }
};

async function router(req, res) {
  const url = req.url;

  if (url.startsWith('/api/auth')) return authHandler(req, res);
  if (url.startsWith('/api/posts')) return postsHandler(req, res);

  // Ana sayfa
  try {
    const htmlPath = path.join(__dirname, '..', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  } catch(e) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<h1>Z-Ansiklopedi</h1><p>index.html bulunamadı</p>');
  }
}
