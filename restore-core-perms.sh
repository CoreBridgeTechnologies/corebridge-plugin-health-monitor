#!/bin/bash

# CoreBridge Plugin Development Cleanup Script
# Removes core-context symlink and restores normal permissions to core system

set -e  # Exit on any error

echo "🔓 CoreBridge Plugin Development Cleanup"
echo "========================================"

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

# Check current permissions
CORE_PERMS=$(stat -c "%a" ../coreBridge-Core 2>/dev/null || echo "unknown")
echo "📊 Current coreBridge-Core permissions: $CORE_PERMS"

# Remove core-context symlink if it exists
if [ -L "core-context" ]; then
    echo "🗑️  Removing core-context symlink..."
    rm core-context
    echo "✅ core-context symlink removed"
elif [ -d "core-context" ]; then
    echo "⚠️  core-context exists but is not a symlink"
    echo "   This may be a real directory. Manual cleanup required."
    echo "   To remove: rm -rf core-context"
elif [ -e "core-context" ]; then
    echo "⚠️  core-context exists but is not a directory or symlink"
    echo "   Manual cleanup may be required."
else
    echo "ℹ️  No core-context symlink found (already cleaned up)"
fi

# Restore normal permissions to core system
if [ "$CORE_PERMS" = "555" ]; then
    echo "🔓 Restoring normal permissions to coreBridge-Core..."
    echo "   (Changing from read-only 555 to normal 755)"
    
    # Try without sudo first
    if chmod -R 755 ../coreBridge-Core 2>/dev/null; then
        echo "✅ Normal permissions restored successfully"
    else
        echo "🔑 Elevated permissions required, using sudo..."
        if sudo chmod -R 755 ../coreBridge-Core; then
            echo "✅ Normal permissions restored successfully (with sudo)"
        else
            echo "❌ Error: Failed to restore normal permissions"
            echo "   You may need to manually restore permissions:"
            echo "   sudo chmod -R 755 ../coreBridge-Core"
            exit 1
        fi
    fi
elif [ "$CORE_PERMS" = "755" ]; then
    echo "ℹ️  coreBridge-Core already has normal permissions (755)"
else
    echo "⚠️  coreBridge-Core has custom permissions ($CORE_PERMS)"
    echo "   You may want to verify these are correct for your setup"
fi

# Verify the cleanup
echo ""
echo "🔍 Verifying cleanup..."

# Check symlink is gone
if [ ! -e "core-context" ]; then
    echo "✅ core-context symlink removed successfully"
else
    echo "⚠️  core-context still exists - manual cleanup may be needed"
fi

# Check permissions are restored
NEW_PERMS=$(stat -c "%a" ../coreBridge-Core 2>/dev/null || echo "unknown")
if [ "$NEW_PERMS" = "755" ]; then
    echo "✅ coreBridge-Core has normal permissions (755)"
else
    echo "ℹ️  coreBridge-Core permissions: $NEW_PERMS"
fi

echo ""
echo "🎉 Plugin Development Environment Cleaned Up!"
echo ""
echo "📋 What has been restored:"
echo "   ✅ core-context symlink removed"
echo "   ✅ coreBridge-Core permissions restored to normal (755)"
echo "   ✅ Core system can now be modified normally"
echo ""
echo "🔧 Core system status:"
echo "   • Files can now be edited normally"
echo "   • Git operations work without restrictions" 
echo "   • Docker operations fully functional"
echo "   • Development workflow restored"
echo ""
echo "📌 Next steps:"
echo "   • You can now work on the core system normally"
echo "   • Run setup-plugin-dev.sh again when developing new plugins"
echo "   • Remember to create core-context symlinks manually in other plugin directories"
echo "" 