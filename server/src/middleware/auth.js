import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

export const COOKIE_NAME = 'documind_token';

export function cookieOptions() {
  return {
    httpOnly: true, // JavaScript in the page cannot read the cookie (protects against XSS token theft)
    secure: env.isProd, // only sent over HTTPS in production
    sameSite: 'lax', // not sent on cross-site POSTs (basic CSRF protection)
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

export function signToken(userId) {
  return jwt.sign({ sub: userId.toString() }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
    algorithm: 'HS256',
  });
}

// Verifies the cookie and attaches req.user. The user id ALWAYS comes from here,
// never from the request body, query string or URL.
export async function requireAuth(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) throw ApiError.unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw ApiError.unauthorized('Your session has expired. Please log in again.');
  }

  const user = await User.findById(payload.sub).select('name email').lean();
  if (!user) throw ApiError.unauthorized('Account no longer exists.');

  req.user = { id: user._id, name: user.name, email: user.email };
  next();
}
