#!/usr/bin/env node
const crypto = require('crypto');
const jwt = crypto.randomBytes(64).toString('base64');
const jwtR = crypto.randomBytes(64).toString('base64');
const cookie = crypto.randomBytes(32).toString('hex');
console.log('\n\u{1F510} Secrets FormaPro \u2014 COPIEZ dans Railway/Render/Vercel\n');
console.log('JWT_SECRET=' + jwt);
console.log('JWT_REFRESH_SECRET=' + jwtR);
console.log('COOKIE_SECRET=' + cookie);
console.log('\n\u26A0\uFE0F  Ne jamais committer ces valeurs dans Git.\n');
