#!/bin/bash
# Install script for systemd service

set -e

SERVICE_NAME="lightspeed-token-service"
SERVICE_FILE="$SERVICE_NAME.service"
INSTALL_DIR="/opt/$SERVICE_NAME"
USER="lightspeed"
GROUP="lightspeed"

echo "🚀 Installing Lightspeed Token Service..."

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "❌ This script must be run as root (use sudo)"
   exit 1
fi

# Create user and group
echo "👤 Creating service user..."
if ! id "$USER" &>/dev/null; then
    useradd -r -s /bin/false -m -d "$INSTALL_DIR" "$USER"
    echo "✅ Created user: $USER"
else
    echo "✅ User $USER already exists"
fi

# Create installation directory
echo "📁 Creating installation directory..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/logs"

# Copy application files
echo "📂 Copying application files..."
cp -r . "$INSTALL_DIR/"
chown -R "$USER:$GROUP" "$INSTALL_DIR"
chmod +x "$INSTALL_DIR/cli.ts"

# Install dependencies (requires bun to be installed)
echo "📦 Installing dependencies..."
cd "$INSTALL_DIR"
if command -v bun >/dev/null 2>&1; then
    sudo -u "$USER" bun install --frozen-lockfile
    sudo -u "$USER" bunx prisma generate
else
    echo "⚠️  Bun not found. Please install Bun first: https://bun.sh"
    exit 1
fi

# Install systemd service
echo "⚙️  Installing systemd service..."
cp "$SERVICE_FILE" "/etc/systemd/system/"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "1. Create /opt/$SERVICE_NAME/.env with your environment variables:"
echo "   DATABASE_URL=..."
echo "   TOKEN_ENCRYPTION_KEY=..."
echo "   LIGHTSPEED_CLIENT_ID=..."
echo "   LIGHTSPEED_CLIENT_SECRET=..."
echo ""
echo "2. Start the service:"
echo "   sudo systemctl start $SERVICE_NAME"
echo ""
echo "3. Check status:"
echo "   sudo systemctl status $SERVICE_NAME"
echo ""
echo "4. View logs:"
echo "   journalctl -u $SERVICE_NAME -f"