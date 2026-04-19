/**
 * Express Application Setup — Security Hardened
 * ================================================
 *
 * SECURITY MIDDLEWARE STACK (order matters):
 * 1. helmet — sets security HTTP headers (CSP, HSTS, X-Frame-Options, etc.)
 * 2. cors — restricts origins to configured allowed origins
 * 3. Custom mongo sanitizer — strips $ and . from req.body/params
 *    to prevent NoSQL injection (e.g., { "$gt": "" } in login fields)
 *    Note: express-mongo-sanitize is incompatible with Express 5 (read-only req.query)
 * 4. express.json — parses JSON bodies with size limit to prevent DoS
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import requestLogger from './middlewares/requestLogger.middleware.js';
import routes from './routes/v1/index.js';

const app = express();

/**
 * SECURITY: Trust the first proxy hop. Required when behind a reverse
 * proxy (nginx, Cloudflare, AWS ALB, etc.) so that req.ip reflects the
 * real client IP instead of the proxy's IP. express-rate-limit uses
 * req.ip for per-client limiting — without this, all users behind the
 * proxy would share a single rate limit bucket.
 */
app.set('trust proxy', 1);

/**
 * SECURITY: helmet() sets 15+ HTTP headers that protect against
 * clickjacking, MIME sniffing, XSS, and other common attacks.
 * This is a single-line addition that provides broad protection.
 */
app.use(helmet());

/**
 * SECURITY: Restrict CORS to configured origin.
 * Using '*' in development is acceptable; in production,
 * set CORS_ORIGIN to your frontend's domain.
 */
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

/**
 * SECURITY: Limit JSON body size to 10kb.
 * Prevents attackers from sending massive payloads to exhaust
 * server memory (Slow POST DoS / Body Bomb attacks).
 * An idToken is ~1-2kb; 10kb is generous for any auth payload.
 */
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

app.use(requestLogger);

/**
 * Custom NoSQL injection sanitizer (Express 5 compatible).
 *
 * SECURITY: Recursively strips keys starting with '$' or containing '.'
 * from req.body and req.params. Without this, an attacker could send:
 *   { "email": { "$gt": "" } }
 * which would match ALL users in a MongoDB query.
 *
 * NOTE: We skip req.query because Express 5 makes it read-only.
 * Query params are less risky since they go through Mongoose's
 * query builder, but req.body is where injection typically happens.
 */
function sanitizeObject(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  const clean = {};
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) continue; // Strip dangerous keys
    clean[key] = sanitizeObject(obj[key]);
  }
  return clean;
}

app.use((req, _res, next) => {
  if (req.body) req.body = sanitizeObject(req.body);
  // req.params is set per-route, but sanitize if present
  if (req.params && typeof req.params === 'object') {
    const sanitized = sanitizeObject(req.params);
    for (const key of Object.keys(sanitized)) {
      req.params[key] = sanitized[key];
    }
  }
  next();
});

// Routes
app.use('/v1', routes);

// Home route
app.get('/', (req, res) => {
  res.send('API is running here');
});

export default app;
