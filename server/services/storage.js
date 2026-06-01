import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export function saveFile(buffer, filename) {
  const name = Date.now() + '-' + filename;
  const filePath = path.join(UPLOAD_DIR, name);
  fs.writeFileSync(filePath, buffer);
  return { name, path: filePath, size: buffer.length };
}

export function deleteFile(filePath) {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch(e) {}
}
