# CoreBridge Health Monitor Plugin

**Core Module** - License-free system health monitoring and infrastructure diagnostics.

## Overview

The Health Monitor Plugin is a core CoreBridge module that provides comprehensive system health monitoring, performance metrics, and real-time diagnostics for the CoreBridge platform and its components.

As a **core module**, this plugin operates without licensing restrictions and provides essential infrastructure monitoring capabilities.

## Features

### 🔍 System Health Monitoring
- **Core API Health**: Real-time monitoring of CoreBridge Core API
- **Infrastructure Services**: Database, cache, and message queue health checks
- **Service Discovery**: Automatic detection and monitoring of platform services
- **Real-time Diagnostics**: Live health status reporting and alerting

### 📊 Performance Metrics
- **Self-Monitoring**: Memory, CPU, and event loop performance tracking
- **Response Time Metrics**: API endpoint performance monitoring
- **System Resource Monitoring**: Host system resource utilization
- **Historical Data**: Performance trend analysis and reporting

### 🚨 Intelligent Alerting
- **Configurable Thresholds**: Customizable alert thresholds for various metrics
- **Severity Classification**: Info, warning, and critical alert levels
- **RabbitMQ Integration**: Alert distribution via message queues
- **Deduplication**: Intelligent alert throttling and deduplication

### 🔧 Integration Features
- **Core System Integration**: Read-only access to core configuration
- **RabbitMQ Messaging**: Asynchronous health data publishing
- **Plugin Discovery**: Automatic registration with CoreBridge Core
- **Docker Ready**: Containerized deployment with health checks

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                Health Monitor Plugin                        │
├─────────────────┬─────────────────┬─────────────────────────┤
│  Self-Monitor   │  Core Integration│     RabbitMQ Service   │
│  - Memory/CPU   │  - API Health    │     - Health Publishing│
│  - Event Loop   │  - Metrics       │     - Alert Distribution│
│  - Performance  │  - Registration  │     - Metrics Reporting│
└─────────────────┴─────────────────┴─────────────────────────┘
           │                 │                       │
           ▼                 ▼                       ▼
    ┌─────────────┐  ┌─────────────┐        ┌─────────────┐
    │   Logs &    │  │ CoreBridge  │        │  RabbitMQ   │
    │   Metrics   │  │  Core API   │        │   Queues    │
    └─────────────┘  └─────────────┘        └─────────────┘
```

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- CoreBridge Core system running
- RabbitMQ server accessible
- Docker (for containerized deployment)

### Installation

1. **Navigate to plugin directory:**
```bash
cd plugins/health-monitor
```

2. **Install dependencies:**
```bash
npm install
```

3. **Start the plugin:**
```bash
# Development mode
npm run dev

# Production mode
npm start

# Docker deployment
npm run docker:compose:up
```

### Verification

Check plugin health and registration:

```bash
# Plugin health check
curl http://localhost:3003/health

# View metrics
curl http://localhost:3003/metrics

# Check CoreBridge registration
curl http://localhost:4001/api/plugins/health-monitor
```

## Configuration

### Environment Variables

The plugin supports the following configuration options:

```bash
# Plugin Configuration
PORT=3003
NODE_ENV=production
LOG_LEVEL=info

# Core System Integration
COREBRIDGE_API_URL=http://localhost:4001
COREBRIDGE_TIMEOUT=30000

# RabbitMQ Configuration
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=admin
RABBITMQ_PASSWORD=password

# Monitoring Configuration
HEALTH_CHECK_INTERVAL=30000
METRICS_COLLECTION_INTERVAL=15000
ALERT_THRESHOLD_MEMORY=80
ALERT_THRESHOLD_CPU=80
```

### Core Integration

The plugin automatically integrates with CoreBridge Core through:

- **Auto-discovery**: Automatic plugin detection and registration
- **Health Reporting**: Regular health status updates to core
- **Configuration Sync**: Dynamic configuration from core system
- **Service Monitoring**: Monitoring of core and related services

## API Reference

### Health Endpoints

#### GET /health
Returns basic plugin health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-10T12:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "service": "Health Monitor Plugin",
  "licensing": { "required": false, "type": "core" }
}
```

#### GET /status
Returns comprehensive plugin status and configuration.

**Response:**
```json
{
  "status": "running",
  "version": "1.0.0",
  "uptime": 3600,
  "plugin": "health-monitor",
  "licensing": { "required": false, "type": "core" },
  "configuration": {
    "healthCheckInterval": 30000,
    "metricsInterval": 15000
  },
  "integrations": {
    "corebridge": "connected",
    "rabbitmq": "connected"
  }
}
```

### Metrics Endpoints

#### GET /metrics
Returns real-time performance metrics.

**Response:**
```json
{
  "timestamp": "2025-01-10T12:00:00.000Z",
  "plugin": {
    "uptime": 3600,
    "isRunning": true,
    "health": "healthy"
  },
  "system": {
    "memory": {
      "used": 45.2,
      "free": 54.8,
      "total": 8192
    },
    "cpu": {
      "usage": 12.5,
      "loadAverage": [1.2, 1.1, 1.0]
    }
  },
  "healthChecks": {
    "targets": [
      {
        "name": "CoreBridge Core API",
        "status": "healthy",
        "responseTime": 15
      },
      {
        "name": "Redis Cache",
        "status": "healthy", 
        "responseTime": 2
      },
      {
        "name": "RabbitMQ Management",
        "status": "healthy",
        "responseTime": 8
      }
    ]
  }
}
```

