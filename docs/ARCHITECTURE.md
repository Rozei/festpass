# FestPass — architecture notes

## The problem

Selling a finite number of seats on a single event to N concurrent buyers, where N can spike during the first few minutes after a popular event opens. Two failure modes to avoid:

1. **Overbooking** — selling more tickets than seats exist.
2. **Double charging on retry** — a flaky network causes the client to retry a successful POST and the user gets two tickets.

## (1) Avoiding overbooking — pessimistic row-level locks

The booking happens in a single `@Transactional` service method:

```java
@Transactional
public Ticket book(BookRequest req) {
    // 1. Idempotency check
    Optional<Ticket> existing = ticketRepo.findByIdempotencyKey(req.idempotencyKey());
    if (existing.isPresent()) return existing.get();

    // 2. Lock the event row for the duration of this transaction
    Event event = eventRepo.findByIdForUpdate(req.eventId())
            .orElseThrow(() -> new EventNotFoundException(req.eventId()));

    // 3. Decision + mutation under the lock
    if (event.getAvailableSeats() <= 0) {
        throw new SoldOutException(req.eventId());
    }
    event.setAvailableSeats(event.getAvailableSeats() - 1);

    Ticket ticket = Ticket.confirmed(event, req.buyerName(), req.idempotencyKey());
    return ticketRepo.save(ticket);
}
```

`findByIdForUpdate` is a custom repository method that emits `SELECT … FOR UPDATE`:

```java
@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("select e from Event e where e.id = :id")
Optional<Event> findByIdForUpdate(@Param("id") Long id);
```

PostgreSQL holds an exclusive row lock until the surrounding transaction commits or rolls back, so only one booking can be in-flight per event at any moment. Every other concurrent transaction queues at the lock; when it gets in, it reads the *fresh* `available_seats` and decides correctly.

### Why pessimistic and not optimistic?

For a sale with high contention — many threads competing for the same row — optimistic locking (`@Version`) would force most of them to retry on `OptimisticLockException`. The retry storm kills throughput. Pessimistic locks serialize cleanly at the cost of some queue latency, which is the right trade for a brief sale.

### Why not `SERIALIZABLE` isolation?

That would also work but it serializes *all* transactions touching the same data, including independent reads of unrelated events. Row-level locks scope the contention to the row that's actually being mutated.

## (2) Avoiding double charging — idempotency keys

Every booking request carries an `idempotencyKey` (UUID generated client-side). The first thing the service does is look up an existing ticket with that key — if found, return it without doing the booking again. The key has a unique index on the `tickets` table, so even racing inserts can't slip through.

A retried POST after a successful first call therefore returns the same ticket ID rather than charging again or consuming a second seat.

## Data model

```
events
  id (pk)              bigint
  name                 varchar
  total_seats          int
  available_seats      int
  starts_at            timestamptz

tickets
  id (pk)              bigint
  event_id (fk)        bigint
  buyer_name           varchar
  idempotency_key      varchar  unique
  status               varchar  -- CONFIRMED / REFUNDED
  created_at           timestamptz
```

## Concurrency test

`TicketServiceConcurrencyTest` (Testcontainers + real PostgreSQL):

1. Seed an event with `available_seats = 50`.
2. Spawn 200 threads, each calling `book(...)` concurrently with a unique idempotency key.
3. Assert: exactly 50 tickets exist, the event row has `available_seats = 0`, and 150 calls failed with `SoldOutException`.

Without the lock this test fails: somewhere between 50 and 200 tickets are created depending on timing. With the lock it passes deterministically.

## What's intentionally not here

- A queue / waiting room for hot sales (sell-out in seconds). For mass-scale you'd want to admit users into a token-gated buy phase rather than letting them all hit the DB at once.
- A payment provider integration. The booking is "confirmed" the moment the row is decremented; a real flow would create a `PENDING` ticket, kick off payment, and mark `CONFIRMED` on a webhook (with a TTL job to release seats whose payments never confirmed).
- Audit log / refund flow. There's a `status` column but only `CONFIRMED` is wired up.
