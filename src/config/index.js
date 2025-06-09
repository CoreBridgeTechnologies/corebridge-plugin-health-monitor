require('dotenv').config();

const config = {
  // Health Monitor Plugin Settings
  plugin: {
    name: 'CoreBridge Health Monitor Plugin',
    version: '1.0.0',
    type: 'health-monitor',
    port: process.env.PLUGIN_PORT || 3002,
    environment: process.env.NODE_ENV || 'development'
  },

  // Core System Integration
  core: {
    // Reference to core components (read-only)
    basePath: './core-context',
    apiUrl: process.env.COREBRIDGE_API_URL || 'http://localhost:4001',
    apiKey: process.env.COREBRIDGE_API_KEY || '',
    timeout: parseInt(process.env.COREBRIDGE_TIMEOUT) || 30000,
    healthEndpoint: '/health',
    metricsEndpoint: '/metrics'
  },

  // RabbitMQ Configuration (using core's RabbitMQ)
  rabbitmq: {
    host: process.env.RABBITMQ_HOST || 'localhost',
    port: parseInt(process.env.RABBITMQ_PORT) || 5672,
    username: process.env.RABBITMQ_USER || 'admin',
    password: process.env.RABBITMQ_PASSWORD || 'password',
    vhost: process.env.RABBITMQ_VHOST || '/',
    // Health Monitor specific queues
    queues: {
      healthMetrics: 'health.metrics',
      healthAlerts: 'health.alerts',
      systemStatus: 'system.status',
      dbHealth: 'database.health'
    },
    exchanges: {
      health: 'health.exchange',
      system: 'system.exchange'
    },
    connectionOptions: {
      heartbeat: 60,
      reconnect: true,
      reconnectInterval: 5000
    }
  },

  // Database Health Monitoring (via RabbitMQ)
  database: {
    healthCheck: {
      enabled: true,
      interval: 30000, // 30 seconds
      timeout: 5000,
      retries: 3
    },
    queries: {
      // Health check queries to run via RabbitMQ
      basic: 'SELECT 1',
      connections: 'SELECT count(*) FROM pg_stat_activity',
      uptime: 'SELECT EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time()))'
    }
  },

  // Self-Monitoring Configuration
  selfMonitoring: {
    enabled: true,
    interval: 15000, // 15 seconds
    metrics: {
      memory: true,
      cpu: true,
      eventLoop: true,
      httpRequests: true,
      rabbitMQConnections: true
    },
    thresholds: {
      memoryUsageMB: 500,
      cpuUsagePercent: 80,
      eventLoopDelay: 100,
      rabbitMQConnectionErrors: 5
    }
  },

  // Health Check Targets
  healthTargets: [
    {
      name: 'CoreBridge Core API',
      type: 'http',
      url: 'http://localhost:4001/health',
      method: 'GET',
      expectedStatus: 200,
      timeout: 5000,
      critical: true,
      interval: 30000
    },
    {
      name: 'RabbitMQ Management',
      type: 'http',
      url: 'http://localhost:15672/api/overview',
      method: 'GET',
      expectedStatus: 200,
      timeout: 5000,
      critical: true,
      interval: 60000,
      auth: {
        username: process.env.RABBITMQ_USER || 'admin',
        password: process.env.RABBITMQ_PASSWORD || 'password'
      }
    },
    {
      name: 'Redis Cache',
      type: 'tcp',
      host: 'localhost',
      port: 6379,
      timeout: 3000,
      critical: false,
      interval: 45000
    }
  ],

  // Monitoring Configuration
  monitoring: {
    healthCheckInterval: 30000, // 30 seconds
    metricsCollectionInterval: 15000, // 15 seconds
    alertingEnabled: true,
    retentionPeriod: '7d',
    maxConcurrentChecks: 5,
    enableDetailedMetrics: process.env.ENABLE_DETAILED_METRICS === 'true'
  },

  // Alerting Configuration
  alerting: {
    enabled: true,
    channels: {
      rabbitmq: {
        enabled: true,
        queue: 'health.alerts',
        priority: {
          critical: 255,
          warning: 128,
          info: 64
        }
      },
      console: {
        enabled: process.env.NODE_ENV === 'development',
        level: 'warning'
      }
    },
    rules: {
      consecutiveFailures: 3,
      recoveryNotification: true,
      throttleWindow: 300000, // 5 minutes
      escalationRules: [
        {
          condition: 'consecutive_failures >= 5',
          action: 'escalate_to_critical'
        },
        {
          condition: 'service_down_time > 300000', // 5 minutes
          action: 'page_on_call'
        }
      ]
    }
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: 'json',
    console: {
      enabled: true,
      colorize: process.env.NODE_ENV === 'development'
    },
    file: {
      enabled: true,
      filename: 'logs/health-monitor-plugin.log',
      maxSize: '10MB',
      maxFiles: 5
    },
    metrics: {
      enabled: true,
      filename: 'logs/health-metrics.log'
    }
  },

  // Security
  security: {
    enableApiKey: process.env.ENABLE_API_KEY === 'true',
    apiKey: process.env.API_KEY || 'health-monitor-secret',
    enableRateLimit: true,
    rateLimitWindow: 60000, // 1 minute
    rateLimitMax: 100
  }
};

// Configuration validation
function validateConfig() {
  const errors = [];

  // Validate RabbitMQ connection
  if (!config.rabbitmq.host || !config.rabbitmq.port) {
    errors.push('RabbitMQ host and port are required');
  }

  // Validate core integration
  if (!config.core.apiUrl) {
    errors.push('Core API URL is required');
  }

  // Validate health targets
  config.healthTargets.forEach((target, index) => {
    if (!target.name || (!target.url && !target.host)) {
      errors.push(`Health target ${index} must have name and url/host`);
    }
  });

  if (errors.length > 0) {
    throw new Error(`Health Monitor Plugin Configuration Error:\n${errors.join('\n')}`);
  }
}

// Validate on load
try {
  validateConfig();
} catch (error) {
  console.error('Configuration Error:', error.message);
  process.exit(1);
}

module.exports = config; 