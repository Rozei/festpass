import { useEffect, useState } from 'react';
import { listEvents, bookTicket } from './api.js';

export default function App() {
  const [events, setEvents] = useState([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState('');

  async function refresh() {
    try {
      setEvents(await listEvents());
    } catch (e) {
      setMessage(`Could not load events: ${e.message}`);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleBook(eventId) {
    if (!name.trim()) {
      setMessage('Enter your name first.');
      return;
    }
    setBusy(eventId);
    setMessage('');
    try {
      const ticket = await bookTicket({ eventId, buyerName: name.trim() });
      setMessage(`Ticket #${ticket.id} confirmed for ${name.trim()}.`);
      await refresh();
    } catch (e) {
      setMessage(e.message === 'SOLD_OUT' ? 'Sold out.' : `Error: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>FestPass</h1>
      <p style={{ color: '#555' }}>Book a seat at one of the upcoming college fest events.</p>

      <label style={{ display: 'block', marginBottom: '1rem' }}>
        Your name:{' '}
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ padding: '0.4rem', minWidth: '240px' }} />
      </label>

      {message && <p style={{ background: '#f5f5f5', padding: '0.6rem 1rem' }}>{message}</p>}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {events.map((ev) => (
          <li key={ev.id} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1rem', margin: '0.6rem 0' }}>
            <strong>{ev.name}</strong>
            <div style={{ color: '#777', fontSize: '0.9rem' }}>
              {ev.availableSeats} / {ev.totalSeats} seats left
            </div>
            <button
              onClick={() => handleBook(ev.id)}
              disabled={busy === ev.id || ev.availableSeats <= 0}
              style={{ marginTop: '0.6rem', padding: '0.4rem 1rem', cursor: 'pointer' }}
            >
              {ev.availableSeats <= 0 ? 'Sold out' : busy === ev.id ? 'Booking…' : 'Book a seat'}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
