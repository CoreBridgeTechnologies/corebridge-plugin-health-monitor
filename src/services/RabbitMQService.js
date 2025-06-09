const amqp = require('amqplib');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../utils/logger');

class RabbitMQService {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000;
    this.messageHandlers = new Map();
    this.responseHandlers = new Map();
  }

  /**
   * Initialize RabbitMQ connection and setup exchanges/queues
   */
  async initialize() {
    try {
      logger.info('Initializing RabbitMQ service...');
      await this.connect();
      await this.setupExchangesAndQueues();
      await this.setupMessageHandlers();
      
      logger.info('RabbitMQ service initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize RabbitMQ service:', error);
      throw error;
    }
  }

  /**
   * Connect to RabbitMQ server
   */
  async connect() {
    try {
      const connectionUrl = `amqp://${config.rabbitmq.username}:${config.rabbitmq.password}@${config.rabbitmq.host}:${config.rabbitmq.port}${config.rabbitmq.vhost}`;
      
      this.connection = await amqp.connect(connectionUrl, config.rabbitmq.connectionOptions);
      this.channel = await this.connection.createChannel();
      
      // Set up connection event handlers
      this.connection.on('error', this.handleConnectionError.bind(this));
      this.connection.on('close', this.handleConnectionClose.bind(this));
      
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      logger.info('Connected to RabbitMQ successfully', {
        host: config.rabbitmq.host,
        port: config.rabbitmq.port,
        vhost: config.rabbitmq.vhost
      });
      
    } catch (error) {
      logger.error('Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  /**
   * Setup exchanges and queues for health monitoring
   */
  async setupExchangesAndQueues() {
    try {
      // Declare exchanges
      await this.channel.assertExchange(config.rabbitmq.exchanges.health, 'topic', { durable: true });
      await this.channel.assertExchange(config.rabbitmq.exchanges.system, 'topic', { durable: true });
      
      // Declare queues
      const queues = Object.values(config.rabbitmq.queues);
      for (const queueName of queues) {
        await this.channel.assertQueue(queueName, { 
          durable: true,
          arguments: {
            'x-message-ttl': 3600000, // 1 hour TTL
            'x-max-length': 10000 // Max 10k messages
          }
        });
      }
      
      // Bind queues to exchanges
      await this.channel.bindQueue(
        config.rabbitmq.queues.healthMetrics,
        config.rabbitmq.exchanges.health,
        'metrics.*'
      );
      
      await this.channel.bindQueue(
        config.rabbitmq.queues.healthAlerts,
        config.rabbitmq.exchanges.health,
        'alerts.*'
      );
      
      await this.channel.bindQueue(
        config.rabbitmq.queues.systemStatus,
        config.rabbitmq.exchanges.system,
        'status.*'
      );
      
      await this.channel.bindQueue(
        config.rabbitmq.queues.dbHealth,
        config.rabbitmq.exchanges.system,
        'database.*'
      );
      
      logger.info('RabbitMQ exchanges and queues setup completed');
      
    } catch (error) {
      logger.error('Failed to setup exchanges and queues:', error);
      throw error;
    }
  }

  /**
   * Setup message handlers for incoming messages
   */
  async setupMessageHandlers() {
    try {
      // Handle database health responses
      await this.channel.consume(
        config.rabbitmq.queues.dbHealth,
        this.handleDatabaseHealthResponse.bind(this),
        { noAck: false }
      );
      
      logger.info('Message handlers setup completed');
      
    } catch (error) {
      logger.error('Failed to setup message handlers:', error);
      throw error;
    }
  }

  /**
   * Publish health metrics to RabbitMQ
   */
  async publishHealthMetrics(metrics) {
    try {
      if (!this.isConnected) {
        throw new Error('RabbitMQ not connected');
      }
      
      const message = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        source: 'health-monitor-plugin',
        type: 'health-metrics',
        data: metrics
      };
      
      const messageBuffer = Buffer.from(JSON.stringify(message));
      
      await this.channel.publish(
        config.rabbitmq.exchanges.health,
        'metrics.health',
        messageBuffer,
        {
          persistent: true,
          messageId: message.id,
          timestamp: Date.now(),
          contentType: 'application/json'
        }
      );
      
      logger.debug('Health metrics published to RabbitMQ', {
        messageId: message.id,
        metricsCount: Object.keys(metrics).length
      });
      
    } catch (error) {
      logger.error('Failed to publish health metrics:', error);
      throw error;
    }
  }

  /**
   * Publish health alert to RabbitMQ
   */
  async publishHealthAlert(alert) {
    try {
      if (!this.isConnected) {
        throw new Error('RabbitMQ not connected');
      }
      
      const message = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        source: 'health-monitor-plugin',
        type: 'health-alert',
        severity: alert.severity || 'warning',
        data: alert
      };
      
      const messageBuffer = Buffer.from(JSON.stringify(message));
      const priority = config.alerting.channels.rabbitmq.priority[alert.severity] || 128;
      
      await this.channel.publish(
        config.rabbitmq.exchanges.health,
        `alerts.${alert.severity}`,
        messageBuffer,
        {
          persistent: true,
          priority,
          messageId: message.id,
          timestamp: Date.now(),
          contentType: 'application/json'
        }
      );
      
      logger.info('Health alert published to RabbitMQ', {
        messageId: message.id,
        severity: alert.severity,
        alertType: alert.type
      });
      
    } catch (error) {
      logger.error('Failed to publish health alert:', error);
      throw error;
    }
  }

  /**
   * Request database health check via RabbitMQ
   */
  async requestDatabaseHealthCheck(query = 'SELECT 1') {
    try {
      if (!this.isConnected) {
        throw new Error('RabbitMQ not connected');
      }
      
      const requestId = uuidv4();
      const replyQueue = `db_health_reply_${requestId}`;
      
      // Create temporary reply queue
      await this.channel.assertQueue(replyQueue, { 
        exclusive: true,
        autoDelete: true,
        expires: 60000 // 1 minute expiry
      });
      
      const request = {
        id: requestId,
        timestamp: new Date().toISOString(),
        source: 'health-monitor-plugin',
        type: 'database-health-check',
        query: query,
        timeout: config.database.healthCheck.timeout
      };
      
      const messageBuffer = Buffer.from(JSON.stringify(request));
      
      // Send request
      await this.channel.publish(
        config.rabbitmq.exchanges.system,
        'database.health.request',
        messageBuffer,
        {
          persistent: false,
          replyTo: replyQueue,
          correlationId: requestId,
          messageId: requestId,
          timestamp: Date.now(),
          contentType: 'application/json'
        }
      );
      
      // Wait for response
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Database health check timeout'));
        }, config.database.healthCheck.timeout);
        
        this.channel.consume(replyQueue, (msg) => {
          if (msg && msg.properties.correlationId === requestId) {
            clearTimeout(timeout);
            const response = JSON.parse(msg.content.toString());
            this.channel.ack(msg);
            resolve(response);
          }
        }, { noAck: false });
      });
      
    } catch (error) {
      logger.error('Failed to request database health check:', error);
      throw error;
    }
  }

  /**
   * Handle database health response
   */
  async handleDatabaseHealthResponse(msg) {
    try {
      if (!msg) return;
      
      const response = JSON.parse(msg.content.toString());
      logger.debug('Received database health response', {
        correlationId: msg.properties.correlationId,
        status: response.status
      });
      
      // Process the response (could trigger alerts, update metrics, etc.)
      if (response.status === 'error') {
        await this.publishHealthAlert({
          type: 'database-health',
          severity: 'critical',
          message: response.error || 'Database health check failed',
          timestamp: new Date().toISOString(),
          source: 'database-health-monitor'
        });
      }
      
      this.channel.ack(msg);
      
    } catch (error) {
      logger.error('Failed to handle database health response:', error);
      this.channel.nack(msg, false, false);
    }
  }

  /**
   * Publish system status update
   */
  async publishSystemStatus(status) {
    try {
      if (!this.isConnected) {
        throw new Error('RabbitMQ not connected');
      }
      
      const message = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        source: 'health-monitor-plugin',
        type: 'system-status',
        data: status
      };
      
      const messageBuffer = Buffer.from(JSON.stringify(message));
      
      await this.channel.publish(
        config.rabbitmq.exchanges.system,
        'status.health-monitor',
        messageBuffer,
        {
          persistent: true,
          messageId: message.id,
          timestamp: Date.now(),
          contentType: 'application/json'
        }
      );
      
      logger.debug('System status published to RabbitMQ', {
        messageId: message.id,
        status: status.status
      });
      
    } catch (error) {
      logger.error('Failed to publish system status:', error);
      throw error;
    }
  }

  /**
   * Handle connection errors
   */
  handleConnectionError(error) {
    logger.error('RabbitMQ connection error:', error);
    this.isConnected = false;
    this.scheduleReconnect();
  }

  /**
   * Handle connection close
   */
  handleConnectionClose() {
    logger.warn('RabbitMQ connection closed');
    this.isConnected = false;
    this.scheduleReconnect();
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached, giving up');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    
    logger.info(`Scheduling RabbitMQ reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    setTimeout(async () => {
      try {
        await this.connect();
        await this.setupExchangesAndQueues();
        await this.setupMessageHandlers();
      } catch (error) {
        logger.error('Reconnection attempt failed:', error);
        this.scheduleReconnect();
      }
    }, delay);
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      host: config.rabbitmq.host,
      port: config.rabbitmq.port
    };
  }

  /**
   * Close RabbitMQ connection
   */
  async close() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.isConnected = false;
      logger.info('RabbitMQ connection closed');
    } catch (error) {
      logger.error('Error closing RabbitMQ connection:', error);
    }
  }
}

module.exports = RabbitMQService; 