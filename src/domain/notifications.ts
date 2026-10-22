import type {TripStatus} from './models';
import type { Database } from './models';
import type { AppNotification, Workspace, WorkspaceUser } from './workspace';
export interface NotificationGroup {key:string;title:string;reference:string;path:string;events:AppNotification[];unread:number;status?:TripStatus;driverName?:string}
export function groupNotifications(db:Database,events:AppNotification[],user:WorkspaceUser):NotificationGroup[] {
 const groups=new Map<string,NotificationGroup>();
 for(const event of events.filter(n=>n.recipientId===user.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))) {
  // Resolve legacy order-linked events to their trip without modifying persisted history.
  const tripId=event.entity.type==='trip'?event.entity.id:event.entity.type==='order'?db.orders.find(o=>o.id===event.entity.id)?.tripId:'';
  const trip=db.trips.find(t=>t.id===tripId);
  const key=tripId?`trip:${tripId}`:`${event.entity.type}:${event.entity.type==='finance'?'all':event.entity.id||'unassigned'}`;
  let group=groups.get(key);
  if(!group){group={key,title:trip?.name??(tripId?'Reiso istorija':event.entity.type==='finance'?'Finansai':'Užsakymai'),reference:trip?.number??'',status:trip?.status,driverName:trip?[db.drivers.find(d=>d.id===trip.driverId)?.firstName,db.drivers.find(d=>d.id===trip.driverId)?.lastName].filter(Boolean).join(' '):undefined,path:trip&&(user.role!=='driver'||trip.driverId===user.driverId)?`${user.role==='driver'?'my-trips':'trips'}/${trip.id}`:!tripId&&user.role!=='driver'?(event.entity.type==='finance'?'finances':'orders?assignment=unassigned'):'',events:[],unread:0};groups.set(key,group);}
  group.events.push(event);if(!event.readAt)group.unread++;
 }
 return [...groups.values()];
}
export function markNotificationsRead(workspace:Workspace,userId:string,ids?:string[]) {
 for(const n of workspace.notifications)if(n.recipientId===userId&&(!ids||ids.includes(n.id))&&!n.readAt)n.readAt=new Date().toISOString();
}

export function notificationDetail(event:AppNotification, workspace:Workspace, group:NotificationGroup) {
 let body=event.body;
 const legacyActor=workspace.users.find(u=>body.endsWith(' · '+u.name));
 const actor=workspace.users.find(u=>u.id===event.actorId)??legacyActor;
 if(legacyActor)body=body.slice(0,-(' · '+legacyActor.name).length);
 if(group.reference&&body===group.reference)body='';
 return {body,actorName:actor&&actor.name!==group.driverName?actor.name:''};
}
