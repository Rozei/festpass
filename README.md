# FestPass

A small full-stack ticketing platform for a college fest. Built mainly to practise the **classic "no overbooking" pattern** — many concurrent buyers racing for a finite number of seats on a single event, served correctly without losing or duplicating sales.

- **Backend:** Spring Boot 3 + Spring Data JPA + PostgreSQL row-level locks
- **Frontend:** React (Vite) — minimal: list events, book a seat
- **Infra:** Docker Compose (PostgreSQL + Redis + backend + frontend)
- **Tests:** JUnit 5; concurrency test pattern documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## Why this project exists

Naïve seat-booking code looks fine in development and silently overbooks under real load:

```java
// BROKEN under concurrency
Event e = repo.findById(id).orElseThrow();
if (e.getSeats() > 0) {
    e.setSeats(e.getSeats() - 1);   // two threads both pass the check
    repo.save(e);                    // last write wins → -1 seat
    ticketRepo.save(new Ticket(...));
}
```

FestPass uses a **row-level pessimistic lock** (`SELECT … FOR UPDATE`) inside a transaction so that exactly one transaction holds the event row at decision time, plus an **idempotency key** on the booking endpoint so a retried POST never doubles a sale. Details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Run it

You need Docker and Docker Compose.

```bash
docker compose up --build
```

Services:

| Service | URL |
| --- | --- |
| Frontend (React) | http://localhost:5173 |
| Backend (Spring Boot) | http://localhost:8080 |
| Postgres | localhost:5432 (user `festpass` / pw `festpass`) |
| Redis | localhost:6379 |

The backend seeds 5 sample events at startup (`backend/src/main/resources/data.sql`).

## API

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/events` | — | List all events with remaining seats |
| `GET` | `/api/events/{id}` | — | Single event |
| `POST` | `/api/tickets` | `{ "eventId": 1, "buyerName": "alice", "idempotencyKey": "..." }` | Book one seat. Returns 409 if sold out. |
| `GET` | `/api/tickets/{id}` | — | Lookup a ticket |

Idempotency: pass a unique `idempotencyKey` per logical purchase attempt (UUID is fine). Replays return the original ticket without double-charging.

## Local backend dev (without Docker)

```bash
cd backend
./mvnw spring-boot:run     # needs a Postgres on localhost:5432
```

Override DB config in `backend/src/main/resources/application.yml` or via env vars:

```bash
SPRING_DATASOURCE_URL=jdbc:postgresql://... \
SPRING_DATASOURCE_USERNAME=... \
SPRING_DATASOURCE_PASSWORD=... \
./mvnw spring-boot:run
```

## Local frontend dev

```bash
cd frontend
npm install
npm run dev
```

## Tests

```bash
cd backend
./mvnw test
```

The realistic concurrency test (N threads, M < N seats, assert at most M tickets) needs a real PostgreSQL — it's wired up via Testcontainers so Docker has to be running locally. See `TicketServiceConcurrencyTest.java`.

## Limitations / what a real version would add

- **No payments.** The booking endpoint just confirms; in production this would call a payment provider and only mark `CONFIRMED` after the webhook.
- **No auth.** Anyone can book in any name — fine for a college fest, not for a real ticket platform.
- **Redis is wired up but barely used.** I had it in for rate-limiting and for caching event lookups; only the cache made it into this version.
- **No admin UI.** Events are seeded via SQL.

## License

MIT
