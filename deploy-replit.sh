#!/bin/bash
# Deploy script voor Replit

echo "🚀 Elevizion Dashboard - Replit Deploy Script"
echo "=============================================="

# 1. Database migratie
echo "📦 Database migratie..."
npm run db:push

# 2. Build
echo "🔨 Build..."
npm run build

# 3. Start
echo "🌐 Start server..."
npm run dev
