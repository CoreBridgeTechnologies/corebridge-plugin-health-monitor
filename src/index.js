const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const logger = require('./utils/logger');
const HealthMonitorPlugin = require('./services/HealthMonitorPlugin');

// Create Express app for API endpoints
const app = express();

// Security middleware
app.use(helmet());
app.use(cors());
app.use(compression());

// Rate limiting
if (config.security.enableRateLimit) {
  const limiter = rateLimit({
    windowMs: config.security.rateLimitWindow,
    max: config.security.rateLimitMax,
    message: 'Too many requests from this IP, please try again later.'
  });
  app.use(limiter);
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API key authentication middleware (if enabled)
const authenticateApiKey = (req, res, next) => {
  if (!config.security.enableApiKey) {
    return next();
  }
  
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey || apiKey !== config.security.apiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid API key required'
    });
  }
  
  next();
};

// Initialize Health Monitor Plugin
const healthMonitor = new HealthMonitorPlugin();

// Health endpoint (public)
app.get('/health', (req, res) => {
  const status = healthMonitor.getStatus();
  const healthStatus = status.isRunning && !status.isPaused ? 'healthy' : 'unhealthy';
  
  res.status(healthStatus === 'healthy' ? 200 : 503).json({
    status: healthStatus,
    timestamp: new Date().toISOString(),
    uptime: status.uptime,
    version: config.plugin.version,
    service: config.plugin.name
  });
});

// Status endpoint (requires auth)
app.get('/status', authenticateApiKey, (req, res) => {
  try {
    const status = healthMonitor.getStatus();
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Metrics endpoint (requires auth)
app.get('/metrics', authenticateApiKey, (req, res) => {
  try {
    const selfMetrics = healthMonitor.selfMonitoring.getCurrentMetrics();
    const rabbitMQStatus = healthMonitor.rabbitMQ.getStatus();
    const coreIntegration = healthMonitor.coreIntegration.getIntegrationStatus();
    
    res.json({
      success: true,
      data: {
        plugin: healthMonitor.getStatus(),
        selfMonitoring: selfMetrics,
        rabbitMQ: rabbitMQStatus,
        coreIntegration: coreIntegration
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting metrics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health results endpoint (requires auth)
app.get('/health-results', authenticateApiKey, (req, res) => {
  try {
    const status = healthMonitor.getStatus();
    res.json({
      success: true,
      data: {
        lastCheck: status.lastFullHealthCheck,
        results: status.healthResults,
        summary: {
          total: status.healthResults.length,
          healthy: status.healthResults.filter(r => r.status === 'healthy').length,
          unhealthy: status.healthResults.filter(r => r.status !== 'healthy').length
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting health results:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Alerts endpoint (requires auth)
app.get('/alerts', authenticateApiKey, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const severity = req.query.severity;
    
    let alerts = healthMonitor.alerts;
    
    if (severity) {
      alerts = alerts.filter(alert => alert.severity === severity);
    }
    
    alerts = alerts.slice(-limit);
    
    res.json({
      success: true,
      data: {
        alerts,
        count: alerts.length,
        total: healthMonitor.alerts.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting alerts:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Control endpoints (requires auth)
app.post('/control/pause', authenticateApiKey, async (req, res) => {
  try {
    await healthMonitor.pause();
    res.json({
      success: true,
      message: 'Health monitoring paused',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error pausing health monitor:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/control/resume', authenticateApiKey, async (req, res) => {
  try {
    await healthMonitor.resume();
    res.json({
      success: true,
      message: 'Health monitoring resumed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error resuming health monitor:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/control/force-check', authenticateApiKey, async (req, res) => {
  try {
    const results = await healthMonitor.runFullHealthCheck();
    res.json({
      success: true,
      message: 'Health check completed',
      data: results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error running forced health check:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Express error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    timestamp: new Date().toISOString()
  });
});

// Main application startup
async function startApplication() {
  try {
    logger.info('Starting Health Monitor Plugin Application...');
    
    // Initialize and start health monitor
    await healthMonitor.initialize();
    await healthMonitor.start();
    
    // Start Express server
    const server = app.listen(config.plugin.port, () => {
      logger.info(`Health Monitor Plugin API listening on port ${config.plugin.port}`, {
        port: config.plugin.port,
        environment: config.plugin.environment,
        version: config.plugin.version
      });
    });
    
    // Graceful shutdown handling
    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}, initiating graceful shutdown...`);
      
      // Stop accepting new connections
      server.close(() => {
        logger.info('HTTP server closed');
      });
      
      try {
        // Stop health monitor
        await healthMonitor.cleanup();
        logger.info('Health Monitor Plugin stopped successfully');
        
        // Exit process
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };
    
    // Register signal handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('unhandledRejection');
    });
    
    logger.info('Health Monitor Plugin Application started successfully');
    
  } catch (error) {
    logger.error('Failed to start Health Monitor Plugin Application:', error);
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  startApplication();
}

module.exports = {
  app,
  healthMonitor,
  startApplication
}; 