import jwt from 'jsonwebtoken';

export function sign(payload, secret) {
  return jwt.sign(payload, secret, { expiresIn: '30d' });
}

export function verify(token, secret) {
  return jwt.verify(token, secret);
}
