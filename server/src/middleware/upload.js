import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export const uploadRoot = path.resolve(env.uploadDir);

const ALLOWED = {
  '.pdf': ['application/pdf'],
  '.txt': ['text/plain'],
};

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    // Each user gets their own folder. req.user is set by requireAuth, which runs before multer.
    const dir = path.join(uploadRoot, req.user.id.toString());
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`); // never trust the client filename for disk paths
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedMimes = ALLOWED[ext];
  if (!allowedMimes) {
    return cb(ApiError.badRequest('Only .pdf and .txt files are supported.'));
  }
  if (!allowedMimes.includes(file.mimetype)) {
    return cb(ApiError.badRequest(`File type mismatch: a ${ext} file must be ${allowedMimes[0]}.`));
  }
  cb(null, true);
}

export const uploadFiles = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.maxFileSizeMb * 1024 * 1024, files: 5 },
}).array('files', 5);

// Second line of defence: look at the first bytes of the saved file, because
// the extension and MIME type both come from the client and can be faked.
export async function sniffFile(filePath, ext) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(1024);
    const { bytesRead } = await handle.read(buf, 0, 1024, 0);
    const head = buf.subarray(0, bytesRead);
    if (bytesRead === 0) return 'The file is empty.';
    if (ext === '.pdf') {
      return head.subarray(0, 1024).includes('%PDF-') ? null : 'This file is not a valid PDF.';
    }
    if (ext === '.txt') {
      return head.includes(0) ? 'This file looks like binary data, not plain text.' : null;
    }
    return 'Unsupported file type.';
  } finally {
    await handle.close();
  }
}
