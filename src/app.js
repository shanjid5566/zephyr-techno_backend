import express from 'express';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import adminAttributesRoutes from './routes/attributes.routes.js';
import env from './config/env.js';

const app = express();

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin/attributes', adminAttributesRoutes);

// 404 — catch all undefined routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    status: 'fail',
    message: 'The requested resource does not exist',
  });
});

// Global error handler
// AppError already sets err.status and err.statusCode, so we just use them directly.
app.use((err, req, res, next) => {
  console.error('Error:', err);

  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    status: err.status || 'error',
    message: err.message || 'Internal Server Error',
    ...(env.nodeEnv === 'development' && { stack: err.stack }),
  });
});

export default app;