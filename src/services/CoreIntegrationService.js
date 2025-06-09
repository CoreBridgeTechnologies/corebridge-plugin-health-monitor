const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config');
const logger = require('../utils/logger');

class CoreIntegrationService {
  constructor() {
    this.coreBasePath = path.resolve(config.core.basePath);
    this.httpClient = null;
    this.coreConfig = null;
    this.isConnected = false;
    this.lastHealthCheck = null;
    this.connectionAttempts = 0;
  }

  /**
   * Initialize core integration service
   */
  async initialize() {
    try {
      logger.info('Initializing Core Integration Service...');
      
      // Load core configuration
      await this.loadCoreConfiguration();
      
      // Setup HTTP client for core API communication
      this.setupHttpClient();
      
      // Verify core connection
      await this.verifyConnection();
      
      logger.info('Core Integration Service initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Core Integration Service:', error);
      throw error;
    }
  }

  /**
   * Load configuration from core system
   */
  async loadCoreConfiguration() {
    try {
      // Read core configuration from read-only core-context
      const coreConfigPath = path.join(this.coreBasePath, 'src/config/index.js');
      
      // Check if core config exists
      try {
        await fs.access(coreConfigPath);
        logger.info('Core configuration found at:', coreConfigPath);
        
        // Since it's a module, we need to read the file and extract configuration
        // For security, we'll read key configuration values rather than executing
        const configContent = await fs.readFile(coreConfigPath, 'utf8');
        this.coreConfig = this.parseConfigurationSafely(configContent);
        
      } catch (error) {
        logger.warn('Core configuration not accessible, using defaults:', error.message);
        this.coreConfig = this.getDefaultCoreConfig();
      }
      
      logger.info('Core configuration loaded successfully');
      
    } catch (error) {
      logger.error('Failed to load core configuration:', error);
      this.coreConfig = this.getDefaultCoreConfig();
    }
  }

  /**
   * Safely parse configuration from core config file
   */
  parseConfigurationSafely(configContent) {
    // Extract key configuration values using regex patterns
    // This is safer than eval/require for read-only access
    
    const extractValue = (key, defaultValue) => {
      const patterns = [
        new RegExp(`${key}:\\s*process\\.env\\.\\w+\\s*\\|\\|\\s*['"]([^'"]+)['"]`),
        new RegExp(`${key}:\\s*['"]([^'"]+)['"]`),
        new RegExp(`${key}:\\s*(\\d+)`)
      ];
      
      for (const pattern of patterns) {
        const match = configContent.match(pattern);
        if (match) {
          return match[1] || defaultValue;
        }
      }
      return defaultValue;
    };
    
    return {
      server: {
        port: parseInt(extractValue('port', '3001')),
        serviceName: extractValue('serviceName', 'corebridge-health-monitor')
      },
      coreBridge: {
        apiUrl: extractValue('apiUrl', 'http://localhost:4001'),
        healthEndpoint: extractValue('healthEndpoint', '/api/health'),
        timeout: parseInt(extractValue('timeout', '30000'))
      },
      database: {
        enabled: extractValue('enabled', 'true') === 'true',
        type: extractValue('type', 'sqlite'),
        host: extractValue('host', 'localhost'),
        port: parseInt(extractValue('port', '5432'))
      }
    };
  }

  /**
   * Get default core configuration
   */
  getDefaultCoreConfig() {
    return {
      server: {
        port: 3001,
        serviceName: 'corebridge-health-monitor'
      },
      coreBridge: {
        apiUrl: 'http://localhost:4001',
        healthEndpoint: '/api/health',
        timeout: 30000
      },
      database: {
        enabled: true,
        type: 'postgresql',
        host: 'localhost',
        port: 5432
      }
    };
  }

  /**
   * Setup HTTP client for core API communication
   */
  setupHttpClient() {
    this.httpClient = axios.create({
      baseURL: config.core.apiUrl,
      timeout: config.core.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `${config.plugin.name}/${config.plugin.version}`,
        ...(config.core.apiKey && { 'Authorization': `Bearer ${config.core.apiKey}` })
      }
    });

