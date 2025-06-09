# CoreBridge Plugin Quick Start Checklist

A quick reference for getting a plugin functioning and integrated properly.

## Pre-Requirements ✅

- [ ] **Core System Running**: `curl http://localhost:4001/health` returns 200
- [ ] **RabbitMQ Running**: `curl http://localhost:15672` (admin UI accessible)
- [ ] **PostgreSQL Running**: Port 5432 accessible
- [ ] **Redis Running**: Port 6379 accessible
- [ ] **Node.js >= 16**: `node --version`

---

## 1. Core-Context Setup (CRITICAL) 🔒

```bash
# 1. Create read-only symbolic link
ln -s ../coreBridge-Core ./core-context

# 2. Make core system read-only (IMPORTANT!)
chmod -R 555 ../coreBridge-Core

# 3. Verify setup
ls -la core-context/
# Should show: dr-xr-xr-x (read-only permissions)
```

**Why Critical:** Prevents accidental modification of core system while providing access to shared components.

---

## 2. Environment Configuration 📋

**Create `.env` file:**
```bash
# Plugin Settings
NODE_ENV=development
PLUGIN_PORT=3002
LOG_LEVEL=info

# Core Integration
COREBRIDGE_API_URL=http://localhost:4001
COREBRIDGE_API_KEY=your-api-key
COREBRIDGE_TIMEOUT=30000

# RabbitMQ (MUST match core system)
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
```

---

## 3. Dependencies Installation 📦

```bash
# Create package.json with required dependencies
npm init -y

# Install core dependencies
npm install express winston amqplib axios dotenv helmet cors uuid node-cron

# Development dependencies
npm install --save-dev nodemon jest

# Create logs directory
mkdir -p logs
```

---

## 4. Core Service Files (Essential) 📁

**Required file structure:**
```
src/
├── index.js                    # Main entry point + Express API
├── config/index.js             # Configuration management
├── services/
│   ├── RabbitMQService.js      # RabbitMQ integration
│   ├── CoreIntegrationService.js # Core system API integration  
│   ├── SelfMonitoringService.js  # Self-monitoring capabilities
│   └── YourPluginService.js      # Main plugin logic
└── utils/
    └── logger.js               # Winston logging setup
```

---

## 5. RabbitMQ Integration (Database Access) 🐰

**Required queues and exchanges:**
```javascript
// In RabbitMQService.js
exchanges: {
  health: 'health.exchange',
  system: 'system.exchange'
},
queues: {
  healthMetrics: 'health.metrics',
  healthAlerts: 'health.alerts', 
  systemStatus: 'system.status',
  dbHealth: 'database.health'
}
```

**Database health check pattern:**
```javascript
// Request database query via RabbitMQ
const response = await this.rabbitMQ.requestDatabaseHealthCheck('SELECT 1');
```

---

## 6. API Endpoints (Standard) 🌐

**Required endpoints:**
```javascript
// Public
GET  /health                     # Plugin health (no auth)

// Authenticated (API key required)
GET  /status                     # Comprehensive status
GET  /metrics                    # Performance metrics  
GET  /alerts                     # Recent alerts
POST /control/pause              # Pause operations
POST /control/resume             # Resume operations
```

**Authentication header:**
```bash
curl -H "X-API-Key: your-plugin-secret-key" http://localhost:3002/status
```

---

## 7. Self-Monitoring (Built-in) 📊

**Required metrics:**
- Memory usage (RSS, heap)
- CPU utilization
- Event loop delay
- RabbitMQ connection status
- Core system connectivity

**Alert thresholds:**
```javascript
thresholds: {
  memoryUsageMB: 500,
  cpuUsagePercent: 80,
  eventLoopDelay: 100
}
```

---

## 8. Testing Checklist ✅

**Configuration Test:**
```bash
node -e "require('./src/config'); console.log('✓ Config loaded');"
```

**Startup Test:**
```bash
timeout 30s npm run dev
# Look for: RabbitMQ connected, Core integration initialized, API listening
```

**API Tests:**
```bash
# Health check
curl http://localhost:3002/health

# Authenticated endpoint
curl -H "X-API-Key: your-secret-key" http://localhost:3002/status

# Force action
curl -X POST -H "X-API-Key: your-secret-key" http://localhost:3002/control/force-check
```

**Integration Tests:**
```bash
# Core system responding
curl http://localhost:4001/health

# RabbitMQ management
curl http://localhost:15672

# Database connectivity (via RabbitMQ)
# Check logs for database health check results
```

---

## 9. Common Issues & Quick Fixes 🔧

| Issue | Quick Fix |
|-------|-----------|
| **Plugin won't start** | Check `.env` file exists and RabbitMQ is running |
| **404 errors from core** | Normal - implement missing endpoints in core system |
| **RabbitMQ connection failed** | Verify credentials: `curl -u admin:password http://localhost:15672/api/overview` |
| **High memory alerts** | Increase threshold or check for memory leaks |
| **Event loop delays** | Reduce CPU-intensive operations, use async/await |

---

## 10. Production Deployment 🚀

**Environment changes for production:**
```bash
NODE_ENV=production
LOG_LEVEL=warn
COREBRIDGE_API_URL=https://your-domain.com:4001
# Use strong API keys and passwords
```

**Docker deployment:**
```yaml
# Add to docker-compose.yml
your-plugin:
  build: ./plugins/your-plugin
  ports: ["3002:3002"]
  depends_on: [core, rabbitmq]
  environment:
    - NODE_ENV=production
```

**Health check monitoring:**
```bash
# Add to monitoring system
*/5 * * * * curl -f http://localhost:3002/health || alert-system
```

---

## Success Indicators ✅

**Plugin is working correctly when:**

✅ **Startup logs show:**
- Configuration loaded
- RabbitMQ connected and queues created
- Core integration initialized
- Self-monitoring started
- API server listening on port

✅ **API endpoints respond:**
- `GET /health` returns `{"status": "healthy"}`
- `GET /status` returns comprehensive data
- `GET /metrics` returns self-monitoring data

✅ **Integration working:**
- RabbitMQ messages being published
- Database queries working via RabbitMQ
- Core system health checks successful
- Self-monitoring alerts generated when appropriate

✅ **Logs show:**
- Regular metrics collection
- Health check results
- No critical errors
- Graceful shutdown on stop

---

## Next Steps After Basic Setup 🎯

1. **Customize plugin logic** in `YourPluginService.js`
2. **Add specific health targets** for your use case
3. **Implement custom alerts** and thresholds
4. **Add integration tests** for your specific functionality
5. **Configure monitoring** and alerting for production
6. **Implement missing core endpoints** (plugin registration, health updates)

---

**Following this checklist ensures your plugin will integrate properly with the CoreBridge system and provide robust health monitoring capabilities.** 