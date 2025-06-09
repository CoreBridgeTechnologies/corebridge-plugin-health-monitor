const os = require('os');
const process = require('process');
const { performance } = require('perf_hooks');
const config = require('../config');
const logger = require('../utils/logger');

class SelfMonitoringService {
  constructor() {
    this.isMonitoring = false;
    this.metrics = new Map();
    this.alerts = [];
    this.lastMetricsCollection = null;
    this.monitoringInterval = null;
    this.eventLoopMonitor = null;
    this.startTime = Date.now();
    
    // Initialize baseline metrics
    this.baselineMetrics = {
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      startTime: this.startTime
    };
  }

  /**
   * Initialize self-monitoring service
   */
  async initialize() {
    try {
      logger.info('Initializing Self-Monitoring Service...');
      
      if (config.selfMonitoring.enabled) {
        await this.startMonitoring();
        logger.info('Self-Monitoring Service initialized and started');
      } else {
        logger.info('Self-Monitoring Service initialized but disabled in config');
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to initialize Self-Monitoring Service:', error);
      throw error;
    }
  }

  /**
   * Start self-monitoring
   */
  async startMonitoring() {
    if (this.isMonitoring) {
      logger.warn('Self-monitoring already running');
      return;
    }

    try {
      this.isMonitoring = true;
      
      // Start metrics collection interval
      this.monitoringInterval = setInterval(() => {
        this.collectMetrics();
      }, config.selfMonitoring.interval);
      
      // Start event loop monitoring if enabled
      if (config.selfMonitoring.metrics.eventLoop) {
        this.startEventLoopMonitoring();
      }
      
      // Collect initial metrics
      await this.collectMetrics();
      
      logger.info('Self-monitoring started', {
        interval: config.selfMonitoring.interval,
        metricsEnabled: Object.keys(config.selfMonitoring.metrics).filter(
          key => config.selfMonitoring.metrics[key]
        )
      });
      
    } catch (error) {
      this.isMonitoring = false;
      logger.error('Failed to start self-monitoring:', error);
      throw error;
    }
  }

  /**
   * Stop self-monitoring
   */
  async stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }

    try {
      this.isMonitoring = false;
      
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }
      
      if (this.eventLoopMonitor) {
        clearInterval(this.eventLoopMonitor);
        this.eventLoopMonitor = null;
      }
      
