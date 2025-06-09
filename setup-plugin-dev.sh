#!/bin/bash

# CoreBridge Plugin Development Setup Script
# Creates core-context symlink and locks core system to read-only for safe plugin development

set -e  # Exit on any error

echo "🔧 CoreBridge Plugin Development Setup"
echo "======================================="

# Check if we're in the right directory structure
if [ ! -d "../coreBridge-Core" ]; then
    echo "❌ Error: coreBridge-Core directory not found at ../coreBridge-Core"
    echo "   Please run this script from within a plugin directory that's a sibling to coreBridge-Core"
    echo "   Expected structure:"
    echo "   ├── coreBridge-Core/"
    echo "   └── your-plugin-directory/ ← (run script here)"
    exit 1
fi

echo "📁 Found coreBridge-Core directory"

# Remove existing symlink if it exists
if [ -L "core-context" ]; then
    echo "🗑️  Removing existing core-context symlink..."
    rm core-context
elif [ -d "core-context" ]; then
    echo "❌ Error: core-context exists but is not a symlink"
    echo "   Please remove or rename the existing core-context directory"
    exit 1
fi

# Create the symlink
echo "🔗 Creating core-context symlink..."
ln -s ../coreBridge-Core ./core-context

# Verify symlink was created
if [ ! -L "core-context" ]; then
    echo "❌ Error: Failed to create core-context symlink"
    exit 1
fi

echo "✅ core-context symlink created successfully"

# Set core system to read-only for safety
echo "🔒 Setting coreBridge-Core to read-only permissions..."
echo "   (This prevents accidental modification during plugin development)"

# Try without sudo first
if chmod -R 555 ../coreBridge-Core 2>/dev/null; then
    echo "✅ Read-only permissions set successfully"
else
    echo "🔑 Elevated permissions required, using sudo..."
    if sudo chmod -R 555 ../coreBridge-Core; then
        echo "✅ Read-only permissions set successfully (with sudo)"
    else
        echo "❌ Error: Failed to set read-only permissions"
        echo "   Plugin development can continue, but core system is not protected"
    fi
fi

# Verify the setup
echo ""
echo "🔍 Verifying setup..."

# Check symlink
if [ -L "core-context" ] && [ -d "core-context" ]; then
    echo "✅ core-context symlink is working"
else
    echo "❌ core-context symlink verification failed"
fi

# Check permissions
CORE_PERMS=$(stat -c "%a" ../coreBridge-Core 2>/dev/null || echo "unknown")
if [ "$CORE_PERMS" = "555" ]; then
    echo "✅ coreBridge-Core is read-only (555)"
elif [ "$CORE_PERMS" = "755" ]; then
    echo "⚠️  coreBridge-Core has normal permissions (755) - not locked"
else
    echo "ℹ️  coreBridge-Core permissions: $CORE_PERMS"
fi

echo ""
echo "🚀 Plugin Development Environment Ready!"
echo ""
echo "📋 What you can do now:"
echo "   ✅ Access core system configuration via core-context/ (read-only)"
echo "   ✅ Develop plugins safely without modifying core system"
echo "   ✅ Use core-context in your plugin code for integration"
echo ""
echo "📌 Important Notes:"
echo "   • core-context provides READ-ONLY access to core system"
echo "   • coreBridge-Core is now protected from accidental modification"
echo "   • Run restore-core-perms.sh when finished with plugin development"
echo ""
echo "🔧 Example plugin integration:"
echo "   const coreConfigPath = path.join('./core-context', 'src/config/index.js');"
echo "" 