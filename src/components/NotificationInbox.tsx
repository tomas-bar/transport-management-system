import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell, Route, Wallet, MapPin, ArrowUpRight, Undo2, ReceiptText,
  CheckCheck, ChevronDown, ArrowRight, ClipboardList, Check,
} from 'lucide-react';
import { useApp } from '../context';
import { readOnlySession } from '../domain/access';
import { groupNotifications, notificationDetail } from '../domain/notifications';
import type { AppNotification } from '../domain/workspace';
import { Empty, Badge, Button, Modal } from './ui';
import { HandoverIcon } from './HandoverIcon';

const formatTime = (date: string) => new Intl.DateTimeFormat('lt-LT', {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(date));

function EventIcon({ event }: { event: AppNotification }) {
  const activity = event.activity ?? (event.title.startsWith('Atvykta') ? 'arrival'
    : event.title.startsWith('Paėmimas') ? 'pickup'
    : event.title.includes('pristatytas') ? 'delivery'
    : event.type === 'assignment' ? 'assignment' : 'trip');
  const Icon = activity === 'arrival' ? MapPin : activity === 'correction' ? Undo2
    : activity === 'payment' ? Wallet : activity === 'expense' ? ReceiptText
    : activity === 'assignment' ? ClipboardList : Route;
  return <span className={`event-icon ${activity}`} aria-hidden="true">
    {activity === 'pickup' || activity === 'delivery'
      ? <HandoverIcon kind={activity} size={16} /> : <Icon size={16} />}
  </span>;
}

export function NotificationGroups({ compact = false, unreadOnly = false }: {
  compact?: boolean;
  unreadOnly?: boolean;
}) {
  const { db, workspace, user, readNotifications, navigate, path, busy, session } = useApp();
  const prefix = useId();
  const tripQuery = new URLSearchParams(path.split('?')[1]).get('trip');
  const [expanded, setExpanded] = useState<string[]>(tripQuery ? [`trip:${tripQuery}`] : []);
  if (!user) return null;
  const groups = groupNotifications(db, workspace.notifications, user)
    .filter(group => !unreadOnly || group.unread > 0 || expanded.includes(group.key));
  const visible = compact ? groups.slice(0, 4) : groups;
  const readOnly = readOnlySession(session);
  return <div className={`notification-groups ${compact ? 'compact' : ''}`}>
    {visible.map((group, index) => {
      const open = expanded.includes(group.key);
      const latest = group.events[0];
      const historyId = `${prefix}-${index}`;
      return <section key={group.key} className={`notification-group ${group.unread ? 'has-unread' : ''}`}>
        <button type="button" className="notification-group-toggle" aria-expanded={open}
          aria-controls={historyId} onClick={() => setExpanded(previous => open
            ? previous.filter(key => key !== group.key) : [...previous, group.key])}>
          <span className={`notification-group-icon ${latest.entity.type === 'finance' ? 'finance' : ''}`} aria-hidden="true">
            {latest.entity.type === 'finance' ? <Wallet size={20} />
              : latest.entity.type === 'order' ? <ClipboardList size={20} /> : <Route size={20} />}
          </span>
          <span className="notification-group-summary">
            <span className="notification-group-reference">{group.reference || 'Įmonės veikla'}
              {group.status && <Badge status={group.status} />}</span>
            <b>{group.title}</b>
            {group.driverName && <small>{group.driverName}</small>}
            <span className="notification-preview">{latest.title}</span>
            <small>{formatTime(latest.createdAt)}</small>
            <span className="notification-counts">
              {group.unread > 0 ? <strong>Neskaityta: {group.unread}</strong> : <span><CheckCheck size={13} />Perskaityta</span>}
              <span>Įvykių: {group.events.length}</span>
            </span>
          </span>
          <span className="notification-group-controls"><ChevronDown size={18} className={open ? 'rotated' : ''} /></span>
        </button>
        {open && <div id={historyId} className="notification-event-list">
          {group.events.map(event => {
            const detail = notificationDetail(event, workspace, group);
            return <div className={`notification-event ${!event.readAt ? 'unread' : 'is-read'}`} key={event.id}>
              <EventIcon event={event} />
              <div>
                <span className={`notification-read-state ${event.readAt ? 'is-read' : ''}`}>
                  {event.readAt ? <Check size={12} /> : <i />}{event.readAt ? 'Perskaitytas' : 'Neskaitytas'}
                </span>
                <b>{event.title}</b>
                {detail.body && <p>{detail.body}</p>}
                {detail.actorName && <small>{detail.actorName}</small>}
                <small>{formatTime(event.createdAt)}</small>
                {!event.readAt && <button type="button" className="event-read"
                  aria-label={`Pažymėti perskaitytu: ${event.title}`} disabled={busy || readOnly}
                  onClick={() => readNotifications(event.id)}><CheckCheck size={15} />Perskaityta</button>}
              </div>
            </div>;
          })}
          <div className="notification-group-footer">
            {group.unread > 0 && <button type="button" disabled={busy || readOnly}
              onClick={() => readNotifications(group.events.filter(event => !event.readAt).map(event => event.id))}>
              <CheckCheck size={15} />Pažymėti grupę perskaityta</button>}
            {group.path && <button type="button" onClick={() => navigate(group.path)}>
              {group.path.startsWith('trips/') || group.path.startsWith('my-trips/') ? 'Atidaryti reisą' : 'Atidaryti'}
              <ArrowUpRight size={15} /></button>}
          </div>
        </div>}
      </section>;
    })}
    {!visible.length && <Empty title={unreadOnly ? 'Visi pranešimai perskaityti' : 'Pranešimų nėra'} description="" />}
  </div>;
}

export function NotificationBell() {
  const { workspace, user, navigate, path, readNotifications, busy, session } = useApp();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const unread = workspace.notifications.filter(event => event.recipientId === user?.id && !event.readAt).length;
  useEffect(() => { setOpen(false); }, [path, user?.id]);
  return <div className="notification-anchor">
    <button ref={trigger} type="button" className="notification-button icon-button"
      aria-label={`Pranešimai, neskaitytų: ${unread}`} aria-expanded={open} aria-haspopup="dialog"
      onClick={() => setOpen(previous => !previous)}>
      <Bell size={21} />{unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && createPortal(<div className="notification-overlay">
      <Modal title="Pranešimai" className="notification-dialog" onClose={() => setOpen(false)}>
        <div className="notification-tools">
          <span>{unread ? `Neskaityta: ${unread}` : 'Visi perskaityti'}</span>
          <Button variant="ghost" disabled={busy || !unread || readOnlySession(session)} onClick={() => readNotifications()}>
            <CheckCheck size={17} />Pažymėti visus</Button>
        </div>
        <div className="notification-popover-body"><NotificationGroups compact /></div>
        <footer><Button variant="ghost" onClick={() => navigate('notifications')}>Visi pranešimai<ArrowRight size={16} /></Button></footer>
      </Modal>
    </div>, document.body)}
  </div>;
}
