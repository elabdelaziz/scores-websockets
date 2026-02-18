# Sportz - Real-time Sports Commentary API

A real-time sports commentary API with WebSocket support for live match updates.

## Features

- 🏟️ Multi-sport support (football, cricket, basketball)
- 📡 Real-time WebSocket broadcasts
- 💬 Live commentary updates
- 🔒 Rate limiting and security (Arcjet)
- 🎮 Built-in demo mode for production testing

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Run database migrations
npm run db:migrate

# Start the server
npm run dev
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8000` |
| `HOST` | Server host | `0.0.0.0` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `ARCJET_KEY` | Arcjet API key for security | Optional |
| `DEMO_MODE` | Enable demo mode for testing | `false` |

## API Endpoints

### Matches

- `GET /matches` - List all matches
- `POST /matches` - Create a new match

### Commentary

- `GET /matches/:id/commentary` - Get commentary for a match
- `POST /matches/:id/commentary` - Add commentary to a match

### WebSocket

Connect to `ws://localhost:8000/ws` and send:

```json
{"type": "subscribe", "matchId": 1}
```

You'll receive real-time commentary updates:

```json
{"type": "commentary", "data": {...}}
```

---

## 🎮 Demo Mode

Demo mode allows production users to experience the WebSocket flow without needing external seed scripts or manual data entry. It generates simulated live commentary events server-side.

### Enabling Demo Mode

Set the `DEMO_MODE` environment variable:

```bash
DEMO_MODE=true npm run dev
```

Or add to your `.env` file:

```
DEMO_MODE=true
```

### Demo Endpoints

When demo mode is enabled, additional endpoints become available:

#### Start a Demo Match

```bash
POST /demo/start

# Example
curl -X POST http://localhost:8000/demo/start \
  -H "Content-Type: application/json" \
  -d '{
    "sport": "football",
    "eventIntervalMs": 3000,
    "maxEvents": 50
  }'
```

**Options:**
- `sport` - Sport type: `football`, `cricket`, or `basketball` (default: `football`)
- `customTeams` - Custom team names `{ home: string, away: string }`
- `durationMinutes` - Match duration in minutes (default: 90)
- `eventIntervalMs` - Milliseconds between events (default: 5000)
- `maxEvents` - Maximum events to generate (default: 50)

#### Stop a Demo

```bash
POST /demo/stop

# Example
curl -X POST http://localhost:8000/demo/stop \
  -H "Content-Type: application/json" \
  -d '{"matchId": 1}'
```

#### List Active Demos

```bash
GET /demo/sessions
```

#### List Supported Sports

```bash
GET /demo/sports
```

### Testing WebSocket with Demo Mode

1. Start the server with demo mode enabled
2. Connect to the WebSocket: `ws://localhost:8000/ws`
3. Start a demo match via `/demo/start`
4. Subscribe to the match: `{"type": "subscribe", "matchId": <id>}`
5. Watch live commentary events flow in real-time!

### Demo Mode Security

Demo mode is **disabled by default** in production. It must be explicitly enabled via the `DEMO_MODE=true` environment variable. This prevents unintended demo data in production environments.

---

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Generate database migrations
npm run db:generate

# Open Drizzle Studio
npm run db:studio
```

## License

ISC