    // Add request interceptor for logging
    this.httpClient.interceptors.request.use(
      (request) => {
        logger.debug('Core API request:', {
          method: request.method,
          url: request.url,
          data: request.data
        });
        return request;
      },
      (error) => {
        logger.error('Core API request error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging
    this.httpClient.interceptors.response.use(
      (response) => {
        logger.debug('Core API response:', {
          status: response.status,
          statusText: response.statusText,
          url: response.config.url
        });
        return response;
      },
      (error) => {
        logger.error('Core API response error:', {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          url: error.config?.url
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Verify connection to core system
   */
  async verifyConnection() {
    try {
      this.connectionAttempts++;
      
      const response = await this.httpClient.get(config.core.healthEndpoint);
      
      if (response.status === 200) {
        this.isConnected = true;
        this.connectionAttempts = 0;
        this.lastHealthCheck = new Date().toISOString();
        
        logger.info('Core system connection verified', {
          status: response.status,
          data: response.data
        });
        
        return response.data;
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
      
    } catch (error) {
      this.isConnected = false;
      logger.error('Failed to verify core system connection:', {
        error: error.message,
        attempts: this.connectionAttempts,
        apiUrl: config.core.apiUrl
      });
      throw error;
    }
  }

  /**
   * Get core system health status
   */
  async getCoreHealth() {
    try {
      const response = await this.httpClient.get(config.core.healthEndpoint);
      
      this.lastHealthCheck = new Date().toISOString();
      
      return {
        status: 'healthy',
        timestamp: this.lastHealthCheck,
        data: response.data,
        responseTime: response.config.responseTime || null
      };
      
    } catch (error) {
      logger.error('Failed to get core health:', error);
      
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
        responseTime: null
      };
    }
  }

  /**
   * Get core system metrics
   */
  async getCoreMetrics() {
    try {
      const response = await this.httpClient.get(config.core.metricsEndpoint);
      
      return {
        status: 'success',
        timestamp: new Date().toISOString(),
        metrics: response.data
      };
      
    } catch (error) {
      logger.error('Failed to get core metrics:', error);
      
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message,
        metrics: null
      };
    }
  }

  /**
   * Register health monitor plugin with core system
   */
  async registerPlugin() {
    try {
      const registrationData = {
        name: config.plugin.name,
        version: config.plugin.version,
        type: config.plugin.type,
        port: config.plugin.port,
        endpoints: {
          health: '/health',
          metrics: '/metrics',
          status: '/status'
        },
        capabilities: [
          'self-monitoring',
          'core-integration',
          'rabbitmq-health',
          'database-health',
          'service-health'
        ],
        timestamp: new Date().toISOString()
      };
      
      const response = await this.httpClient.post('/api/plugins/register', registrationData);
      
      logger.info('Plugin registered successfully with core system', {
        status: response.status,
        data: response.data
      });
      
      return response.data;
      
    } catch (error) {
      logger.error('Failed to register plugin with core system:', error);
      throw error;
    }
  }

  /**
   * Send health status update to core system
   */
  async updateHealthStatus(healthData) {
    try {
      const updateData = {
        source: 'health-monitor-plugin',
        timestamp: new Date().toISOString(),
        status: healthData.status,
        metrics: healthData.metrics,
        alerts: healthData.alerts || [],
        details: healthData.details || {}
      };
      
      const response = await this.httpClient.post('/api/health/update', updateData);
      
      logger.debug('Health status updated in core system', {
        status: response.status
      });
      
      return response.data;
      
    } catch (error) {
      logger.error('Failed to update health status in core system:', error);
      throw error;
    }
  }

  /**
   * Get shared component status from core
   */
  async getSharedComponentsStatus() {
    try {
      const response = await this.httpClient.get('/api/components/status');
      
      return {
        status: 'success',
        timestamp: new Date().toISOString(),
        components: response.data
      };
      
    } catch (error) {
      logger.error('Failed to get shared components status:', error);
      
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message,
        components: null
      };
    }
  }

  /**
   * Access core logger configuration
   */
  getCoreLoggerConfig() {
    try {
      // Access core logger configuration from read-only context
      const loggerPath = path.join(this.coreBasePath, 'src/config/logger.js');
      
      // Return safe configuration that can be used for reference
      return {
        path: loggerPath,
        available: true,
        note: 'Core logger configuration available in read-only mode'
      };
      
    } catch (error) {
      logger.error('Failed to access core logger config:', error);
      return {
        available: false,
        error: error.message
      };
    }
  }

  /**
   * Get integration status
   */
  getIntegrationStatus() {
    return {
      connected: this.isConnected,
      lastHealthCheck: this.lastHealthCheck,
      connectionAttempts: this.connectionAttempts,
      coreApiUrl: config.core.apiUrl,
      coreBasePath: this.coreBasePath,
      coreConfigLoaded: !!this.coreConfig,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Cleanup and close connections
   */
  async cleanup() {
    try {
      // Any cleanup needed for core integration
      this.isConnected = false;
      this.httpClient = null;
      
      logger.info('Core Integration Service cleaned up');
      
    } catch (error) {
      logger.error('Error during Core Integration Service cleanup:', error);
    }
  }
}

module.exports = CoreIntegrationService; 