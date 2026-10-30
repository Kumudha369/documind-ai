import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';

// validate(schema) parses req.body with a zod schema and replaces it with the clean result.
// Because zod enforces types, a body like { "email": { "$ne": null } } is rejected
// (this blocks NoSQL-injection attempts).
export const validateBody = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    throw ApiError.badRequest('Please check the highlighted fields.', formatZod(result.error));
  }
  req.body = result.data;
  next();
};

export const validateQuery = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.query ?? {});
  if (!result.success) {
    throw ApiError.badRequest('Invalid query parameters.', formatZod(result.error));
  }
  req.validatedQuery = result.data;
  next();
};

function formatZod(error) {
  return error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
}

export const isObjectId = (v) => typeof v === 'string' && mongoose.isValidObjectId(v) && /^[a-f\d]{24}$/i.test(v);

// Use on routes with :id so malformed ids give 400 instead of a Mongoose CastError.
export const validateIdParam = (name = 'id') => (req, _res, next) => {
  if (!isObjectId(req.params[name])) throw ApiError.badRequest(`Invalid ${name}.`);
  next();
};
