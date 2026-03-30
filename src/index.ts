import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from 'dotenv';
import { rateLimit } from 'express-rate-limit';

// Routes
import authRoutes from './routes/auth.js';
import subscriptionRoutes from './routes/subscription.js';
import userRoutes from './routes/user.js';
import usageRoutes from './routes/usage.js';
import apiKeyRoutes from './routes/apiKey.js';
import quotaRoutes from './routes/quota.js';
import processRoutes from './routes/process.js';

// Middleware
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';

// Load env vars
config();

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public routes
app.use('/api/auth', authRoutes);
app.use('/api/subscription', subscriptionRoutes);

// Protected routes
app.use('/api/user', authMiddleware, userRoutes);
app.use('/api/usage', authMiddleware, usageRoutes);
app.use('/api/api-keys', authMiddleware, apiKeyRoutes);
app.use('/api/quota', authMiddleware, quotaRoutes);
app.use('/api/process', authMiddleware, processRoutes);

// Error handler
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
