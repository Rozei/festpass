const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080';

export async function listEvents() {
  const res = await fetch(`${API_BASE}/api/events`);
  if (!res.ok) throw new Error(`GET /api/events failed: ${res.status}`);
  return res.json();
}

export async function bookTicket({ eventId, buyerName }) {
  // A fresh idempotency key per logical purchase attempt.
  // If the user clicks "Book" twice the second click reuses this key, so the
  // server returns the original ticket instead of consuming a second seat.
  const idempotencyKey = crypto.randomUUID();
  const res = await fetch(`${API_BASE}/api/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId, buyerName, idempotencyKey }),
  });
  if (res.status === 409) throw new Error('SOLD_OUT');
  if (!res.ok) throw new Error(`POST /api/tickets failed: ${res.status}`);
  return res.json();
}
