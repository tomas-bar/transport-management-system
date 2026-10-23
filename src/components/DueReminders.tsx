import { isDraft } from '../domain/record-mode';
import { useEffect, useState } from 'react';
import { useApp } from '../context';
import { api } from '../services/server-api';
export function DueReminders({ day }: { day: string }) {
  const { modules, serverMode, db, navigate } = useApp();
  const [rows, setRows] = useState<{ id: string; vehicle_id: string; title: string; due_date: string; done: number }[]>([]);
  const enabled = serverMode && modules.includes('maintenance');
  useEffect(() => { if (enabled) api<typeof rows>('/api/reminders').then(setRows).catch(() => {}); }, [enabled]);
  if (!enabled) return null;
  const vehicles = new Set(db.trips.filter(t => !isDraft(t) && t.departure.slice(0, 10) <= day && t.arrival.slice(0, 10) >= day && !['cancelled', 'completed'].includes(t.status)).map(t => t.vehicleId));
  const due = rows.filter(r => !r.done && r.due_date <= day && vehicles.has(r.vehicle_id));
  return due.length ? <div className="operational-warnings">{due.map(row => <p key={row.id}><button className="text-link" onClick={() => navigate('maintenance')}>{db.vehicles.find(v => v.id === row.vehicle_id)?.plate}: {row.title} · {row.due_date}</button></p>)}</div> : null;
}
