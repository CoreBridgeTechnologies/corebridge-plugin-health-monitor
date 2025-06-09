# CoreBridge Plugin Development Guide

A comprehensive guide to developing, integrating, and deploying plugins for the CoreBridge platform.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Integration Requirements](#core-integration-requirements)
3. [Plugin Development Setup](#plugin-development-setup)
4. [RabbitMQ Integration](#rabbitmq-integration)
5. [Configuration Management](#configuration-management)
6. [API Design & Endpoints](#api-design--endpoints)
7. [Monitoring & Self-Monitoring](#monitoring--self-monitoring)
8. [Logging & Debugging](#logging--debugging)
9. [Testing & Validation](#testing--validation)
10. [Deployment & Operations](#deployment--operations)
11. [Troubleshooting Guide](#troubleshooting-guide)

---

## Architecture Overview

### Plugin Design Principles

#### 1. **Core Integration Pattern**
```
┌─────────────────────────────────────────────────────────┐
│                    Plugin Architecture                  │
├─────────────────┬─────────────────┬───────────────────┤
│   Core Access   │  RabbitMQ Comms │   Self-Monitoring │
│   (Read-Only)   │  (Bi-directional)│   (Internal)     │
└─────────────────┴─────────────────┴───────────────────┘
         │                 │                   │
         ▼                 ▼                   ▼
  ┌─────────────┐  ┌─────────────┐    ┌─────────────┐
  │core-context │  │  RabbitMQ   │    │   Plugin    │
  │(Symbolic    │  │   Queues    │    │  Metrics    │
  │ Link)       │  │             │    │             │
  └─────────────┘  └─────────────┘    └─────────────┘
```

#### 2. **Integration Principles**
- **Read-Only Core Access**: Never modify core system files
- **Message-Based Communication**: Use RabbitMQ for data exchange
- **Self-Contained**: Plugin manages its own dependencies
- **Graceful Degradation**: Continue working if core services are unavailable
- **Comprehensive Monitoring**: Monitor itself and external services

---

## Core Integration Requirements

### 1. **Core-Context Setup** (CRITICAL)

The `core-context` folder provides read-only access to core system components:

```bash
# Create symbolic link to core system (MUST be read-only)
ln -s ../coreBridge-Core ./core-context
chmod -R 555 ../coreBridge-Core  # Make read-only

# Verify setup
ls -la core-context/
# Should show: dr-xr-xr-x (read and execute only)
```

**Why This Matters:**
- Prevents accidental modification of core system
- Provides access to shared configurations
- Enables safe integration with core components

### 2. **Required Core System Dependencies**

Your core system must have these services running:

```yaml
# From core-context/docker-compose.yml
services:
  postgres:      # Database (port 5432)
  redis:         # Cache (port 6379)  
  rabbitmq:      # Message queue (ports 5672, 15672)
  core:          # Main API (port 4001)
  frontend:      # UI (port 3000)
```

### 3. **Core API Integration Points**

**Expected Core Endpoints** (implement these in your core system):

```javascript
// Plugin Registration
POST /api/plugins/register
{
  "name": "plugin-name",
  "version": "1.0.0",
  "type": "monitoring",
  "capabilities": ["health-check", "metrics"],
  "endpoints": {
    "health": "/health",
    "metrics": "/metrics"
  }
}

// Health Status Updates
POST /api/health/update
{
  "source": "plugin-name",
  "status": "healthy|warning|critical",
  "metrics": { /* plugin metrics */ },
  "alerts": [ /* active alerts */ ]
}

// Component Status Query
GET /api/components/status
// Returns status of shared components

// Health Check
GET /health
// Should return: {"status": "ok", "uptime": 1234}
```

---

## Plugin Development Setup

### 1. **Project Structure**

```
your-plugin/
├── package.json                 # Dependencies and metadata
├── .env                        # Environment configuration
├── README.md                   # Plugin documentation
├── core-context/              # Symbolic link to core (READ-ONLY)
├── logs/                      # Log files directory
├── src/
│   ├── index.js              # Main entry point
│   ├── config/
│   │   └── index.js          # Configuration management
│   ├── services/
│   │   ├── PluginService.js      # Main plugin logic
│   │   ├── RabbitMQService.js    # RabbitMQ integration
│   │   ├── CoreIntegrationService.js  # Core API integration
│   │   └── SelfMonitoringService.js   # Self-monitoring
│   └── utils/
│       └── logger.js         # Logging utilities
```

### 2. **Package.json Template**

```json
{
  "name": "corebridge-your-plugin",
  "version": "1.0.0",
  "description": "Your plugin description",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.2",
    "winston": "^3.11.0",
    "amqplib": "^0.10.3",
    "axios": "^1.6.0",
    "dotenv": "^16.3.1",
    "helmet": "^7.1.0",
    "cors": "^2.8.5",
    "uuid": "^9.0.1",
    "node-cron": "^3.0.3"
  },
  "corebridge": {
    "plugin": {
      "type": "your-plugin-type",
      "version": "1.0.0",
      "capabilities": [
        "your-capabilities"
      ],
      "requirements": {
        "corebridge-core": ">=1.0.0"
      },
      "integration": {
        "coreComponents": true,
        "rabbitMQ": true,
        "database": true
      }
    }
  }
}
```

### 3. **Environment Configuration**

**Required .env Variables:**

```bash
# Plugin Configuration
NODE_ENV=development
PLUGIN_PORT=3002
LOG_LEVEL=info

# Core System Integration
COREBRIDGE_API_URL=http://localhost:4001
COREBRIDGE_API_KEY=your_api_key
COREBRIDGE_TIMEOUT=30000

# RabbitMQ Configuration (must match core system)
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=admin
RABBITMQ_PASSWORD=password
RABBITMQ_VHOST=/

# Security
ENABLE_API_KEY=true
API_KEY=your-plugin-secret-key
ENABLE_RATE_LIMIT=true

# Logging
LOG_TO_FILE=true
LOG_TO_CONSOLE=true
LOG_LEVEL=info
```

---

## RabbitMQ Integration

### 1. **Required RabbitMQ Setup**

**Queue and Exchange Structure:**

```javascript
// Exchanges (Topic-based)
exchanges: {
  plugin: 'plugin.exchange',        // Plugin-specific messages
  system: 'system.exchange',        // System-wide messages
  health: 'health.exchange'         // Health monitoring
}

// Queues
queues: {
  pluginMetrics: 'plugin.metrics',
  pluginAlerts: 'plugin.alerts', 
  systemStatus: 'system.status',
  dbHealth: 'database.health'
}

// Routing Keys
'plugin.metrics.*'     // Plugin metrics
'plugin.alerts.*'      // Plugin alerts
'system.status.*'      // System status updates
'database.health.*'    // Database health checks
```

### 2. **RabbitMQ Service Implementation**

**Key Features Required:**

```javascript
class RabbitMQService {
  // Connection management with auto-reconnect
  async connect() { /* ... */ }
  
  // Queue and exchange setup
  async setupExchangesAndQueues() { /* ... */ }
  
  // Publishing methods
  async publishMetrics(metrics) { /* ... */ }
  async publishAlert(alert) { /* ... */ }
  async publishStatus(status) { /* ... */ }
  
  // Database communication
  async requestDatabaseQuery(query) { /* ... */ }
  
  // Message handling
  async handleIncomingMessage(msg) { /* ... */ }
  
  // Connection monitoring
  getStatus() { /* ... */ }
}
```

### 3. **Database Integration via RabbitMQ**

**Database Health Check Pattern:**

```javascript
// Request database health check
const request = {
  id: uuidv4(),
  timestamp: new Date().toISOString(),
  source: 'your-plugin',
  type: 'database-health-check',
  query: 'SELECT 1',  // or complex health query
  timeout: 5000
};

// Publish to database queue
await channel.publish(
  'system.exchange',
  'database.health.request',
  Buffer.from(JSON.stringify(request)),
  {
    replyTo: tempReplyQueue,
    correlationId: requestId
  }
);

// Handle response
const response = await waitForResponse(tempReplyQueue, requestId);
```

**Common Database Health Queries:**

```sql
-- Basic connectivity
SELECT 1;

-- Connection count
SELECT count(*) FROM pg_stat_activity;

-- Database uptime
SELECT EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time()));

-- Table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) 
FROM pg_tables WHERE schemaname = 'public';

-- Lock monitoring
SELECT count(*) FROM pg_locks WHERE granted = false;
```

---

## Configuration Management

### 1. **Configuration Structure**

```javascript
// src/config/index.js
const config = {
  // Plugin-specific settings
  plugin: {
    name: 'Your Plugin Name',
    version: '1.0.0',
    type: 'plugin-type',
    port: process.env.PLUGIN_PORT || 3002
  },

  // Core system integration
  core: {
    basePath: './core-context',  // Read-only core access
    apiUrl: process.env.COREBRIDGE_API_URL,
    apiKey: process.env.COREBRIDGE_API_KEY,
    timeout: parseInt(process.env.COREBRIDGE_TIMEOUT) || 30000
  },

  // RabbitMQ configuration
  rabbitmq: {
    host: process.env.RABBITMQ_HOST,
    port: parseInt(process.env.RABBITMQ_PORT),
    username: process.env.RABBITMQ_USER,
    password: process.env.RABBITMQ_PASSWORD,
    vhost: process.env.RABBITMQ_VHOST || '/',
    
    // Plugin-specific queues
    queues: {
      metrics: 'your-plugin.metrics',
      alerts: 'your-plugin.alerts',
      status: 'your-plugin.status'
    }
  },

  // Security settings
  security: {
    enableApiKey: process.env.ENABLE_API_KEY === 'true',
    apiKey: process.env.API_KEY,
    enableRateLimit: process.env.ENABLE_RATE_LIMIT !== 'false'
  }
};
```

### 2. **Core Configuration Access**

**Safe Core Config Parsing:**

```javascript
// Core integration service
class CoreIntegrationService {
  async loadCoreConfiguration() {
    try {
      const coreConfigPath = path.join(this.coreBasePath, 'src/config/index.js');
      const configContent = await fs.readFile(coreConfigPath, 'utf8');
      
      // Parse safely using regex (don't execute code)
      return this.parseConfigurationSafely(configContent);
    } catch (error) {
      logger.warn('Core config not accessible, using defaults:', error.message);
      return this.getDefaultCoreConfig();
    }
  }

  parseConfigurationSafely(configContent) {
    // Extract values using regex patterns
    const extractValue = (key, defaultValue) => {
      const patterns = [
        new RegExp(`${key}:\\s*process\\.env\\.\\w+\\s*\\|\\|\\s*['"]([^'"]+)['"]`),
        new RegExp(`${key}:\\s*['"]([^'"]+)['"]`),
        new RegExp(`${key}:\\s*(\\d+)`)
      ];
      
      for (const pattern of patterns) {
        const match = configContent.match(pattern);
        if (match) return match[1] || defaultValue;
      }
      return defaultValue;
    };
    
    return {
      database: {
        host: extractValue('host', 'localhost'),
        port: parseInt(extractValue('port', '5432'))
      },
      // ... other config values
    };
  }
}
```

---

## API Design & Endpoints

### 1. **Standard Plugin API Structure**

**Required Endpoints:**

```javascript
// Public endpoints (no authentication)
GET  /health                    // Plugin health status

// Authenticated endpoints (API key required)
GET  /status                    // Comprehensive plugin status
GET  /metrics                   // Performance and operational metrics
GET  /alerts?severity=critical  // Recent alerts with filtering
POST /control/pause            // Pause plugin operations
POST /control/resume           // Resume plugin operations
POST /control/force-action     // Trigger specific actions
```

### 2. **Authentication Middleware**

```javascript
const authenticateApiKey = (req, res, next) => {
  if (!config.security.enableApiKey) {
    return next();
  }
  
  const apiKey = req.headers['x-api-key'] || 
                 req.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey || apiKey !== config.security.apiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid API key required'
    });
  }
  
  next();
};
```

### 3. **Response Format Standards**

**Success Response:**
```json
{
  "success": true,
  "data": {
    // Response data
  },
  "timestamp": "2025-06-08T19:52:11.602Z"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": "2025-06-08T19:52:11.602Z"
}
```

### 4. **Health Endpoint Implementation**

```javascript
app.get('/health', (req, res) => {
  const status = plugin.getStatus();
  const healthStatus = status.isRunning && !status.isPaused ? 'healthy' : 'unhealthy';
  
  res.status(healthStatus === 'healthy' ? 200 : 503).json({
    status: healthStatus,
    timestamp: new Date().toISOString(),
    uptime: status.uptime,
    version: config.plugin.version,
    service: config.plugin.name
  });
});
```

---

## Monitoring & Self-Monitoring

### 1. **Self-Monitoring Requirements**

**Key Metrics to Track:**

```javascript
// System metrics
{
  memory: {
    rss: 68308992,
    heapTotal: 16510976,
    heapUsed: 15237368,
    rssMB: 65.14453125
  },
  cpu: {
    user: 451715,
    system: 72588,
    total: 524303,
    percent: 0.58
  },
  eventLoop: {
    delay: 100.23,  // milliseconds
    timestamp: "2025-06-08T19:53:08.899Z"
  },
  uptime: {
    seconds: 90,
    formatted: "1m 30s"
  }
}
```

**Health Status Calculation:**

```javascript
async getHealthStatus() {
  const issues = [];
  const warnings = [];
  
  // Memory threshold check
  const memUsageMB = process.memoryUsage().rss / 1024 / 1024;
  if (memUsageMB > config.thresholds.memoryUsageMB) {
    issues.push(`High memory usage: ${memUsageMB.toFixed(2)}MB`);
  }
  
  // Event loop delay check
  if (this.eventLoopDelay > config.thresholds.eventLoopDelay) {
    issues.push(`High event loop delay: ${this.eventLoopDelay.toFixed(2)}ms`);
  }
  
  // Service uptime check
  const uptime = this.getUptime();
  if (uptime.hours < 1) {
    warnings.push('Service recently started');
  }
  
  return {
    status: issues.length > 0 ? 'unhealthy' : 'healthy',
    issues,
    warnings,
    lastCheck: new Date().toISOString()
  };
}
```

### 2. **Alert System Implementation**

**Alert Levels and Handling:**

```javascript
// Alert severity levels
const ALERT_LEVELS = {
  INFO: 'info',
  WARNING: 'warning', 
  CRITICAL: 'critical'
};

// Alert generation
async generateAlert(alertData) {
  const alert = {
    id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    source: config.plugin.name,
    severity: alertData.severity || ALERT_LEVELS.WARNING,
    type: alertData.type,
    message: alertData.message,
    data: alertData.data || {}
  };
  
  // Store locally
  this.alerts.push(alert);
  
  // Publish via RabbitMQ
  await this.rabbitMQ.publishAlert(alert);
  
  // Log alert
  logger.alert(alert.severity, alert.message, alert);
  
  return alert;
}
```

### 3. **Performance Monitoring**

**Response Time Tracking:**

```javascript
// Middleware for tracking API response times
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    logger.performance('API Request', duration, {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      userAgent: req.get('User-Agent')
    });
    
    // Track in metrics
    plugin.updateApiMetrics(req.method, req.url, duration, res.statusCode);
  });
  
  next();
});
```

---

## Logging & Debugging

### 1. **Logging Structure**

**Log Files Organization:**

```
logs/
├── plugin-main.log           # Main application logs
├── plugin-metrics.log        # Metrics and performance data
├── plugin-errors.log         # Error logs and stack traces
├── exceptions.log            # Uncaught exceptions
└── rejections.log            # Unhandled promise rejections
```

### 2. **Winston Logger Configuration**

```javascript
// src/utils/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf((info) => {
      return JSON.stringify({
        ...info,
        service: config.plugin.name,
        version: config.plugin.version
      });
    })
  ),
  transports: [
    // Console logging
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.simple()
      )
    }),
    
    // File logging
    new winston.transports.File({
      filename: 'logs/plugin-main.log',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true
    })
  ]
});

// Custom logging methods
logger.metrics = function(message, data = {}) {
  this.info(message, { 
    type: 'metrics', 
    metrics: data,
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
```

### 3. **Debug Mode Configuration**

```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# Enable RabbitMQ debug
RABBITMQ_DEBUG=true npm run dev

# Enable core integration debug
CORE_INTEGRATION_DEBUG=true npm run dev
```

**Debug Output Examples:**

```javascript
// Debug logging in services
logger.debug('RabbitMQ message published', {
  exchange: 'health.exchange',
  routingKey: 'metrics.health',
  messageId: message.id,
  size: messageBuffer.length
});

logger.debug('Core API request', {
  method: 'POST',
  url: '/api/health/update',
  data: updateData,
  headers: request.headers
});
```

---

## Testing & Validation

### 1. **Pre-Deployment Testing Checklist**

**Environment Setup:**
- [ ] Core-context symbolic link created and read-only
- [ ] .env file configured with correct values  
- [ ] RabbitMQ accessible and credentials valid
- [ ] Core system running and API responding
- [ ] Logs directory created and writable

**Configuration Testing:**
```bash
# Test configuration loading
node -e "require('./src/config'); console.log('✓ Configuration loaded');"

# Test core-context access
ls -la core-context/src/config/

# Test RabbitMQ connectivity
node -e "
const amqp = require('amqplib');
amqp.connect('amqp://admin:password@localhost:5672/')
  .then(() => console.log('✓ RabbitMQ connected'))
  .catch(err => console.error('✗ RabbitMQ failed:', err.message));
"
```

### 2. **Runtime Testing**

**Startup Testing:**
```bash
# Test startup sequence
timeout 30s npm run dev

# Expected log sequence:
# 1. Configuration loaded
# 2. RabbitMQ connected
# 3. Core integration initialized  
# 4. Self-monitoring started
# 5. API server listening
```

**API Endpoint Testing:**
```bash
# Test public health endpoint
curl http://localhost:3002/health

# Test authenticated endpoints
curl -H "X-API-Key: your-secret-key" http://localhost:3002/status
curl -H "X-API-Key: your-secret-key" http://localhost:3002/metrics

# Test control endpoints
curl -X POST -H "X-API-Key: your-secret-key" http://localhost:3002/control/pause
curl -X POST -H "X-API-Key: your-secret-key" http://localhost:3002/control/resume
```

### 3. **Integration Testing**

**RabbitMQ Message Flow:**
```javascript
// Test message publishing
const testMessage = {
  id: 'test-' + Date.now(),
  timestamp: new Date().toISOString(),
  source: 'test-plugin',
  type: 'test-message',
  data: { test: true }
};

await rabbitMQService.publishMetrics(testMessage);
```

**Core System Integration:**
```bash
# Verify core system responds
curl http://localhost:4001/health

# Check if core accepts plugin registration (may 404 if not implemented)
curl -X POST -H "Content-Type: application/json" \
  -d '{"name":"test-plugin","version":"1.0.0"}' \
  http://localhost:4001/api/plugins/register
```

### 4. **Load Testing**

```bash
# Stress test health endpoint
for i in {1..100}; do
  curl -s http://localhost:3002/health > /dev/null &
done
wait

# Monitor memory usage during load
watch -n 1 'curl -s -H "X-API-Key: your-key" http://localhost:3002/metrics | jq .data.selfMonitoring.process.memory.rssMB'
```

---

## Deployment & Operations

### 1. **Production Environment Setup**

**Environment Variables for Production:**

```bash
# Production .env
NODE_ENV=production
PLUGIN_PORT=3002
LOG_LEVEL=info

# Core system URLs (production)
COREBRIDGE_API_URL=https://your-domain.com:4001
COREBRIDGE_API_KEY=your-production-api-key

# RabbitMQ (production cluster)
RABBITMQ_HOST=rabbitmq.your-domain.com
RABBITMQ_PORT=5672
RABBITMQ_USER=production_user
RABBITMQ_PASSWORD=secure_password

# Security (production)
ENABLE_API_KEY=true
API_KEY=complex-production-api-key
ENABLE_RATE_LIMIT=true

# Logging (production)
LOG_TO_FILE=true
LOG_TO_CONSOLE=false
LOG_LEVEL=warn
```

### 2. **Docker Deployment**

**Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY core-context/ ./core-context/

# Create logs directory
RUN mkdir -p logs

# Create non-root user
RUN addgroup -g 1001 -S plugin && \
    adduser -S plugin -u 1001
RUN chown -R plugin:plugin /app
USER plugin

EXPOSE 3002

CMD ["npm", "start"]
```

**Docker Compose Integration:**
```yaml
# Add to core system's docker-compose.yml
services:
  your-plugin:
    build:
      context: ./plugins/your-plugin
      dockerfile: Dockerfile
    container_name: corebridge-your-plugin
    ports:
      - "3002:3002"
    environment:
      - NODE_ENV=production
      - COREBRIDGE_API_URL=http://core:4001
      - RABBITMQ_HOST=rabbitmq
      - RABBITMQ_PORT=5672
    volumes:
      - ./data/plugin-logs:/app/logs
    depends_on:
      core:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    networks:
      - app-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3002/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### 3. **Process Management (PM2)**

**PM2 Configuration:**
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'corebridge-your-plugin',
    script: 'src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true
  }]
};
```

```bash
# Deploy with PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

### 4. **Monitoring & Alerting Setup**

**System Monitoring:**
```bash
# CPU and Memory monitoring
top -p $(pgrep -f "your-plugin")

# Log monitoring
tail -f logs/plugin-main.log | grep ERROR

# Health endpoint monitoring (add to monitoring system)
*/5 * * * * curl -f http://localhost:3002/health || echo "Plugin down" | mail -s "Alert" admin@yourdomain.com
```

**Metrics Collection:**
```bash
# Export metrics for Prometheus
curl http://localhost:3002/metrics | jq '.data.selfMonitoring' > /var/lib/prometheus/plugin-metrics.json
```

---

## Troubleshooting Guide

### 1. **Common Issues and Solutions**

#### **Plugin Won't Start**

**Symptoms:**
```
Configuration Error: RabbitMQ host and port are required
```

**Solutions:**
1. Check .env file exists and has correct values
2. Verify RabbitMQ is running: `curl http://localhost:15672`
3. Test RabbitMQ credentials: `rabbitmqctl list_users`

#### **Core Integration Failing**

**Symptoms:**
```
Core API response error: Request failed with status code 404
Failed to register with core system
```

**Solutions:**
1. Verify core system is running: `curl http://localhost:4001/health`
2. Check API endpoints exist in core system
3. Implement missing endpoints in core system:
   ```javascript
   // Add to core system
   app.post('/api/plugins/register', (req, res) => {
     // Plugin registration logic
     res.json({ success: true, registered: true });
   });
   
   app.post('/api/health/update', (req, res) => {
     // Health update logic
     res.json({ success: true, updated: true });
   });
   ```

#### **RabbitMQ Connection Issues**

**Symptoms:**
```
Failed to connect to RabbitMQ: ECONNREFUSED
RabbitMQ connection error
```

**Solutions:**
1. Check RabbitMQ status: `sudo systemctl status rabbitmq-server`
2. Verify network connectivity: `telnet localhost 5672`
3. Check RabbitMQ logs: `sudo journalctl -u rabbitmq-server`
4. Verify credentials in RabbitMQ management UI: http://localhost:15672

#### **High Memory Usage**

**Symptoms:**
```
Self-monitoring alert generated: Memory usage (520.45MB) exceeds threshold (500MB)
```

**Solutions:**
1. Increase memory threshold in configuration
2. Check for memory leaks in custom code
3. Review metrics retention settings
4. Restart plugin if memory grows continuously

#### **Event Loop Delays**

**Symptoms:**
```
Event loop delay (100.23ms) exceeds threshold (100ms)
```

**Solutions:**
1. Reduce CPU-intensive operations
2. Use asynchronous operations instead of blocking calls
3. Increase event loop delay threshold if acceptable
4. Monitor system load: `top`, `htop`

### 2. **Debugging Commands**

**Check Plugin Status:**
```bash
# Health check
curl http://localhost:3002/health | jq .

# Detailed status
curl -H "X-API-Key: your-key" http://localhost:3002/status | jq .

# Recent alerts
curl -H "X-API-Key: your-key" "http://localhost:3002/alerts?limit=5" | jq .
```

**Log Analysis:**
```bash
# Follow main logs
tail -f logs/plugin-main.log | jq .

# Filter for errors
grep ERROR logs/plugin-main.log | jq .

# Check metrics logs
tail logs/plugin-metrics.log | jq .metrics

# Monitor log file sizes
ls -lh logs/
```

**RabbitMQ Debugging:**
```bash
# Check queues
curl -u admin:password http://localhost:15672/api/queues | jq '.[] | {name, messages}'

# Check exchanges
curl -u admin:password http://localhost:15672/api/exchanges | jq '.[] | {name, type}'

# Monitor message flow
curl -u admin:password http://localhost:15672/api/overview | jq .message_stats
```

### 3. **Performance Optimization**

**Memory Optimization:**
```javascript
// Clean old data periodically
setInterval(() => {
  // Clean metrics older than 1 hour
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  this.metrics = this.metrics.filter(m => m.timestamp > oneHourAgo);
  
  // Limit alert history
  if (this.alerts.length > 1000) {
    this.alerts = this.alerts.slice(-500);
  }
}, 300000); // Every 5 minutes
```

**CPU Optimization:**
```javascript
// Use worker threads for CPU-intensive tasks
const { Worker, isMainThread, parentPort } = require('worker_threads');

if (isMainThread) {
  // Main thread - delegate heavy work
  const worker = new Worker(__filename);
  worker.postMessage({ task: 'heavyCalculation', data: largeDataSet });
  worker.on('message', (result) => {
    // Handle result
  });
} else {
  // Worker thread - do heavy work
  parentPort.on('message', ({ task, data }) => {
    if (task === 'heavyCalculation') {
      const result = performHeavyCalculation(data);
      parentPort.postMessage(result);
    }
  });
}
```

---

## Best Practices Summary

### 1. **Security**
- ✅ Never store credentials in code
- ✅ Use environment variables for configuration
- ✅ Implement API key authentication
- ✅ Rate limit API endpoints
- ✅ Validate all inputs
- ✅ Use HTTPS in production

### 2. **Reliability**
- ✅ Implement graceful shutdown
- ✅ Handle connection failures with retries
- ✅ Monitor memory and CPU usage
- ✅ Log all errors with context
- ✅ Use health checks for monitoring
- ✅ Clean up resources properly

### 3. **Performance**
- ✅ Use asynchronous operations
- ✅ Implement connection pooling
- ✅ Cache frequently accessed data
- ✅ Clean up old data periodically
- ✅ Monitor event loop delays
- ✅ Optimize database queries

### 4. **Maintainability**
- ✅ Use structured logging
- ✅ Document all configuration options
- ✅ Implement comprehensive error handling
- ✅ Use meaningful error messages
- ✅ Version your APIs
- ✅ Write integration tests

---

**This guide provides everything needed to develop, integrate, and deploy a production-ready plugin for the CoreBridge platform. Follow these patterns and practices to ensure your plugin integrates seamlessly with the core system.** 