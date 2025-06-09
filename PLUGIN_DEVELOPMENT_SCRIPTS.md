# Plugin Development Scripts

Two utility scripts to automate CoreBridge plugin development environment setup and cleanup.

## Scripts Overview

### 🔧 `setup-plugin-dev.sh`
**Purpose:** Prepares a safe plugin development environment
- Creates `core-context` symlink to `../coreBridge-Core`
- Sets core system to read-only permissions (555)
- Prevents accidental modification of core system during plugin development

### 🔓 `restore-core-perms.sh`
**Purpose:** Restores normal development environment
- Removes `core-context` symlink
- Restores core system to normal permissions (755)
- Allows normal core system development to resume

## Usage

### Setting Up Plugin Development

```bash
# From within your plugin directory (sibling to coreBridge-Core)
./setup-plugin-dev.sh
```

**Expected directory structure:**
```
├── coreBridge-Core/           # Main core system
└── your-plugin-directory/     # Your plugin (run script here)
    ├── setup-plugin-dev.sh
    ├── restore-core-perms.sh
    └── ...plugin files...
```

**What happens:**
- ✅ Creates `core-context/` symlink pointing to `../coreBridge-Core/`
- ✅ Sets `coreBridge-Core/` to read-only (555 permissions)
- ✅ Your plugin can safely access core configuration via `core-context/`
- ✅ Core system is protected from accidental modification

### Restoring Normal Development

```bash
# When finished with plugin development
./restore-core-perms.sh
```

**What happens:**
- ✅ Removes `core-context/` symlink
- ✅ Restores `coreBridge-Core/` to normal permissions (755)
- ✅ Core system can be modified normally again

## Script Features

### 🛡️ **Safety Features**
- Comprehensive error checking
- Directory structure validation
- Permission verification
- Graceful handling of existing symlinks
- Clear error messages with helpful guidance

### 🔍 **Verification**
- Confirms symlink creation and functionality
- Validates permission changes
- Reports current system status
- Provides troubleshooting information

### ⚡ **Smart Permission Handling**
- Attempts regular `chmod` first
- Falls back to `sudo` when needed
- Handles Docker-created directories appropriately
- Preserves ownership while changing permissions

## Example Plugin Integration

Once `setup-plugin-dev.sh` is run, your plugin can safely access core configuration:

```javascript
// In your plugin code
const path = require('path');
const fs = require('fs');

// Safe read-only access to core configuration
const coreConfigPath = path.join('./core-context', 'src/config/index.js');
const coreConfig = fs.readFileSync(coreConfigPath, 'utf8');

// Access core docker-compose.yml
const dockerComposePath = path.join('./core-context', 'docker-compose.yml');
const dockerConfig = fs.readFileSync(dockerComposePath, 'utf8');
```

## Workflow Example

```bash
# 1. Start plugin development
./setup-plugin-dev.sh

# 2. Develop your plugin with safe core access
npm run dev

# 3. Test plugin integration
npm test

# 4. Finish plugin development
./restore-core-perms.sh

# 5. Work on core system normally
cd ../coreBridge-Core
git add .
git commit -m "Core system changes"
```

## Troubleshooting

### Permission Errors
If you get permission errors, the scripts will automatically try `sudo`. Make sure you have sudo access.

### Directory Structure Issues
Both scripts validate the expected directory structure and provide clear error messages if the setup is incorrect.

### Existing core-context
- If `core-context` exists as a symlink, it will be replaced
- If `core-context` exists as a directory, manual cleanup is required
- Scripts provide clear guidance for manual resolution

### Manual Cleanup
If needed, you can manually perform the operations:

```bash
# Manual setup
ln -s ../coreBridge-Core ./core-context
sudo chmod -R 555 ../coreBridge-Core

# Manual cleanup  
rm core-context
sudo chmod -R 755 ../coreBridge-Core
```

## Integration with Git

Add these scripts to your plugin repository for easy distribution:

```bash
# Add scripts to your plugin repo
git add setup-plugin-dev.sh restore-core-perms.sh PLUGIN_DEVELOPMENT_SCRIPTS.md
git commit -m "Add plugin development scripts"
```

**Note:** The scripts are designed to be run from within plugin directories and are safe to include in plugin repositories. 