import pinoHttp from 'pino-http';
import crypto from 'crypto';
import logger from '../config/logger.js';

const requestLogger = pinoHttp({
  logger,

  genReqId: (req) =>
    req.headers['x-request-id'] || crypto.randomUUID(),

  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },

  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} ${res.statusCode}`,

  customErrorMessage: (req, res) =>
    `${req.method} ${req.url} ${res.statusCode}`,

  customProps: (req) => ({
    ...(req.user?._id && { userId: req.user._id.toString() }),
  }),

  serializers: {
    req(req) {
      return {
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
      };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },

  autoLogging: {
    ignore: (req) => req.url === '/' || req.url === '/health',
  },
});

export default requestLogger;
