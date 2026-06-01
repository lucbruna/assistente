import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PER_HOUR || 500),
  message: { error: 'Limite de requisições excedido. Tente novamente em 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
});