      logger.info('Self-monitoring stopped');
      
    } catch (error) {
      logger.error('Error stopping self-monitoring:', error);
    }
  }

  /**
   * Collect comprehensive system metrics
   */
  async collectMetrics() {
    try {
      const timestamp = new Date().toISOString();
      const metrics = {
        timestamp,
        uptime: this.getUptime(),
        system: await this.getSystemMetrics(),
        process: await this.getProcessMetrics(),
        eventLoop: this.getEventLoopMetrics(),
        health: await this.getHealthStatus()
      };
      
      // Store metrics
      this.metrics.set(timestamp, metrics);
      this.lastMetricsCollection = timestamp;
      
      // Clean old metrics (keep last hour)
      this.cleanOldMetrics();
      
      // Check thresholds and generate alerts
      await this.checkThresholds(metrics);
      
      logger.debug('Self-monitoring metrics collected', {
        timestamp,
        memoryUsageMB: metrics.process.memory.rss / 1024 / 1024,
        cpuUsagePercent: metrics.process.cpu.percent
      });
      
      return metrics;
      
    } catch (error) {
      logger.error('Failed to collect self-monitoring metrics:', error);
      return null;
    }
  }

  /**
   * Get system-level metrics
   */
  async getSystemMetrics() {
    if (!config.selfMonitoring.metrics.cpu) {
      return {};
    }

    const cpus = os.cpus();
    const loadAverage = os.loadavg();
    
    return {
      platform: os.platform(),
      arch: os.arch(),
      cpuCount: cpus.length,
      loadAverage: {
        '1m': loadAverage[0],
        '5m': loadAverage[1],
        '15m': loadAverage[2]
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        usagePercent: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100
      },
      uptime: os.uptime()
    };
  }

  /**
   * Get process-level metrics
   */
  async getProcessMetrics() {
    const metrics = {};
    
    if (config.selfMonitoring.metrics.memory) {
      const memUsage = process.memoryUsage();
      metrics.memory = {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers,
        rssMB: memUsage.rss / 1024 / 1024,
        heapUsedMB: memUsage.heapUsed / 1024 / 1024
      };
    }
    
    if (config.selfMonitoring.metrics.cpu) {
      const cpuUsage = process.cpuUsage(this.baselineMetrics.cpuUsage);
      const totalUsage = cpuUsage.user + cpuUsage.system;
      const timeElapsed = Date.now() - this.startTime;
      
      metrics.cpu = {
        user: cpuUsage.user,
        system: cpuUsage.system,
        total: totalUsage,
        percent: (totalUsage / (timeElapsed * 1000)) * 100
      };
    }
    
    return {
      ...metrics,
      pid: process.pid,
      ppid: process.ppid,
      version: process.version,
      uptime: process.uptime(),
      platform: process.platform,
      arch: process.arch
    };
  }

  /**
   * Get event loop metrics
   */
  getEventLoopMetrics() {
    if (!config.selfMonitoring.metrics.eventLoop) {
      return {};
    }

    return {
      delay: this.eventLoopDelay || 0,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Start event loop monitoring
   */
  startEventLoopMonitoring() {
    let start = performance.now();
    
    const measureEventLoop = () => {
      const delta = performance.now() - start;
      this.eventLoopDelay = delta;
      start = performance.now();
    };
    
    this.eventLoopMonitor = setInterval(measureEventLoop, 100);
  }

  /**
   * Get overall health status of the health monitor
   */
  async getHealthStatus() {
    const issues = [];
    const warnings = [];
    
    // Check memory usage
    const memUsage = process.memoryUsage();
    const memUsageMB = memUsage.rss / 1024 / 1024;
    
    if (memUsageMB > config.selfMonitoring.thresholds.memoryUsageMB) {
      issues.push(`High memory usage: ${memUsageMB.toFixed(2)}MB`);
    }
    
    // Check event loop delay
    if (this.eventLoopDelay > config.selfMonitoring.thresholds.eventLoopDelay) {
      issues.push(`High event loop delay: ${this.eventLoopDelay.toFixed(2)}ms`);
    }
    
    // Check uptime
    const uptime = this.getUptime();
    if (uptime.hours < 1) {
      warnings.push('Service recently started');
    }
    
    const status = issues.length > 0 ? 'unhealthy' : 'healthy';
    
    return {
      status,
      issues,
      warnings,
      lastCheck: new Date().toISOString(),
      uptime: uptime
    };
  }

  /**
   * Get service uptime
   */
  getUptime() {
    const uptimeMs = Date.now() - this.startTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    
    return {
      ms: uptimeMs,
      seconds: uptimeSeconds,
      minutes: Math.floor(uptimeSeconds / 60),
      hours: Math.floor(uptimeSeconds / 3600),
      days: Math.floor(uptimeSeconds / 86400),
      formatted: this.formatUptime(uptimeSeconds)
    };
  }

  /**
   * Format uptime for display
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
    
    return parts.join(' ');
  }

  /**
   * Check metrics against thresholds and generate alerts
   */
  async checkThresholds(metrics) {
    const alerts = [];
    const thresholds = config.selfMonitoring.thresholds;
    
    // Memory threshold
    if (metrics.process.memory && metrics.process.memory.rssMB > thresholds.memoryUsageMB) {
      alerts.push({
        type: 'memory-usage',
        severity: 'warning',
        message: `Memory usage (${metrics.process.memory.rssMB.toFixed(2)}MB) exceeds threshold (${thresholds.memoryUsageMB}MB)`,
        value: metrics.process.memory.rssMB,
        threshold: thresholds.memoryUsageMB,
        timestamp: metrics.timestamp
      });
    }
    
    // CPU threshold
    if (metrics.process.cpu && metrics.process.cpu.percent > thresholds.cpuUsagePercent) {
      alerts.push({
        type: 'cpu-usage',
        severity: 'warning',
        message: `CPU usage (${metrics.process.cpu.percent.toFixed(2)}%) exceeds threshold (${thresholds.cpuUsagePercent}%)`,
        value: metrics.process.cpu.percent,
        threshold: thresholds.cpuUsagePercent,
        timestamp: metrics.timestamp
      });
    }
    
    // Event loop delay threshold
    if (metrics.eventLoop.delay > thresholds.eventLoopDelay) {
      alerts.push({
        type: 'event-loop-delay',
        severity: 'warning',
        message: `Event loop delay (${metrics.eventLoop.delay.toFixed(2)}ms) exceeds threshold (${thresholds.eventLoopDelay}ms)`,
        value: metrics.eventLoop.delay,
        threshold: thresholds.eventLoopDelay,
        timestamp: metrics.timestamp
      });
    }
    
    // Add alerts to collection
    this.alerts.push(...alerts);
    
    // Log alerts
    alerts.forEach(alert => {
      logger.warn('Self-monitoring alert generated:', alert);
    });
    
    return alerts;
  }

  /**
   * Clean old metrics to prevent memory leaks
   */
  cleanOldMetrics() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    for (const [timestamp, metrics] of this.metrics.entries()) {
      const metricTime = new Date(timestamp).getTime();
      if (metricTime < oneHourAgo) {
        this.metrics.delete(timestamp);
      }
    }
    
    // Clean old alerts (keep last 100)
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }
  }

  /**
   * Get current metrics summary
   */
  getCurrentMetrics() {
    const latest = Array.from(this.metrics.values()).pop();
    return latest || null;
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(limit = 10) {
    const history = Array.from(this.metrics.values());
    return limit ? history.slice(-limit) : history;
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(limit = 10) {
    return this.alerts.slice(-limit);
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      lastMetricsCollection: this.lastMetricsCollection,
      metricsCount: this.metrics.size,
      alertsCount: this.alerts.length,
      uptime: this.getUptime(),
      configuration: {
        enabled: config.selfMonitoring.enabled,
        interval: config.selfMonitoring.interval,
        metrics: config.selfMonitoring.metrics,
        thresholds: config.selfMonitoring.thresholds
      }
    };
  }

  /**
   * Cleanup and stop monitoring
   */
  async cleanup() {
    try {
      await this.stopMonitoring();
      this.metrics.clear();
      this.alerts.length = 0;
      
      logger.info('Self-Monitoring Service cleaned up');
      
    } catch (error) {
      logger.error('Error during Self-Monitoring Service cleanup:', error);
    }
  }
}

module.exports = SelfMonitoringService; 