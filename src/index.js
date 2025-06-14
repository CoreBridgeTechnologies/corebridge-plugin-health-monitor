const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const logger = require('./utils/logger');
const HealthMonitorPlugin = require('./services/HealthMonitorPlugin');

/**
 * Health Monitor Core Plugin
 * Integrates health monitoring directly into the CoreBridge main application
 */
class HealthMonitorCorePlugin {
  constructor() {
    this.app = null;
    this.healthMonitor = null;
    this.router = express.Router();
    this.initialized = false;
    
    logger.info('Health Monitor Core Plugin constructor called');
  }

  /**
   * Initialize the plugin
   */
  async initialize() {
    try {
      logger.info('Initializing Health Monitor Core Plugin...');
      
      // Initialize the actual health monitor service
      this.healthMonitor = new HealthMonitorPlugin();
      await this.healthMonitor.initialize(true); // Pass true to indicate this is a core/integrated plugin
      
      // Configure routes
      this.setupRoutes();
      
      // Start health monitoring
      await this.healthMonitor.start();
      
      this.initialized = true;
      logger.info('Health Monitor Core Plugin initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Health Monitor Core Plugin:', error);
      throw error;
    }
  }

  /**
   * Setup routes for the health monitor
   */
  setupRoutes() {
    logger.info('Health Monitor: Setting up routes...');

    // Security middleware for API routes
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

    // Rate limiting for health monitor endpoints
    const healthLimiter = rateLimit({
      windowMs: 60000, // 1 minute
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many health check requests from this IP, please try again later.'
    });

    // Apply rate limiting to all routes
    this.router.use(healthLimiter);

    // Health endpoint (public)
    this.router.get('/health', (req, res) => {
      const status = this.healthMonitor.getStatus();
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
    this.router.get('/status', authenticateApiKey, (req, res) => {
      try {
        const status = this.healthMonitor.getStatus();
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
    this.router.get('/metrics', authenticateApiKey, (req, res) => {
      try {
        const selfMetrics = this.healthMonitor.selfMonitoring.getCurrentMetrics();
        const rabbitMQStatus = this.healthMonitor.rabbitMQ.getStatus();
        const coreIntegration = this.healthMonitor.coreIntegration.getIntegrationStatus();
        
        res.json({
          success: true,
          data: {
            plugin: this.healthMonitor.getStatus(),
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
    this.router.get('/health-results', authenticateApiKey, (req, res) => {
      try {
        const status = this.healthMonitor.getStatus();
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
    this.router.get('/alerts', authenticateApiKey, (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 50;
        const severity = req.query.severity;
        
        let alerts = this.healthMonitor.alerts;
        
        if (severity) {
          alerts = alerts.filter(alert => alert.severity === severity);
        }
        
        alerts = alerts.slice(-limit);
        
        res.json({
          success: true,
          data: {
            alerts,
            count: alerts.length,
            total: this.healthMonitor.alerts.length
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
    this.router.post('/control/pause', authenticateApiKey, async (req, res) => {
      try {
        await this.healthMonitor.pause();
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

    this.router.post('/control/resume', authenticateApiKey, async (req, res) => {
      try {
        await this.healthMonitor.resume();
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

    this.router.post('/control/force-check', authenticateApiKey, async (req, res) => {
      try {
        const results = await this.healthMonitor.runFullHealthCheck();
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

    logger.info('Health Monitor: Routes configured');
  }

  /**
   * Get the Express router for this plugin
   */
  getRouter() {
    return this.router;
  }

  /**
   * Get plugin status for health checks
   */
  getStatus() {
    if (!this.initialized || !this.healthMonitor) {
      return {
        status: 'stopped',
        message: 'Health Monitor plugin not initialized'
      };
    }

    try {
      const status = this.healthMonitor.getStatus();
      return {
        status: status.isRunning && !status.isPaused ? 'healthy' : 'unhealthy',
        uptime: status.uptime,
        lastCheck: status.lastFullHealthCheck,
        message: 'Health Monitor plugin running'
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Health Monitor plugin error: ${error.message}`
      };
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      logger.info('Cleaning up Health Monitor Core Plugin...');
      
      if (this.healthMonitor) {
        await this.healthMonitor.cleanup();
      }
      
      this.initialized = false;
      logger.info('Health Monitor Core Plugin cleaned up successfully');
    } catch (error) {
      logger.error('Error during Health Monitor cleanup:', error);
      throw error;
    }
  }
}

module.exports = HealthMonitorCorePlugin; 