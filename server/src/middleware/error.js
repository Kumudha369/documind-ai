import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found.`));
}

// Express 5 forwards errors thrown in async handlers here automatically.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong on our side. Please try again.';
  let details;

  if (err instanceof ApiError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR';
    message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `File is too large. Maximum size is ${env.maxFileSizeMb} MB.`
        : `Upload failed: ${err.message}`;
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    code = 'BAD_JSON';
    message = 'Request body is not valid JSON.';
  } else if (err?.name === 'ValidationError') {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Some fields are invalid.';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err?.code === 11000) {
    status = 409;
    code = 'CONFLICT';
    message = 'That value is already in use.';
  } else if (err?.expose === true && err.status) {
    status = err.status; // errors from body-parser etc.
    message = err.message;
  }

  if (status >= 500) console.error(`[error] ${req.method} ${req.originalUrl}`, err);

  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}
