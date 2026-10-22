import type {ModuleId} from './modules.ts';
import {validateFinanceRecords,type DriverPermissions,type PaymentReceipt,type ExpenseSubmission} from './trip-finance.ts';
import type { Database } from './models.ts';
import { routeVisits, setVisitCompleted, visitTasks } from './route-plan.ts';
export type Role = 'owner' | 'admin' | 'dispatcher' | 'driver';
export const roleLabels: Record<Role, string> = {
  owner: 'Platformos savininkas',
  admin: 'Įmonės administratorius',
  dispatcher: 'Vadybininkas',
  driver: 'Vairuotojas'
};
export interface WorkspaceUser {
  id: string;
  companyId: string;
  name: string;
  email: string;
  role: Role;
  driverId: string;
  active: boolean;
  permissions?:DriverPermissions;
}
export interface AppNotification {
  id: string;
  recipientId: string;
  actorId?: string;
  type: 'assignment' | 'trip' | 'task' | 'finance';
  activity?: 'assignment' | 'trip' | 'arrival' | 'pickup' | 'delivery' | 'correction' | 'payment' | 'expense';
  title: string;
  body: string;
  entity: {
    type: 'trip' | 'order' | 'finance';
    id: string;
  };
  createdAt: string;
  readAt?: string;
}
export interface TaskConfirmation {
  id: string;
  tripId: string;
  orderId: string;
  kind: 'pickup' | 'delivery';
  actorId: string;
  createdAt: string;
  arrivalStopIds?: string[];
}
export interface Workspace {
  version: 1;
  companyId: string;
  users: WorkspaceUser[];
  notifications: AppNotification[];
  confirmations: TaskConfirmation[];
  receipts?:PaymentReceipt[];
  expenseSubmissions?:ExpenseSubmission[];
  printMode?: 'monochrome' | 'color';
  corrections?: {id:string;tripId:string;actorId:string;description:string;createdAt:string}[];
  preferences: Record<string, {
    inApp: boolean;
  }>;
}
export interface ReviewSnapshot {
  db: Database;
  workspace: Workspace;
}
export type DriverCommand = {
  type: 'start' | 'finish';
  tripId: string;
} | {
  type: 'arrive';
  tripId: string;
  visitIndex: number;
} | {
  type: 'task';
  tripId: string;
  orderId: string;
  kind: 'pickup' | 'delivery';
} | {type:'undoTask';tripId:string;confirmationId:string} | {type:'undoArrival';tripId:string;visitIndex:number};
export const managerRole = (user: WorkspaceUser | null) => !!user && user.active && user.role !== 'driver';
export function canOpen(user: WorkspaceUser | null, section: string, modules?: ModuleId[]) {
  if (!user?.active) return false;
  if (user.role === 'owner') return ['platform', 'profile'].includes(section);
  if (modules && section === 'finances' && !modules.includes('finance')) return false;
  if (modules && section === 'maintenance' && !modules.includes('maintenance')) return false;
  if (modules && section === 'freight' && !modules.includes('freight')) return false;
  if (section === 'profile' || section === 'notifications') return true;
  if (user.role === 'driver') return section === 'my-trips';
  if (['users', 'settings'].includes(section)) return user.role === 'admin';
  return ['overview', 'trips', 'orders', 'routes', 'vehicles', 'drivers', 'customers', 'finances', 'maintenance', 'freight'].includes(section);
}
export function createWorkspace(db: Database): Workspace {
  const companyId = 'company-review';
  const users: WorkspaceUser[] = [{
    id: 'admin',
    companyId,
    name: 'Darius Petrauskas',
    email: 'admin@example.test',
    role: 'admin',
    driverId: '',
    active: true
  }, {
    id: 'dispatcher',
    companyId,
    name: 'Rūta Kazlauskienė',
    email: 'ruta@example.test',
    role: 'dispatcher',
    driverId: '',
    active: true
  }, ...db.drivers.map(d => ({
    id: `user-${d.id}`,
    companyId,
    name: `${d.firstName} ${d.lastName}`,
    email: d.email || `${d.id}@example.test`,
    role: 'driver' as const,
    driverId: d.id,
    active: true
  }))];
  const workspace: Workspace = {
    version: 1,
    companyId,
    users,
    notifications: [],
    confirmations: [],
    preferences: {}
  };
  for (const trip of db.trips.filter(t => !['completed', 'cancelled'].includes(t.status))) {
    const driver = users.find(u => u.role === 'driver' && u.driverId === trip.driverId);
    if (driver) workspace.notifications.push({
      id: `seed-${trip.id}`,
      recipientId: driver.id,
      type: 'assignment',
      title: 'Priskirtas reisas',
      body: `${trip.number} · ${trip.name}`,
      entity: {
        type: 'trip',
        id: trip.id
      },
      createdAt: new Date().toISOString()
    });
  }
  for (const user of users.filter(u => u.role !== 'driver')) {
    workspace.notifications.push({
      id: `seed-unassigned-${user.id}`,
      recipientId: user.id,
      type: 'assignment',
      title: 'Nepriskirti užsakymai',
      body: `Laukia priskyrimo: ${db.orders.filter(o => !o.tripId && !['completed', 'cancelled'].includes(o.status)).length}`,
      entity: {
        type: 'order',
        id: ''
      },
      createdAt: new Date().toISOString()
    });
  }
  return workspace;
}
export function validateWorkspace(workspace: Workspace, db: Database) {
  if (workspace.version !== 1 || typeof workspace.companyId !== 'string' || !workspace.companyId.trim() || workspace.companyId.length > 100 || !Array.isArray(workspace.users) || !Array.isArray(workspace.notifications) || !Array.isArray(workspace.confirmations) || !workspace.preferences || typeof workspace.preferences !== 'object') throw new Error('Netinkamas darbo erdvės formatas.');
  const ids = new Set<string>();
  const driverIds = new Set<string>();
  for (const u of workspace.users) {
    if (!u.id || ids.has(u.id) || u.companyId !== workspace.companyId || !u.name?.trim() || u.name.length > 100 || !['admin', 'dispatcher', 'driver'].includes(u.role) || typeof u.active !== 'boolean' || !/^\S+@\S+\.\S+$/.test(u.email)) throw new Error('Patikrinkite naudotojo duomenis.');
    ids.add(u.id);
    if (u.role === 'driver' && u.active) {
      if (!db.drivers.some(d => d.id === u.driverId) || driverIds.has(u.driverId)) throw new Error('Pasirinkite kitam aktyviam naudotojui nepriskirtą vairuotoją.');
      driverIds.add(u.driverId);
    }
  }
  if (!workspace.users.some(u => u.active && u.role === 'admin')) throw new Error('Turi likti bent vienas aktyvus administratorius.');
  const validDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
  for (const n of workspace.notifications) if (!ids.has(n.recipientId) || typeof n.id !== 'string' || typeof n.title !== 'string' || typeof n.body !== 'string' || !['assignment', 'trip', 'task', 'finance'].includes(n.type) || !n.entity || typeof n.entity.id !== 'string' || !['trip', 'order', 'finance'].includes(n.entity.type) || !validDate(n.createdAt) || n.readAt !== undefined && !validDate(n.readAt)) throw new Error('Netinkamas pranešimas.');
  const confirmations = new Set<string>();
  for (const c of workspace.confirmations) {
    const key = `${c.tripId}:${c.orderId}:${c.kind}`;
    if (typeof c.id !== 'string' || confirmations.has(key) || !ids.has(c.actorId) || !validDate(c.createdAt) || !['pickup', 'delivery'].includes(c.kind) || !db.trips.some(t => t.id === c.tripId) || !db.orders.some(o => o.id === c.orderId && o.tripId === c.tripId)) throw new Error('Netinkamas užduoties patvirtinimas.');
    if(c.arrivalStopIds!==undefined&&(!Array.isArray(c.arrivalStopIds)||c.arrivalStopIds.some(id=>typeof id!=='string')))throw new Error('Netinkamas atvykimo patvirtinimas.');
    confirmations.add(key);
  }
  for (const [id, pref] of Object.entries(workspace.preferences)) if (!ids.has(id) || !pref || typeof pref.inApp !== 'boolean') throw new Error('Netinkama pranešimų nuostata.');
  if(workspace.printMode!==undefined&&!['monochrome','color'].includes(workspace.printMode))throw new Error('Netinkamas spausdinimo būdas.');
  if(workspace.corrections!==undefined&&(!Array.isArray(workspace.corrections)||workspace.corrections.some(c=>!ids.has(c.actorId)||typeof c.description!=='string'||!validDate(c.createdAt))))throw new Error('Netinkamas pataisymų žurnalas.');
  for(const user of workspace.users)if(user.permissions&&(typeof user.permissions.recordExpenses!=='boolean'||typeof user.permissions.collectPayments!=='boolean'))throw new Error('Netinkamos naudotojo teisės.');
  if(workspace.receipts!==undefined&&!Array.isArray(workspace.receipts)||workspace.expenseSubmissions!==undefined&&!Array.isArray(workspace.expenseSubmissions))throw new Error('Netinkami finansų įrašai.');
  validateFinanceRecords({db,workspace});
  return workspace;
}
export function notificationChanges(before:Database, after:Database, ws:Workspace, actorId:string):AppNotification[] {
  const result:AppNotification[]=[];
  const actor=ws.users.find(u=>u.id===actorId)?.name??'';
  const emit=(activity:NonNullable<AppNotification['activity']>,title:string,body:string,tripId:string,driverId:string,finance=false)=>{
    for(const user of ws.users.filter(u=>u.active&&u.id!==actorId&&(finance?u.role!=='driver':u.role!=='driver'||u.driverId===driverId))) {
      if(ws.preferences[user.id]?.inApp===false)continue;
      result.push({id:crypto.randomUUID(),recipientId:user.id,type:finance?'finance':activity==='assignment'?'assignment':activity==='delivery'?'task':'trip',activity,title,body:`${body}${actor?' · '+actor:''}`,entity:tripId?{type:'trip',id:tripId}:{type:'finance',id:''},createdAt:new Date().toISOString()});
    }
  };
  for(const trip of after.trips) {
    const old=before.trips.find(t=>t.id===trip.id);
    if(!old||trip.driverId!==old.driverId)emit('assignment','Reisas priskirtas',trip.number,trip.id,trip.driverId);
    else if(trip.status!==old.status)emit('trip','Reiso būsena pakeista',trip.number,trip.id,trip.driverId);
    else if(['departure','arrival','vehicleId','name','notes'].some(k=>trip[k as keyof typeof trip]!==old[k as keyof typeof trip]))emit('trip','Reiso informacija atnaujinta',trip.number,trip.id,trip.driverId);
  }
  for(const order of after.orders) {
    const old=before.orders.find(o=>o.id===order.id);
    const trip=after.trips.find(t=>t.id===order.tripId);
    if(trip&&(!old||old.tripId!==order.tripId))emit('assignment','Pridėtas užsakymas',`${order.number} · ${order.name}`,trip.id,trip.driverId);
    else if(trip&&old&&old.status!==order.status&&order.status==='completed')emit('delivery','Pristatymas patvirtintas',`${order.number} · ${order.name}`,trip.id,trip.driverId);
    if(old&&old.paid!==order.paid)emit('payment','Mokėjimas atnaujintas',order.number,trip?.id??'',trip?.driverId??'',true);
  }
  for(const expense of after.expenses) {
    const old=before.expenses.find(e=>e.id===expense.id);
    if(!old||JSON.stringify(old)!==JSON.stringify(expense))emit('expense',old?'Išlaidos atnaujintos':'Išlaidos įregistruotos',expense.category,expense.tripId,'',true);
  }
  return result;
}
export function applyDriverCommand(snapshot: ReviewSnapshot, user: WorkspaceUser, command: DriverCommand) {
  if (!user.active || user.role !== 'driver' || user.companyId !== snapshot.workspace.companyId) throw new Error('Šis veiksmas neleidžiamas.');
  const trip = snapshot.db.trips.find(t => t.id === command.tripId && t.driverId === user.driverId);
  if (!trip) throw new Error('Reisas jums nepriskirtas.');
  if (['cancelled', 'completed'].includes(trip.status)) throw new Error('Reisas jau uždarytas.');
  if (command.type === 'start') {
    if (trip.status !== 'confirmed') throw new Error('Reisas turi būti patvirtintas vadybininko.');
    trip.status = 'active';
    for (const o of snapshot.db.orders.filter(o => o.tripId === trip.id && o.status !== 'cancelled' && o.status !== 'completed')) o.status = 'active';
    return;
  }
  if (trip.status !== 'active') throw new Error('Pirmiausia pradėkite reisą.');
  if(command.type==='undoTask') {
    const confirmation=snapshot.workspace.confirmations.find(c=>c.id===command.confirmationId&&c.tripId===trip.id&&c.actorId===user.id);
    if(!confirmation)throw new Error('Patvirtinimas nerastas arba priklauso kitam naudotojui.');
    if(confirmation.kind==='pickup'&&snapshot.workspace.confirmations.some(c=>c.tripId===trip.id&&c.orderId===confirmation.orderId&&c.kind==='delivery'))throw new Error('Pirmiausia atšaukite pristatymo patvirtinimą.');
    snapshot.workspace.confirmations=snapshot.workspace.confirmations.filter(c=>c.id!==confirmation.id);
    const order=snapshot.db.orders.find(o=>o.id===confirmation.orderId)!;
    order.status='active';
    const visits=routeVisits(trip.stops);
    const index=visits.findIndex(v=>v.stops.some(s=>confirmation.arrivalStopIds?.includes(s.id)));
    if(index>=0&&!visits.slice(index+1).some(v=>v.completed)&&!visits[index].stops.some(s=>snapshot.workspace.confirmations.some(c=>c.tripId===trip.id&&c.orderId===s.orderId&&c.kind===s.kind)))trip.stops=setVisitCompleted(trip.stops,index,false);
    (snapshot.workspace.corrections??=[]).push({id:crypto.randomUUID(),tripId:trip.id,actorId:user.id,description:`${confirmation.kind==='pickup'?'Paėmimo':'Pristatymo'} patvirtinimas atšauktas · ${order.number}`,createdAt:new Date().toISOString()});
    return;
  }
  if(command.type==='undoArrival') {
    const visits=routeVisits(trip.stops);const visit=visits[command.visitIndex];
    if(!visit?.completed||visits.findLastIndex(v=>v.completed)!==command.visitIndex)throw new Error('Galima atšaukti tik paskutinį atvykimą.');
    if(visit.stops.some(s=>snapshot.workspace.confirmations.some(c=>c.tripId===trip.id&&c.orderId===s.orderId&&c.kind===s.kind)))throw new Error('Pirmiausia atšaukite šio sustojimo užduočių patvirtinimus.');
    trip.stops=setVisitCompleted(trip.stops,command.visitIndex,false);
    (snapshot.workspace.corrections??=[]).push({id:crypto.randomUUID(),tripId:trip.id,actorId:user.id,description:`Atvykimas atšauktas · ${visit.place.name}`,createdAt:new Date().toISOString()});
    return;
  }
  if (command.type === 'arrive') {
    const visits = routeVisits(trip.stops);
    const first = visits.findIndex(v => !v.completed);
    if (first !== command.visitIndex) throw new Error('Patvirtinkite artimiausią neaplankytą sustojimą.');
    trip.stops = setVisitCompleted(trip.stops, command.visitIndex, true);
  } else if (command.type === 'task') {
    const visit = routeVisits(trip.stops).find(v => visitTasks(v, snapshot.db.orders).some(t => t.orderId === command.orderId && t.kind === command.kind));
    if (!visit) throw new Error('Sustojimas nerastas.');
    const order = snapshot.db.orders.find(o => o.id === command.orderId && o.tripId === trip.id && o.status !== 'cancelled');
    if (!order) throw new Error('Užsakymas nerastas.');
    const has = (kind: 'pickup' | 'delivery') => snapshot.workspace.confirmations.some(c => c.tripId === trip.id && c.orderId === order.id && c.kind === kind);
    if (has(command.kind)) throw new Error('Veiksmas jau patvirtintas.');
    if (command.kind === 'delivery' && !has('pickup')) throw new Error('Pirmiausia patvirtinkite paėmimą.');
    let arrivalStopIds:string[]|undefined;
    if(!visit.completed) {
      const next=routeVisits(trip.stops).find(v=>!v.completed);
      if(next?.place.id!==visit.place.id)throw new Error('Šis sustojimas dar nepasiektas pagal reiso eilę.');
      arrivalStopIds=visit.stops.map(s=>s.id);
      trip.stops=setVisitCompleted(trip.stops,visit.number-1,true);
    }
    snapshot.workspace.confirmations.push({
      id: crypto.randomUUID(),
      tripId: trip.id,
      orderId: order.id,
      kind: command.kind,
      actorId: user.id,
      createdAt: new Date().toISOString(),
      arrivalStopIds
    });
    order.status = command.kind === 'delivery' ? 'completed' : 'active';
  } else {
    if (routeVisits(trip.stops).some(v => !v.completed) || snapshot.db.orders.some(o => o.tripId === trip.id && !['completed', 'cancelled'].includes(o.status))) throw new Error('Patvirtinkite visus sustojimus ir pristatymus.');
    trip.status = 'completed';
  }
}
