import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from '../src/data/seed.ts';
import { createWorkspace, notificationChanges } from '../src/domain/workspace.ts';
import { groupNotifications, markNotificationsRead, notificationDetail } from '../src/domain/notifications.ts';
test('trip events state the outcome and keep actor attribution separate from display text', () => {
  const db = createSeed('2026-10-22'), workspace = createWorkspace(db), next = structuredClone(db);
  next.trips[0].status = 'completed';
  const events = notificationChanges(db, next, workspace, 'user-d1');
  const event = events.find(n => n.recipientId === 'admin')!;
  assert.equal(event.title, 'Reisas užbaigtas');
  assert.equal(event.actorId, 'user-d1');
  assert.equal(event.body, '');
  const group = groupNotifications(next, events, workspace.users[0])[0];
  assert.equal(group.status, 'completed');
  assert.equal(group.driverName, 'Gediminas Stankevičius');
  assert.equal(notificationDetail(event, workspace, group).actorName, '');
  assert.equal(event.actorId, 'user-d1');
});
test('legacy event display removes redundant context without mutating saved history', () => {
  const db = createSeed('2026-10-22'), workspace = createWorkspace(db);
  const event = { id: 'legacy', recipientId: 'admin', type: 'trip' as const, title: 'Reiso būsena pakeista', body: 'KR-1001 · Gediminas Stankevičius', entity: { type: 'trip' as const, id: 't1' }, createdAt: '2026-10-22T12:00:00Z' };
  const group = groupNotifications(db, [event], workspace.users[0])[0];
  assert.deepEqual(notificationDetail(event, workspace, group), { body: '', actorName: '' });
  assert.equal(event.body, 'KR-1001 · Gediminas Stankevičius');
});
test('workspace fixtures use a deterministic anchor and never share mutable references', () => {
  const db = createSeed('2026-10-22'), one = createWorkspace(db), two = createWorkspace(db);
  assert.deepEqual(one, two);
  one.notifications[0].title = 'Edited';
  assert.notEqual(one.notifications[0].title, two.notifications[0].title);
});

test('reading captured events retains later arrivals and other recipients unread state', () => {
  const db = createSeed('2026-10-22'), workspace = createWorkspace(db);
  const admin = workspace.users.find(user => user.role === 'admin')!;
  const dispatcher = workspace.users.find(user => user.role === 'dispatcher')!;
  const event = workspace.notifications.find(event => event.recipientId === admin.id)!;
  event.readAt = undefined;
  const captured = groupNotifications(db, workspace.notifications, admin)
    .flatMap(group => group.events.filter(item => !item.readAt).map(item => item.id));
  workspace.notifications.push({ ...event, id: 'later-event', readAt: undefined });
  workspace.notifications.push({ ...event, id: 'dispatcher-event', recipientId: dispatcher.id, readAt: undefined });
  markNotificationsRead(workspace, admin.id, [...captured, 'dispatcher-event']);
  assert(workspace.notifications.find(item => item.id === event.id)!.readAt);
  assert.equal(workspace.notifications.find(item => item.id === 'later-event')!.readAt, undefined);
  assert.equal(workspace.notifications.find(item => item.id === 'dispatcher-event')!.readAt, undefined);
  assert.equal(groupNotifications(db, workspace.notifications, admin).reduce((sum, group) => sum + group.unread, 0), 1);
});
