const encoder = new TextEncoder();

function toBase64Url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64Url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Uint8Array.from(atob(str), c => c.charCodeAt(0)).buffer;
}

export async function createToken(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const b64Header = toBase64Url(encoder.encode(JSON.stringify(header)));
  const b64Payload = toBase64Url(encoder.encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 2592000 })));
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(b64Header + '.' + b64Payload));
  return b64Header + '.' + b64Payload + '.' + toBase64Url(sig);
}

export async function verifyToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [b64Header, b64Payload, b64Sig] = parts;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', key, fromBase64Url(b64Sig), encoder.encode(b64Header + '.' + b64Payload));
  if (!valid) return null;
  const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(b64Payload)));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password + Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hash = await crypto.subtle.sign('HMAC', key, encoder.encode('aria-password-hash'));
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return saltHex + ':' + hashHex;
}

export async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password + saltHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hash = await crypto.subtle.sign('HMAC', key, encoder.encode('aria-password-hash'));
  const computedHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return computedHex === hashHex;
}
