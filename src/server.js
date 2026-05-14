import app from './app.js';
import env from './config/env.js';

const PORT = env.port;

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${env.nodeEnv}`);
  console.log(`Health check available at: http://localhost:${PORT}/health`);
});

// Shared graceful shutdown — eliminates the duplicate SIGTERM/SIGINT handlers
const gracefulShutdown = (signal) => {
  console.log(`${signal} signal received: closing HTTP server`);
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  server.close(() => process.exit(1));
});

export default server;