import bcrypt from 'bcryptjs';
import { COOKIE_NAME, cookieOptions, signToken } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

const ROUNDS = 12;
// Compared against when the email doesn't exist, so "unknown email" and "wrong password"
// take the same time and can't be told apart by timing.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', ROUNDS);

function startSession(res, user) {
  res.cookie(COOKIE_NAME, signToken(user._id), cookieOptions());
}

export async function register(req, res) {
  const { name, email, password } = req.body;
  if (await User.exists({ email })) throw ApiError.conflict('An account with this email already exists.');

  const passwordHash = await bcrypt.hash(password, ROUNDS);
  const user = await User.create({ name, email, passwordHash });
  startSession(res, user);
  res.status(201).json({ user: user.toPublic() });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw ApiError.unauthorized('Incorrect email or password.');

  startSession(res, user);
  res.json({ user: user.toPublic() });
}

export function logout(_req, res) {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(COOKIE_NAME, opts);
  res.status(204).end();
}

export async function me(req, res) {
  const user = await User.findById(req.user.id);
  if (!user) throw ApiError.unauthorized();
  res.json({ user: user.toPublic() });
}
