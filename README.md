# CoreBridge Health Monitor Plugin

> **🔧 Reference Implementation** - This plugin serves as the complete reference implementation for CoreBridge plugin development, demonstrating auto-discovery, health monitoring, core integration, and best practices.

🚀 **Complete demonstration of CoreBridge plugin development and integration**

A fully functional health monitoring plugin that showcases how to build, integrate, and deploy plugins for the CoreBridge platform. This demo includes comprehensive documentation, working code, and real-world integration patterns.

## 📋 What This Demo Includes

- ✅ **Working Plugin Implementation** - Complete health monitoring plugin with all features
- ✅ **Integration Documentation** - Step-by-step guides for plugin development
- ✅ **Core System Integration** - Real-world patterns for CoreBridge integration
- ✅ **RabbitMQ Messaging** - Database access via message queues
- ✅ **Self-Monitoring** - Memory, CPU, and performance monitoring
- ✅ **Production Ready** - Docker, logging, graceful shutdown, error handling
- ✅ **Comprehensive Testing** - Integration tests and validation procedures

## 🔧 Demo Description

This repository demonstrates a production-ready health monitoring plugin that monitors application health through core components, RabbitMQ integration, and self-monitoring capabilities.

## Features

### 🔍 **Core Integration**
- **Read-only access** to core system components via `core-context` folder
- Automatic core system configuration parsing
- Core API health monitoring and metrics collection
- Plugin registration with core system

### 🐰 **RabbitMQ Integration**
- Database health monitoring via RabbitMQ message queues
- Health metrics publishing and alerting
- Reliable message delivery with error handling
- Automatic reconnection and failover

### 📊 **Self-Monitoring**
- Real-time monitoring of the health monitor itself
- Memory, CPU, and event loop monitoring
- Performance metrics and alerting
- Configurable thresholds and alerts

### 🎯 **Multi-Target Health Checks**
- HTTP/HTTPS endpoint monitoring
- TCP port connectivity checks
- Configurable intervals and timeouts
- Critical vs non-critical target classification

### 🚨 **Intelligent Alerting**
- Severity-based alert classification (info, warning, critical)
- RabbitMQ-based alert distribution
- Throttling and deduplication
- Escalation rules for persistent issues

### 📈 **Comprehensive Metrics**
- Real-time health status reporting
- Performance metrics collection
- Historical data retention
- Integration with core monitoring systems

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                Health Monitor Plugin                        │
├─────────────────┬─────────────────┬─────────────────────────┤
│  Self-Monitor   │  Core Integration│     RabbitMQ Service   │
│  - Memory/CPU   │  - API Health    │     - DB Health Checks │
│  - Event Loop   │  - Metrics       │     - Alert Publishing │
│  - Performance  │  - Registration  │     - Metrics Reporting│
└─────────────────┴─────────────────┴─────────────────────────┘
           │                 │                       │
           ▼                 ▼                       ▼
    ┌─────────────┐  ┌─────────────┐        ┌─────────────┐
    │   Logs &    │  │ Core System │        │  RabbitMQ   │
    │   Metrics   │  │    API      │        │   Queues    │
    └─────────────┘  └─────────────┘        └─────────────┘
```

## Installation

### Prerequisites

- Node.js >= 16.0.0
- npm >= 8.0.0
- Access to CoreBridge core system
- RabbitMQ server running
- Core system with read-only access via `core-context`

### Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Create environment configuration:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Ensure core-context is properly linked:**
```bash
# The core-context folder should already be linked and read-only
ls -la core-context/
```

4. **Create logs directory:**
```bash
mkdir -p logs
```

## Configuration

### Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# Plugin Configuration
NODE_ENV=development
PLUGIN_PORT=3002
LOG_LEVEL=info

# Core System Integration
COREBRIDGE_API_URL=http://localhost:4001
COREBRIDGE_API_KEY=your_core_api_key_here
COREBRIDGE_TIMEOUT=30000

# RabbitMQ Configuration
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=admin
RABBITMQ_PASSWORD=password
RABBITMQ_VHOST=/

# Security
ENABLE_API_KEY=true
API_KEY=health-monitor-secret-key
ENABLE_RATE_LIMIT=true
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100

# Self-Monitoring
ENABLE_DETAILED_METRICS=true

# Logging
LOG_TO_FILE=true
LOG_TO_CONSOLE=true
LOG_COLORIZE=true
LOG_MAX_SIZE=10MB
LOG_MAX_FILES=5
```

### Core Configuration

The plugin automatically reads configuration from the core system via the read-only `core-context` folder. This includes:

- Database connection settings
- RabbitMQ configuration
- Logging preferences
- Service endpoints

## Usage

### Starting the Plugin

