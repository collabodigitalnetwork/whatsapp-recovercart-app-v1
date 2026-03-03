#!/bin/sh

# Exit on any error
set -e

echo "🚀 Starting WhatsApp RecoverCart App..."

# Wait for database to be ready
echo "⏳ Waiting for database connection..."
npx prisma db push --accept-data-loss || {
    echo "❌ Database connection failed"
    exit 1
}

# Run database migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy || {
    echo "❌ Database migration failed"
    exit 1
}

# Generate Prisma client (in case it's missing)
echo "🔧 Generating Prisma client..."
npx prisma generate

# Seed database if needed (only in development)
if [ "$NODE_ENV" != "production" ]; then
    echo "🌱 Seeding database..."
    npx prisma db seed || echo "⚠️  Database seeding skipped"
fi

# Start the worker process in background
echo "👷 Starting background worker..."
npm run worker &
WORKER_PID=$!

# Function to handle shutdown
shutdown() {
    echo "🛑 Shutting down gracefully..."
    kill $WORKER_PID 2>/dev/null || true
    exit 0
}

# Set up signal handlers
trap shutdown SIGTERM SIGINT

# Start the main application
echo "🌟 Starting main application on port ${PORT:-3000}..."
exec npm start

# Keep the script running
wait