import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSeed} from '../src/data/seed.ts';
import {createWorkspace,applyDriverCommand,validateWorkspace,notificationChanges} from '../src/domain/workspace.ts';
import {groupNotifications,markNotificationsRead} from '../src/domain/notifications.ts';
import {routeVisits} from '../src/domain/route-plan.ts';
const fixture=()=>{const db=createSeed('2026-10-22');return {db,workspace:createWorkspace(db)};};
test('one task action confirms an upcoming visit and can be safely undone',()=>{
 const s=fixture(),user=s.workspace.users.find(u=>u.id==='user-d2')!,trip=s.db.trips.find(t=>t.id==='t2')!;
 applyDriverCommand(s,user,{type:'start',tripId:trip.id});
 const visits=routeVisits(trip.stops);const index=visits.findIndex(v=>v.stops.some(stop=>stop.kind==='pickup'));
 for(let i=0;i<index;i++)applyDriverCommand(s,user,{type:'arrive',tripId:trip.id,visitIndex:i});
 const visit=visits[index];const pickup=visit.stops.find(stop=>stop.kind==='pickup')!;
 applyDriverCommand(s,user,{type:'task',tripId:trip.id,orderId:pickup.orderId!,kind:'pickup'});
 assert(routeVisits(trip.stops)[index].completed);const event=s.workspace.confirmations[0];assert(event.arrivalStopIds?.length);
 applyDriverCommand(s,user,{type:'undoTask',tripId:trip.id,confirmationId:event.id});
 assert(!routeVisits(trip.stops)[index].completed);assert.equal(s.workspace.confirmations.length,0);assert.equal(s.workspace.corrections?.length,1);validateWorkspace(s.workspace,s.db);
});
test('task confirmation cannot jump ahead and undo cannot invalidate a delivery',()=>{
 const s=fixture(),user=s.workspace.users.find(u=>u.id==='user-d1')!,trip=s.db.trips.find(t=>t.id==='t1')!;
 const order=s.db.orders.find(o=>o.id===routeVisits(trip.stops)[0].stops.find(stop=>stop.kind==='pickup')!.orderId)!;
 const command={type:'task' as const,tripId:trip.id,orderId:order.id};
 applyDriverCommand(s,user,{...command,kind:'pickup'});
 assert.throws(()=>applyDriverCommand(s,user,{...command,kind:'delivery'}),/eilę/);
 const pickupId=s.workspace.confirmations[0].id;
 while(routeVisits(trip.stops).some(v=>!v.completed))applyDriverCommand(s,user,{type:'arrive',tripId:trip.id,visitIndex:routeVisits(trip.stops).findIndex(v=>!v.completed)});
 applyDriverCommand(s,user,{...command,kind:'delivery'});
 assert.throws(()=>applyDriverCommand(s,user,{type:'undoTask',tripId:trip.id,confirmationId:pickupId}),/pristatymo/);
 applyDriverCommand(s,user,{type:'undoTask',tripId:trip.id,confirmationId:s.workspace.confirmations.find(c=>c.kind==='delivery')!.id});
 assert.equal(order.status,'active');
 applyDriverCommand(s,user,{type:'undoTask',tripId:trip.id,confirmationId:pickupId});validateWorkspace(s.workspace,s.db);
});
test('arrival undo is limited to the last visit without confirmed tasks',()=>{
 const s=fixture(),user=s.workspace.users.find(u=>u.id==='user-d1')!,trip=s.db.trips.find(t=>t.id==='t1')!;
 applyDriverCommand(s,user,{type:'arrive',tripId:trip.id,visitIndex:1});
 assert.throws(()=>applyDriverCommand(s,user,{type:'undoArrival',tripId:trip.id,visitIndex:0}),/paskutinį/);
 applyDriverCommand(s,user,{type:'undoArrival',tripId:trip.id,visitIndex:1});assert(!routeVisits(trip.stops)[1].completed);
});
test('group expansion read state stays independent for each recipient and new events stay unread',()=>{
 const s=fixture(),admin=s.workspace.users[0],dispatcher=s.workspace.users.find(u=>u.role==='dispatcher')!;
 const next=structuredClone(s.db);next.trips[0].status='completed';
 const events=notificationChanges(s.db,next,s.workspace,'user-d1');s.workspace.notifications.push(...events);
 const groups=groupNotifications(s.db,s.workspace.notifications,admin);const trip=groups.find(g=>g.key==='trip:t1')!;assert.equal(trip.unread,1);
 markNotificationsRead(s.workspace,dispatcher.id,events.map(e=>e.id));
 assert.equal(groupNotifications(s.db,s.workspace.notifications,admin).find(g=>g.key==='trip:t1')!.unread,1);
 markNotificationsRead(s.workspace,admin.id,trip.events.map(e=>e.id));assert.equal(groupNotifications(s.db,s.workspace.notifications,admin).find(g=>g.key==='trip:t1')!.unread,0);
 const latest={...trip.events[0],id:'fresh',readAt:undefined,createdAt:'2099-01-01T00:00:00Z'};s.workspace.notifications.push(latest);
 assert.equal(groupNotifications(s.db,s.workspace.notifications,admin)[0].unread,1);
 assert.equal(groupNotifications(s.db,s.workspace.notifications,admin)[0].events.length,2);
});
test('financial notifications never reach driver recipients',()=>{
 const s=fixture(),next=structuredClone(s.db);next.orders[0].paid+=100;
 const events=notificationChanges(s.db,next,s.workspace,'dispatcher');assert(events.some(e=>e.recipientId==='admin'&&e.activity==='payment'));assert(!events.some(e=>e.recipientId.startsWith('user-')));
});