#### Development Mode
```bash
npm run dev
```

#### Production Mode
```bash
npm start
```

### API Endpoints

#### Public Endpoints

- **GET /health** - Plugin health status (no auth required)

#### Authenticated Endpoints (require API key)

- **GET /status** - Comprehensive plugin status
- **GET /metrics** - Real-time metrics and performance data
- **GET /health-results** - Latest health check results
- **GET /alerts?limit=50&severity=critical** - Recent alerts
- **POST /control/pause** - Pause monitoring
- **POST /control/resume** - Resume monitoring
- **POST /control/force-check** - Force immediate health check

#### Authentication

Include API key in request headers:
```bash
curl -H "X-API-Key: your-api-key" http://localhost:3002/status
# OR
curl -H "Authorization: Bearer your-api-key" http://localhost:3002/metrics
```

### Example Usage

#### Check Plugin Health
```bash
curl http://localhost:3002/health
```

#### Get Comprehensive Status
```bash
curl -H "X-API-Key: health-monitor-secret-key" \
  http://localhost:3002/status
```

#### View Recent Alerts
```bash
curl -H "X-API-Key: health-monitor-secret-key" \
  "http://localhost:3002/alerts?severity=critical&limit=10"
```

#### Force Health Check
```bash
curl -X POST \
  -H "X-API-Key: health-monitor-secret-key" \
  http://localhost:3002/control/force-check
```

## Health Check Targets

Configure monitoring targets in `src/config/index.js`:

```javascript
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
    name: 'Redis Cache',
    type: 'tcp',
    host: 'localhost',
    port: 6379,
    timeout: 3000,
    critical: false,
    interval: 45000
  }
]
```

## Monitoring & Alerting

### Alert Severities

- **INFO** - Informational messages
- **WARNING** - Non-critical issues requiring attention
- **CRITICAL** - Critical issues requiring immediate action

### Metrics Collected

#### System Metrics
- Memory usage (RSS, heap)
- CPU utilization
- Event loop delay
- System load average

#### Application Metrics
- Health check response times
- Success/failure rates
- RabbitMQ connection status
- Core system integration status

#### Health Check Metrics
- Target availability
- Response times
- Error rates
- Alert frequencies

## Integration with Core System

### RabbitMQ Queues

The plugin uses the following RabbitMQ queues:

- `health.metrics` - Health metrics data
- `health.alerts` - Alert notifications
- `system.status` - System status updates
- `database.health` - Database health check requests/responses

### Database Health Monitoring

Database health is monitored via RabbitMQ message queues to the core system:

```javascript
// Automatic health queries
{
  basic: 'SELECT 1',
  connections: 'SELECT count(*) FROM pg_stat_activity',
  uptime: 'SELECT EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time()))'
}
```

## Troubleshooting

### Common Issues

1. **Plugin won't start**
   - Check if core-context folder is accessible
   - Verify RabbitMQ is running and accessible
   - Check environment variables in .env

2. **Core integration failing**
   - Verify COREBRIDGE_API_URL is correct
   - Check API key configuration
   - Ensure core system is running

3. **RabbitMQ connection issues**
   - Verify RabbitMQ credentials
   - Check network connectivity
   - Review RabbitMQ logs

4. **High memory usage**
   - Check self-monitoring alerts
   - Review metrics retention settings
   - Consider increasing thresholds

### Logs

Logs are written to:
- Console (if enabled)
- `logs/health-monitor-plugin.log` - Main application logs
- `logs/health-metrics.log` - Metrics data
- `logs/exceptions.log` - Uncaught exceptions
- `logs/rejections.log` - Unhandled promise rejections

### Debug Mode

Enable debug logging:
```bash
LOG_LEVEL=debug npm run dev
```

## Development

### Project Structure

```
src/
├── config/
│   └── index.js          # Configuration management
├── services/
│   ├── HealthMonitorPlugin.js      # Main plugin orchestrator
│   ├── RabbitMQService.js          # RabbitMQ integration
│   ├── CoreIntegrationService.js   # Core system integration
│   └── SelfMonitoringService.js    # Self-monitoring
├── utils/
│   └── logger.js         # Logging utilities
└── index.js              # Application entry point
```

### Adding New Health Targets

1. Add target configuration to `healthTargets` array
2. Implement custom check logic if needed
3. Update documentation

### Extending Monitoring

1. Add new metrics to `SelfMonitoringService`
2. Update RabbitMQ message schemas
3. Add corresponding API endpoints

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check logs for error details
2. Review configuration settings
3. Verify core system integration
4. Contact CoreBridge support team

---

**CoreBridge Health Monitor Plugin v1.0.0**  
*Comprehensive health monitoring for CoreBridge platform* 