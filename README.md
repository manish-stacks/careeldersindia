# ParentCare — Backend + Admin

```
parentcare/
├── backend/   Express monolith · REST /api/v1 · Socket.IO · BullMQ workers · Swagger · seed · tests
└── admin/     Next.js 14 (App Router, TS, Tailwind, React Query, socket.io-client, Leaflet, Recharts)
```

## Quick start (local)

Requirements: Node 20+, Docker (for MongoDB 7 + Redis 7).

```bash
# 1. infrastructure (Mongo single-node replica set + Redis)
cd backend
docker compose up -d

# 2. API
cp .env.example .env          # set JWT secrets / ENCRYPTION_KEY for anything beyond local
npm install
npm run seed:reset            # demo data (see logins below)
npm run dev                   # API + Socket.IO on :5000 (workers run in-process when RUN_WORKERS=true)
# optional, production-style: RUN_WORKERS=false for the API and `npm run worker` in a second process

# 4. Mobile: cd ../mobile && cp .env.example .env (LAN IP) && npm install && npx expo start

# 3. Admin
cd ../admin
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:5000
npm install
npm run dev                   # http://localhost:3000
```

API docs: http://localhost:5000/api-docs (OpenAPI JSON at `/api-docs.json`) · health: `/health`

## Demo logins (after `npm run seed:reset`)

| Role | Login | Password | Notes |
|---|---|---|---|
| Admin | admin@parentcare.in | Admin@12345 | admin console |
| Customer | rohan@example.com | Customer@123 | owns Sushila + Ramesh |
| Customer | priya@example.com | Customer@123 | owns Kamala (weekly plan), view access to Sushila |
| Assistant | neha@parentcare.in | Assistant@123 | APPROVED · Gurugram · has a live ON_THE_WAY visit |
| Assistant | arjun@parentcare.in | Assistant@123 | APPROVED · Kochi |
| Assistant | vikram@parentcare.in | Assistant@123 | PENDING · no government ID yet (approval blocked) |
