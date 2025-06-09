# CoreBridge Plugin Integration Essentials

**Everything you need to know to get a plugin properly integrated and functioning.**

## 🔑 Critical Requirements

### 1. Core-Context Setup (MANDATORY)
```bash
# Create read-only symbolic link to core system
ln -s ../coreBridge-Core ./core-context
chmod -R 555 ../coreBridge-Core  # CRITICAL: Make read-only

# Verify: ls -la core-context/ should show dr-xr-xr-x
```

### 2. RabbitMQ Integration (Database Access)
- **Purpose**: Database queries and health checks via message queues
- **Required Exchanges**: `health.exchange`, `system.exchange`
- **Required Queues**: `health.metrics`, `database.health`
- **Pattern**: Publish query request → Receive response

### 3. Core System Dependencies
- PostgreSQL (5432) - Database
- Redis (6379) - Cache  
- RabbitMQ (5672/15672) - Messaging
- Core API (4001) - Main API

## 📋 Minimum File Structure

```
your-plugin/
├── .env                          # Environment configuration
├── package.json                  # Dependencies
├── core-context/                 # Symbolic link (read-only)
├── logs/                         # Log files
└── src/
    ├── index.js                  # Express API entry point
    ├── config/index.js           # Configuration management
    ├── services/
    │   ├── RabbitMQService.js    # RabbitMQ + database access
    │   ├── CoreIntegrationService.js # Core API integration
    │   ├── SelfMonitoringService.js  # Memory/CPU/health monitoring
    │   └── YourPluginService.js  # Main plugin logic
    └── utils/
        └── logger.js             # Winston logging
```

## 🌐 Required API Endpoints

```javascript
// Public (no authentication)
GET  /health                     # {"status": "healthy", "uptime": 123}

// Authenticated (X-API-Key header required)
GET  /status                     # Comprehensive plugin status
GET  /metrics                    # Self-monitoring metrics
GET  /alerts                     # Recent alerts/issues
POST /control/pause              # Pause plugin operations
POST /control/resume             # Resume plugin operations
```

## ⚙️ Essential Environment Variables

```bash
# Core Integration
COREBRIDGE_API_URL=http://localhost:4001
COREBRIDGE_API_KEY=your-api-key

# RabbitMQ (must match core system)
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=admin
RABBITMQ_PASSWORD=password

# Security
API_KEY=your-plugin-secret-key
ENABLE_API_KEY=true

# Plugin
PLUGIN_PORT=3002
NODE_ENV=development
```

## 🧪 Integration Testing Commands

```bash
# Configuration test
node -e "require('./src/config'); console.log('✓ Config loaded');"

# Health check test  
curl http://localhost:3002/health

# Authenticated endpoint test
curl -H "X-API-Key: your-secret" http://localhost:3002/status

# Core system test
curl http://localhost:4001/health

# RabbitMQ test
curl http://localhost:15672
```

## 📊 Self-Monitoring Requirements

**Track these metrics automatically:**
- Memory usage (RSS, heap)
- CPU utilization  
- Event loop delay
- RabbitMQ connection status
- Core system connectivity

**Generate alerts for:**
- High memory usage (>500MB)
- High CPU usage (>80%)
- Event loop delays (>100ms)
- Connection failures

## 🚨 Common Integration Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Plugin won't start | Missing .env or RabbitMQ down | Create .env, start RabbitMQ |
| 404 from core system | Endpoints not implemented | Normal - implement in core later |
| RabbitMQ connection failed | Wrong credentials | Check admin/password in .env |
| Authentication errors | Wrong API key | Verify X-API-Key header |
| High memory alerts | Normal for Node.js | Increase threshold or investigate |

## ✅ Success Indicators

**Your plugin is working when:**

1. **Startup logs show:**
   - ✅ Configuration loaded
   - ✅ RabbitMQ connected
   - ✅ Core integration initialized  
   - ✅ API server listening

2. **API responses:**
   - ✅ `/health` returns `{"status": "healthy"}`
   - ✅ `/status` returns comprehensive data
   - ✅ `/metrics` shows self-monitoring data

3. **Integration working:**
   - ✅ RabbitMQ messages published
   - ✅ Database queries via RabbitMQ
   - ✅ Self-monitoring alerts generated

## 🚀 Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong API keys and passwords
- [ ] Configure health check monitoring
- [ ] Set up log rotation
- [ ] Implement graceful shutdown
- [ ] Add to Docker Compose
- [ ] Configure reverse proxy/load balancer

## 📖 Documentation Files Created

1. **`PLUGIN_DEVELOPMENT_GUIDE.md`** - Comprehensive development guide
2. **`QUICK_START_CHECKLIST.md`** - Step-by-step setup checklist  
3. **`PLUGIN_INTEGRATION_ESSENTIALS.md`** - This summary document

---

**Following these essentials ensures your plugin integrates properly with CoreBridge and provides reliable health monitoring capabilities.** 