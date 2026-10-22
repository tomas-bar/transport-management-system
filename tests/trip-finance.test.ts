import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSeed} from '../src/data/seed.ts';
import {createWorkspace,validateWorkspace} from '../src/domain/workspace.ts';
import {applyFinanceCommand,driverPermissions,validateFinanceRecords} from '../src/domain/trip-finance.ts';
import {validateDatabase,saveTrip,saveOrder} from '../src/domain/logic.ts';
import {mapViewport} from '../src/services/pdf/basemap.ts';
const fixture=()=>{const db=createSeed('2026-10-22');return {db,workspace:createWorkspace(db)};};
test('driver expenses are scoped to their assigned trip and granted capability',()=>{
 const s=fixture(),driver=s.workspace.users.find(u=>u.id==='user-d1')!;
 const command={type:'expense' as const,tripId:'t1',amount:8000,category:'Degalai',date:'2026-10-22',description:'Degalų papildymas'};
 const before=s.db.expenses.length;applyFinanceCommand(s,driver,command);assert.equal(s.db.expenses.length,before+1);assert.equal(s.db.expenses.at(-1)?.vehicleId,'v1');assert.equal(s.workspace.expenseSubmissions?.at(-1)?.actorId,driver.id);
 assert.throws(()=>applyFinanceCommand(s,driver,{...command,tripId:'t2'}),/nepasiekiamas/);
 driver.permissions={recordExpenses:false,collectPayments:false};assert.throws(()=>applyFinanceCommand(s,driver,command),/teisė/);validateDatabase(s.db);validateWorkspace(s.workspace,s.db);
});
test('partial cash collection updates paid value once and void restores the baseline',()=>{
 const s=fixture(),driver=s.workspace.users.find(u=>u.id==='user-d1')!;driver.permissions={recordExpenses:true,collectPayments:true};
 const order=s.db.orders.find(o=>o.tripId==='t1'&&o.paid<o.price)!;const baseline=order.paid;const status=order.status;
 applyFinanceCommand(s,driver,{type:'receipt',tripId:'t1',orderId:order.id,amount:1000,method:'cash'});
 assert.equal(order.paid,baseline+1000);assert.equal(order.status,status);assert.equal(s.workspace.receipts?.[0].method,'cash');
 const receipt=s.workspace.receipts![0];applyFinanceCommand(s,driver,{type:'voidReceipt',tripId:'t1',receiptId:receipt.id});assert.equal(order.paid,baseline);assert(receipt.voidedAt);assert.throws(()=>applyFinanceCommand(s,driver,{type:'voidReceipt',tripId:'t1',receiptId:receipt.id}),/negalima/);validateWorkspace(s.workspace,s.db);
});
test('driver collection is opt-in and rejects overpayments, unknown prices and other trip orders',()=>{
 const s=fixture(),driver=s.workspace.users.find(u=>u.id==='user-d1')!;assert(!driverPermissions(driver).collectPayments);
 const order=s.db.orders.find(o=>o.tripId==='t1'&&o.paid<o.price)!;const cmd={type:'receipt' as const,tripId:'t1',orderId:order.id,amount:1000,method:'cash' as const};
 assert.throws(()=>applyFinanceCommand(s,driver,cmd),/teisė/);driver.permissions={recordExpenses:true,collectPayments:true};
 assert.throws(()=>applyFinanceCommand(s,driver,{...cmd,amount:order.price+100}),/viršija/);
 const unknown=s.db.orders.find(o=>o.id==='o6')!;saveOrder(s.db,{...unknown,tripId:'t1',date:s.db.trips.find(t=>t.id==='t1')!.departure.slice(0,10),status:'assigned'});
 assert.throws(()=>applyFinanceCommand(s,driver,{...cmd,orderId:unknown.id}),/kaina/);
 assert.throws(()=>applyFinanceCommand(s,driver,{...cmd,tripId:'t2'}),/nepasiekiamas/);
 assert.throws(()=>applyFinanceCommand(s,driver,{...cmd,amount:0}),/teigiamą/);
});
test('recorded receipts constrain manual paid corrections and survive trip cancellation',()=>{
 const s=fixture(),admin=s.workspace.users[0],order=s.db.orders.find(o=>o.tripId==='t1'&&o.paid<o.price)!;
 applyFinanceCommand(s,admin,{type:'receipt',tripId:'t1',orderId:order.id,amount:1000,method:'cash'});const paid=order.paid;
 order.paid=0;assert.throws(()=>validateFinanceRecords(s),/mažesnė/);order.paid=paid;
 saveTrip(s.db,{...s.db.trips.find(t=>t.id==='t1')!,status:'cancelled'});assert.equal(order.paid,paid);assert.equal(order.tripId,'');validateWorkspace(s.workspace,s.db);
 applyFinanceCommand(s,admin,{type:'voidReceipt',tripId:'t1',receiptId:s.workspace.receipts![0].id});assert.equal(order.paid,paid-1000);validateWorkspace(s.workspace,s.db);
});
test('expense input rejects invalid categories, values and calendar dates',()=>{
 const s=fixture(),user=s.workspace.users[0];const command={type:'expense' as const,tripId:'t1',amount:1000,category:'Degalai',date:'2026-10-22',description:''};
 assert.throws(()=>applyFinanceCommand(s,user,{...command,category:'Unknown'}),/Patikrinkite/);assert.throws(()=>applyFinanceCommand(s,user,{...command,amount:1.5}),/teigiamą/);assert.throws(()=>applyFinanceCommand(s,user,{...command,date:'2026-02-31'}),/datą/);
});
test('print viewport contains the whole road geometry and reserves geographic context',()=>{
 const route={distance:1000,duration:100,coordinates:[[54.5,23.3],[54.9,24.0],[54.7,25.2]] as [number,number][]};const viewport=mapViewport(route,176,82);
 for(const [lat,lng] of route.coordinates){const [x,y]=viewport.project([lng,lat]);assert(x>0&&x<176&&y>0&&y<82);}
 assert(viewport.maxY-viewport.minY>=2.1-1e-9);
});
