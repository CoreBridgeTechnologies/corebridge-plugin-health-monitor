const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Ensure logs directory exists
const logsDir = path.dirname(config.logging.file.filename);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for health monitor logs
const healthMonitorFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    const logMessage = stack ? `${message}\n${stack}` : message;
    return `${timestamp} [HEALTH-MONITOR] ${level.toUpperCase()}: ${logMessage} ${metaStr}`;
  })
);

// JSON format for structured logging
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    return JSON.stringify({
      ...info,
      service: 'health-monitor-plugin',
      version: config.plugin.version
    });
  })
);

// Create transports array
const transports = [];

// Console transport
if (config.logging.console.enabled) {
  transports.push(new winston.transports.Console({
    level: config.logging.level,
    format: config.logging.format === 'json' ? jsonFormat : winston.format.combine(
      winston.format.colorize({ all: config.logging.console.colorize }),
      healthMonitorFormat
    )
  }));
}

// File transport
if (config.logging.file.enabled) {
  transports.push(new winston.transports.File({
    filename: config.logging.file.filename,
    level: config.logging.level,
    format: jsonFormat,
    maxsize: parseSize(config.logging.file.maxSize),
    maxFiles: config.logging.file.maxFiles,
    tailable: true
  }));
}

// Metrics file transport (if enabled)
if (config.logging.metrics && config.logging.metrics.enabled) {
  transports.push(new winston.transports.File({
    filename: config.logging.metrics.filename,
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
      winston.format.printf((info) => {
        // Only log metrics-related entries
        if (info.type === 'metrics' || info.metrics) {
          return JSON.stringify({
            ...info,
            service: 'health-monitor-plugin',
            type: 'metrics'
          });
        }
        return false;
      })
    )
  }));
}

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  transports,
  // Handle uncaught exceptions
  exceptionHandlers: config.logging.file.enabled ? [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'exceptions.log'),
      format: jsonFormat
    })
  ] : [],
  // Handle unhandled promise rejections
  rejectionHandlers: config.logging.file.enabled ? [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'rejections.log'),
      format: jsonFormat
    })
  ] : []
});

// Helper function to parse size strings like "10MB"
function parseSize(sizeStr) {
  const units = {
    'B': 1,
    'KB': 1024,
    'MB': 1024 * 1024,
    'GB': 1024 * 1024 * 1024
  };
  
  const match = sizeStr.toString().match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)$/i);
  if (!match) return 10 * 1024 * 1024; // Default 10MB
  
  const [, size, unit] = match;
  return Math.floor(parseFloat(size) * (units[unit.toUpperCase()] || 1));
}

// Add custom logging methods for health monitoring
logger.metrics = function(message, data = {}) {
  this.info(message, { 
    type: 'metrics', 
    metrics: data,
    timestamp: new Date().toISOString()
  });
};

logger.health = function(status, message, data = {}) {
  const logLevel = status === 'healthy' ? 'info' : 'warn';
  this[logLevel](message, {
    type: 'health-check',
    status,
    data,
    timestamp: new Date().toISOString()
  });
};

logger.alert = function(severity, message, alertData = {}) {
  const logLevel = severity === 'critical' ? 'error' : 'warn';
  this[logLevel](message, {
    type: 'alert',
    severity,
    alert: alertData,
    timestamp: new Date().toISOString()
  });
};

logger.performance = function(operation, duration, metadata = {}) {
  this.info(`Performance: ${operation}`, {
    type: 'performance',
    operation,
    duration,
    ...metadata,
    timestamp: new Date().toISOString()
  });
};

logger.audit = function(action, details = {}) {
  this.info(`Audit: ${action}`, {
    type: 'audit',
    action,
    details,
    timestamp: new Date().toISOString()
  });
};

// Log startup information
logger.info('Health Monitor Plugin Logger initialized', {
  level: config.logging.level,
  format: config.logging.format,
  transports: transports.map(t => t.constructor.name),
  version: config.plugin.version
});

module.exports = logger; 