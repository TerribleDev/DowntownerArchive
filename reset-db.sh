
#!/bin/bash

# Drop existing tables
psql $DATABASE_URL -c "DROP TABLE IF EXISTS newsletters CASCADE;"
psql $DATABASE_URL -c "DROP TABLE IF EXISTS subscriptions CASCADE;"
psql $DATABASE_URL -c "DROP TABLE IF EXISTS _prisma_migrations CASCADE;"

# Run migrations to recreate tables
npx drizzle-kit push:pg
