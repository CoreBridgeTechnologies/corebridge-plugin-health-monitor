const cron = require('node-cron');
const axios = require('axios');
const net = require('net');
const config = require('../config');
const logger = require('../utils/logger');
const RabbitMQService = require('./RabbitMQService');
const CoreIntegrationService = require('./CoreIntegrationService');
const SelfMonitoringService = require('./SelfMonitoringService');

class HealthMonitorPlugin {
  constructor() {
    this.isRunning = false;
    this.isPaused = false;
    this.cronJobs = new Map();
    this.healthResults = new Map();
    this.alerts = [];
    this.lastFullHealthCheck = null;
    
    // Service instances
    this.rabbitMQ = new RabbitMQService();
    this.coreIntegration = new CoreIntegrationService();
    this.selfMonitoring = new SelfMonitoringService();
    
    // HTTP client for health checks
    this.httpClient = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent': `${config.plugin.name}/${config.plugin.version}`
      }
    });
    
    // Health check statistics
    this.stats = {
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      averageResponseTime: 0,
      lastCheckDuration: 0,
      uptime: 0
    };
  }

  /**
   * Initialize the Health Monitor Plugin
   */
  async initialize(isIntegratedPlugin = false) {
    try {
      logger.info('Initializing Health Monitor Plugin...');
      
      // Initialize all services
      await this.rabbitMQ.initialize();
      await this.coreIntegration.initialize(isIntegratedPlugin);
      await this.selfMonitoring.initialize();
      
      // Register plugin with core system
      try {
        await this.coreIntegration.registerPlugin();
        logger.info('Plugin registered with core system successfully');
      } catch (error) {
        logger.warn('Failed to register with core system, continuing anyway:', error.message);
      }
      
      // Setup health check cron jobs
      this.setupHealthCheckJobs();
      
      // Setup metrics reporting
      this.setupMetricsReporting();
      
      logger.info('Health Monitor Plugin initialized successfully');
      return true;
      
    } catch (error) {
      logger.error('Failed to initialize Health Monitor Plugin:', error);
      throw error;
    }
  }

  /**
   * Start the health monitoring plugin
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Health Monitor Plugin is already running');
      return;
    }

    try {
      logger.info('Starting Health Monitor Plugin...');
      
      this.isRunning = true;
      this.stats.uptime = Date.now();
      
      // Start all cron jobs
      for (const [name, job] of this.cronJobs) {
        job.start();
        logger.debug(`Started cron job: ${name}`);
      }
      
      // Publish startup status
      await this.publishSystemStatus({
        status: 'started',
        timestamp: new Date().toISOString(),
        version: config.plugin.version,
        capabilities: ['self-monitoring', 'core-integration', 'rabbitmq-health', 'database-health']
      });
      
      // Run initial health checks
      await this.runFullHealthCheck();
      
      logger.info('Health Monitor Plugin started successfully');
      
    } catch (error) {
      this.isRunning = false;
      logger.error('Failed to start Health Monitor Plugin:', error);
      throw error;
    }
  }

  /**
   * Stop the health monitoring plugin
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      logger.info('Stopping Health Monitor Plugin...');
      
      this.isRunning = false;
      
      // Stop all cron jobs
      for (const [name, job] of this.cronJobs) {
        job.stop();
        logger.debug(`Stopped cron job: ${name}`);
      }
      
      // Publish shutdown status
      await this.publishSystemStatus({
        status: 'stopped',
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.stats.uptime
      });
      
      logger.info('Health Monitor Plugin stopped successfully');
      
    } catch (error) {
      logger.error('Error stopping Health Monitor Plugin:', error);
    }
  }

  /**
   * Pause monitoring (without stopping services)
   */
  async pause() {
    if (!this.isRunning || this.isPaused) {
      return;
    }

    try {
      this.isPaused = true;
      
      // Stop cron jobs but keep services running
      for (const [name, job] of this.cronJobs) {
        job.stop();
      }
      
      logger.info('Health Monitor Plugin paused');
      
      await this.publishSystemStatus({
        status: 'paused',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Error pausing Health Monitor Plugin:', error);
    }
  }

  /**
   * Resume monitoring
   */
  async resume() {
    if (!this.isRunning || !this.isPaused) {
      return;
    }

    try {
      this.isPaused = false;
      
      // Restart cron jobs
      for (const [name, job] of this.cronJobs) {
        job.start();
      }
      
      logger.info('Health Monitor Plugin resumed');
      
      await this.publishSystemStatus({
        status: 'resumed',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Error resuming Health Monitor Plugin:', error);
    }
  }

  /**
   * Setup health check cron jobs
   */
  setupHealthCheckJobs() {
    try {
      // Main health check job
      const mainHealthJob = cron.schedule(
        this.intervalToCron(config.monitoring.healthCheckInterval),
        async () => {
          if (!this.isPaused) {
            await this.runFullHealthCheck();
          }
        },
        { scheduled: false }
      );
      
      this.cronJobs.set('main-health-check', mainHealthJob);
      
      // Database health check job (via RabbitMQ)
      if (config.database.healthCheck.enabled) {
        const dbHealthJob = cron.schedule(
          this.intervalToCron(config.database.healthCheck.interval),
          async () => {
            if (!this.isPaused) {
              await this.runDatabaseHealthCheck();
            }
          },
          { scheduled: false }
        );
        
        this.cronJobs.set('database-health-check', dbHealthJob);
      }
      
      // Individual target health checks
      config.healthTargets.forEach((target, index) => {
        if (target.interval) {
          const targetJob = cron.schedule(
            this.intervalToCron(target.interval),
            async () => {
              if (!this.isPaused) {
                await this.checkSingleTarget(target);
              }
            },
            { scheduled: false }
          );
          
          this.cronJobs.set(`target-${index}-${target.name}`, targetJob);
        }
      });
      
      logger.info('Health check cron jobs setup completed', {
        jobCount: this.cronJobs.size
      });
      
    } catch (error) {
      logger.error('Failed to setup health check jobs:', error);
      throw error;
    }
  }

  /**
   * Setup metrics reporting
   */
  setupMetricsReporting() {
    const metricsJob = cron.schedule(
      this.intervalToCron(config.monitoring.metricsCollectionInterval),
      async () => {
        if (!this.isPaused) {
          await this.collectAndReportMetrics();
        }
      },
      { scheduled: false }
    );
    
    this.cronJobs.set('metrics-reporting', metricsJob);
  }

  /**
   * Run full health check of all targets
   */
  async runFullHealthCheck() {
    const startTime = Date.now();
    
    try {
      logger.debug('Starting full health check cycle');
      
      const results = await Promise.allSettled(
        config.healthTargets.map(target => this.checkSingleTarget(target))
      );
      
      const healthResults = results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            target: config.healthTargets[index],
            status: 'error',
            error: result.reason.message,
            timestamp: new Date().toISOString()
          };
        }
      });
      
      const duration = Date.now() - startTime;
      this.stats.lastCheckDuration = duration;
      this.stats.totalChecks++;
      
      // Update statistics
      const successful = healthResults.filter(r => r.status === 'healthy').length;
      const failed = healthResults.length - successful;
      this.stats.successfulChecks += successful;
      this.stats.failedChecks += failed;
      
      // Calculate average response time
      const responseTimes = healthResults
        .filter(r => r.responseTime)
        .map(r => r.responseTime);
      
      if (responseTimes.length > 0) {
        this.stats.averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      }
      
      this.lastFullHealthCheck = new Date().toISOString();
      
      // Process results and generate alerts
      await this.processHealthResults(healthResults);
      
      // Report metrics
      await this.reportHealthMetrics(healthResults, duration);
      
      logger.debug('Full health check cycle completed', {
        duration,
        totalTargets: healthResults.length,
        successful,
        failed
      });
      
      return healthResults;
      
    } catch (error) {
      logger.error('Failed to run full health check:', error);
      throw error;
    }
  }

  /**
   * Check a single health target
   */
  async checkSingleTarget(target) {
    const startTime = Date.now();
    
    try {
      let result;
      
      switch (target.type) {
        case 'http':
        case 'https':
          result = await this.checkHttpTarget(target);
          break;
        case 'tcp':
          result = await this.checkTcpTarget(target);
          break;
        default:
          result = await this.checkHttpTarget(target);
      }
      
      const responseTime = Date.now() - startTime;
      result.responseTime = responseTime;
      result.timestamp = new Date().toISOString();
      
      // Store result
      this.healthResults.set(target.name, result);
      
      logger.debug(`Health check completed for ${target.name}`, {
        status: result.status,
        responseTime
      });
      
      return result;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const result = {
        target,
        status: 'error',
        error: error.message,
        responseTime,
        timestamp: new Date().toISOString()
      };
      
      this.healthResults.set(target.name, result);
      
      logger.warn(`Health check failed for ${target.name}:`, error.message);
      return result;
    }
  }

  /**
   * Check HTTP/HTTPS target
   */
  async checkHttpTarget(target) {
    try {
      const options = {
        method: target.method || 'GET',
        timeout: target.timeout || 5000,
        validateStatus: (status) => {
          return target.expectedStatus ? status === target.expectedStatus : status < 400;
        }
      };
      
      if (target.auth) {
        options.auth = target.auth;
      }
      
      const response = await this.httpClient.request({
        url: target.url,
        ...options
      });
      
      return {
        target,
        status: 'healthy',
        httpStatus: response.status,
        httpStatusText: response.statusText,
        headers: response.headers,
        data: response.data
      };
      
    } catch (error) {
      return {
        target,
        status: 'unhealthy',
        error: error.message,
        httpStatus: error.response?.status,
        httpStatusText: error.response?.statusText
      };
    }
  }

  /**
   * Check TCP target
   */
  async checkTcpTarget(target) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = target.timeout || 3000;
      
      let resolved = false;
      
      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
        }
      };
      
      socket.setTimeout(timeout);
      
      socket.on('connect', () => {
        cleanup();
        resolve({
          target,
          status: 'healthy'
        });
      });
      
      socket.on('error', (error) => {
        cleanup();
        resolve({
          target,
          status: 'unhealthy',
          error: error.message
        });
      });
      
      socket.on('timeout', () => {
        cleanup();
        resolve({
          target,
          status: 'unhealthy',
          error: 'Connection timeout'
        });
      });
      
      socket.connect(target.port, target.host);
    });
  }

  /**
   * Run database health check via RabbitMQ
   */
  async runDatabaseHealthCheck() {
    try {
      logger.debug('Running database health check via RabbitMQ');
      
      const queries = Object.entries(config.database.queries);
      const results = [];
      
      for (const [queryName, query] of queries) {
        try {
          const result = await this.rabbitMQ.requestDatabaseHealthCheck(query);
          results.push({
            query: queryName,
            status: result.status || 'healthy',
            data: result.data,
            error: result.error
          });
        } catch (error) {
          results.push({
            query: queryName,
            status: 'error',
            error: error.message
          });
        }
      }
      
      // Publish database health metrics
      await this.rabbitMQ.publishHealthMetrics({
        type: 'database-health',
        timestamp: new Date().toISOString(),
        results
      });
      
      logger.debug('Database health check completed', {
        queriesRun: results.length,
        successful: results.filter(r => r.status === 'healthy').length
      });
      
      return results;
      
    } catch (error) {
      logger.error('Failed to run database health check:', error);
      throw error;
    }
  }

  /**
   * Process health results and generate alerts
   */
  async processHealthResults(results) {
    try {
      const criticalIssues = results.filter(r => 
        r.status !== 'healthy' && r.target.critical
      );
      
      const nonCriticalIssues = results.filter(r => 
        r.status !== 'healthy' && !r.target.critical
      );
      
      // Generate alerts for critical issues
      for (const issue of criticalIssues) {
        await this.generateAlert({
          type: 'service-down',
          severity: 'critical',
          target: issue.target.name,
          message: `Critical service ${issue.target.name} is unhealthy`,
          error: issue.error,
          timestamp: issue.timestamp
        });
      }
      
      // Generate warnings for non-critical issues
      for (const issue of nonCriticalIssues) {
        await this.generateAlert({
          type: 'service-degraded',
          severity: 'warning',
          target: issue.target.name,
          message: `Service ${issue.target.name} is experiencing issues`,
          error: issue.error,
          timestamp: issue.timestamp
        });
      }
      
      // Update core system with health status
      try {
        await this.coreIntegration.updateHealthStatus({
          status: criticalIssues.length > 0 ? 'critical' : 
                  nonCriticalIssues.length > 0 ? 'warning' : 'healthy',
          metrics: {
            totalTargets: results.length,
            healthyTargets: results.filter(r => r.status === 'healthy').length,
            unhealthyTargets: results.filter(r => r.status !== 'healthy').length,
            criticalIssues: criticalIssues.length,
            nonCriticalIssues: nonCriticalIssues.length
          },
          details: {
            lastCheck: this.lastFullHealthCheck,
            results: results.map(r => ({
              name: r.target.name,
              status: r.status,
              responseTime: r.responseTime
            }))
          }
        });
      } catch (error) {
        logger.warn('Failed to update core system with health status:', error.message);
      }
      
    } catch (error) {
      logger.error('Failed to process health results:', error);
    }
  }

  /**
   * Generate and publish alert
   */
  async generateAlert(alertData) {
    try {
      const alert = {
        id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...alertData,
        source: 'health-monitor-plugin'
      };
      
      this.alerts.push(alert);
      
      // Publish alert via RabbitMQ
      await this.rabbitMQ.publishHealthAlert(alert);
      
      // Log alert
      logger.alert(alert.severity, alert.message, alert);
      
      return alert;
      
    } catch (error) {
      logger.error('Failed to generate alert:', error);
    }
  }

  /**
   * Collect and report comprehensive metrics
   */
  async collectAndReportMetrics() {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        plugin: {
          uptime: Date.now() - this.stats.uptime,
          isRunning: this.isRunning,
          isPaused: this.isPaused,
          stats: this.stats
        },
        selfMonitoring: this.selfMonitoring.getCurrentMetrics(),
        coreIntegration: this.coreIntegration.getIntegrationStatus(),
        rabbitMQ: this.rabbitMQ.getStatus(),
        healthChecks: {
          lastFullCheck: this.lastFullHealthCheck,
          resultsCount: this.healthResults.size,
          alertsCount: this.alerts.length,
          targets: Array.from(this.healthResults.values()).map(r => ({
            name: r.target.name,
            status: r.status,
            responseTime: r.responseTime,
            timestamp: r.timestamp
          }))
        }
      };
      
      // Publish metrics via RabbitMQ
      await this.rabbitMQ.publishHealthMetrics(metrics);
      
      // Log metrics
      logger.metrics('Health Monitor Plugin metrics collected', metrics);
      
      return metrics;
      
    } catch (error) {
      logger.error('Failed to collect and report metrics:', error);
    }
  }

  /**
   * Report health metrics
   */
  async reportHealthMetrics(results, duration) {
    try {
      const healthMetrics = {
        timestamp: new Date().toISOString(),
        type: 'health-check-results',
        duration,
        summary: {
          total: results.length,
          healthy: results.filter(r => r.status === 'healthy').length,
          unhealthy: results.filter(r => r.status !== 'healthy').length,
          critical: results.filter(r => r.status !== 'healthy' && r.target.critical).length,
          averageResponseTime: this.stats.averageResponseTime
        },
        results: results.map(r => ({
          target: r.target.name,
          status: r.status,
          responseTime: r.responseTime,
          error: r.error
        }))
      };
      
      await this.rabbitMQ.publishHealthMetrics(healthMetrics);
      
    } catch (error) {
      logger.error('Failed to report health metrics:', error);
    }
  }

  /**
   * Publish system status update
   */
  async publishSystemStatus(status) {
    try {
      await this.rabbitMQ.publishSystemStatus(status);
    } catch (error) {
      logger.warn('Failed to publish system status:', error.message);
    }
  }

  /**
   * Convert interval in milliseconds to cron expression
   */
  intervalToCron(intervalMs) {
    const seconds = Math.floor(intervalMs / 1000);
    
    if (seconds <= 0) return '* * * * * *';
    if (seconds < 60) return `*/${seconds} * * * * *`;
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `0 */${minutes} * * * *`;
    
    const hours = Math.floor(minutes / 60);
    return `0 0 */${hours} * * *`;
  }

  /**
   * Get plugin status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      uptime: this.stats.uptime ? Date.now() - this.stats.uptime : 0,
      stats: this.stats,
      lastFullHealthCheck: this.lastFullHealthCheck,
      services: {
        rabbitMQ: this.rabbitMQ.getStatus(),
        coreIntegration: this.coreIntegration.getIntegrationStatus(),
        selfMonitoring: this.selfMonitoring.getStatus()
      },
      healthResults: Array.from(this.healthResults.values()),
      recentAlerts: this.alerts.slice(-10),
      configuration: {
        targets: config.healthTargets.length,
        intervals: {
          healthCheck: config.monitoring.healthCheckInterval,
          metricsCollection: config.monitoring.metricsCollectionInterval
        }
      }
    };
  }

  /**
   * Cleanup and shutdown
   */
  async cleanup() {
    try {
      logger.info('Cleaning up Health Monitor Plugin...');
      
      await this.stop();
      
      // Cleanup all services
      await Promise.all([
        this.rabbitMQ.close(),
        this.coreIntegration.cleanup(),
        this.selfMonitoring.cleanup()
      ]);
      
      // Clear data
      this.healthResults.clear();
      this.alerts.length = 0;
      this.cronJobs.clear();
      
      logger.info('Health Monitor Plugin cleanup completed');
      
    } catch (error) {
      logger.error('Error during Health Monitor Plugin cleanup:', error);
    }
  }
}

module.exports = HealthMonitorPlugin; 