## Health Monitoring Targets

The plugin monitors the following system components:

### Core Services
- **CoreBridge Core API** - Main API server health and response times
- **Plugin Registry** - Plugin discovery and management system
- **Service Registry** - Service discovery and health tracking

### Infrastructure Services  
- **PostgreSQL Database** - Database connectivity and performance
- **Redis Cache** - Cache server health and response times
- **RabbitMQ Message Queue** - Message queue connectivity and management

### Self-Monitoring
- **Memory Usage** - Plugin memory consumption and garbage collection
- **CPU Usage** - Processing load and performance metrics
- **Event Loop Lag** - Node.js event loop performance
- **Request Performance** - API endpoint response times

## Deployment

### Docker Deployment

The plugin includes full Docker support:

```bash
# Build container
npm run docker:build

# Deploy with Docker Compose
npm run docker:compose:up

# View logs
npm run docker:logs

# Stop deployment
npm run docker:compose:down
```

### Docker Compose Configuration

The plugin integrates with the CoreBridge Docker network:

```yaml
version: '3.8'
services:
  health-monitor:
    build: .
    ports:
      - "3003:3003"
    environment:
      - PORT=3003
      - COREBRIDGE_API_URL=http://corebridge-core:4001
      - RABBITMQ_HOST=rabbitmq
    networks:
      - corebridge
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3003/health"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  corebridge:
    external: true
```

## Monitoring & Alerting

### Alert Thresholds

The plugin provides configurable alert thresholds:

| Metric | Warning | Critical |
|--------|---------|----------|
| Memory Usage | 70% | 85% |
| CPU Usage | 70% | 85% |
| Event Loop Lag | 50ms | 100ms |
| Response Time | 1s | 5s |
| Service Downtime | 30s | 60s |

### Alert Distribution

Alerts are distributed through:
- **RabbitMQ Queues**: Asynchronous alert delivery
- **Log Files**: Structured logging for analysis
- **Health Endpoints**: Real-time status via API
- **Core Integration**: Status updates to CoreBridge Core

## Troubleshooting

### Common Issues

#### Plugin Not Starting
```bash
# Check logs
tail -f logs/health-monitor.log

# Verify dependencies
npm install

# Check port availability
lsof -i :3003
```

#### Health Checks Failing
```bash
# Test plugin health
curl http://localhost:3003/health

# Check core connectivity
curl http://localhost:4001/health

# Verify RabbitMQ connection
curl http://localhost:15672
```

#### High Memory Usage
```bash
# Check memory metrics
curl http://localhost:3003/metrics

# Restart plugin
npm restart

# Check for memory leaks
node --inspect src/index.js
```

### Debug Mode

Enable detailed debugging:

```bash
# Set debug environment
export LOG_LEVEL=debug
export NODE_ENV=development

# Start with debug logging
npm run dev

# View debug logs
tail -f logs/health-monitor.log | grep DEBUG
```

## Development

### Local Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Run linting
npm run lint
```

### Plugin Integration

This plugin demonstrates core module best practices:

- **Auto-discovery**: Proper plugin.json configuration
- **Health Endpoints**: Required health and status endpoints
- **Graceful Shutdown**: Proper cleanup and signal handling
- **Error Handling**: Comprehensive error management
- **Logging**: Structured logging with multiple transports

### Code Structure

```
src/
├── index.js                 # Main application entry point
├── services/
│   ├── HealthMonitorPlugin.js     # Core plugin logic
│   ├── CoreIntegrationService.js  # CoreBridge integration
│   ├── RabbitMQService.js         # Message queue integration
│   └── SelfMonitoringService.js   # Self-monitoring logic
├── utils/
│   ├── logger.js            # Logging configuration
│   └── config.js            # Configuration management
└── middleware/
    ├── errorHandler.js      # Error handling middleware
    └── validation.js        # Request validation
```

## Related Documentation

- **[Plugin System Documentation](../../docs/plugin-system.md)** - Complete plugin development guide
- **[CoreBridge Core Documentation](../../README.md)** - Main system documentation
- **[Development Guide](../../docs/development-guide.md)** - Development best practices
- **[Deployment Guide](../../docs/deployment-guide.md)** - Production deployment
- **[Troubleshooting Guide](../../docs/troubleshooting.md)** - Common issues and solutions

## Support

For support and development assistance:

### Health Monitoring
```bash
# Check plugin health
curl http://localhost:3003/health

# View comprehensive status
curl http://localhost:3003/status

# Monitor performance metrics
curl http://localhost:3003/metrics
```

### Logging
- **Application Logs**: `logs/health-monitor.log`
- **Error Logs**: `logs/error.log`
- **Debug Logs**: Enable with `LOG_LEVEL=debug`

### Integration Support
- **CoreBridge Integration**: Automatic plugin discovery and registration
- **RabbitMQ Integration**: Health data publishing and alert distribution
- **Docker Integration**: Full containerization support

The Health Monitor Plugin provides essential infrastructure monitoring capabilities for the CoreBridge platform, serving as both a production-ready monitoring solution and a reference implementation for core module development. 