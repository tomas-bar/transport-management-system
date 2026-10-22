import type {Expense} from './models.ts';
import {expenseCategories} from './models.ts';
import {hasAgreedPrice,today} from './logic.ts';
import type {ReviewSnapshot,WorkspaceUser} from './workspace.ts';
export interface DriverPermissions {recordExpenses:boolean;collectPayments:boolean}
export interface PaymentReceipt {id:string;tripId:string;orderId:string;actorId:string;amount:number;method:'cash'|'bank'|'card';date:string;createdAt:string;voidedAt?:string;voidedBy?:string}
export interface ExpenseSubmission {expenseId:string;tripId:string;actorId:string;createdAt:string}
export type FinanceCommand={type:'expense';tripId:string;category:string;amount:number;date:string;description:string}|{type:'receipt';tripId:string;orderId:string;amount:number;method:PaymentReceipt['method']}|{type:'voidReceipt';tripId:string;receiptId:string};
export const driverPermissions=(user:WorkspaceUser):DriverPermissions=>({recordExpenses:user.permissions?.recordExpenses??true,collectPayments:user.permissions?.collectPayments??false});
const cents=(value:number)=>{if(!Number.isSafeInteger(value)||value<=0)throw new Error('Įveskite teigiamą sumą.');};
export function applyFinanceCommand(snapshot:ReviewSnapshot,user:WorkspaceUser,command:FinanceCommand) {
 if(!user.active||user.companyId!==snapshot.workspace.companyId)throw new Error('Prieiga nesuteikta.');
 const trip=snapshot.db.trips.find(t=>t.id===command.tripId);
 if(!trip||(user.role==='driver'&&trip.driverId!==user.driverId))throw new Error('Reisas nepasiekiamas.');
 if(trip.status==='cancelled'&&command.type!=='voidReceipt')throw new Error('Atšauktame reise šis veiksmas neleidžiamas.');
 const permissions=driverPermissions(user);
 if(user.role==='driver'&&!(command.type==='expense'?permissions.recordExpenses:permissions.collectPayments))throw new Error('Šiam veiksmui nesuteikta teisė.');
 if(command.type==='expense') {
  cents(command.amount);
  if(!expenseCategories.includes(command.category)||typeof command.description!=='string'||command.description.length>1000)throw new Error('Patikrinkite išlaidų duomenis.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(command.date)||!Number.isFinite(Date.parse(command.date))||new Date(command.date+'T12:00:00Z').toISOString().slice(0,10)!==command.date||command.date>today())throw new Error('Pasirinkite tinkamą išlaidų datą.');
  const expense:Expense={id:crypto.randomUUID(),tripId:trip.id,vehicleId:trip.vehicleId,date:command.date,category:command.category,amount:command.amount,description:command.description.trim()};
  snapshot.db.expenses.push(expense);
  (snapshot.workspace.expenseSubmissions??=[]).push({expenseId:expense.id,tripId:trip.id,actorId:user.id,createdAt:new Date().toISOString()});
 } else if(command.type==='receipt') {
  cents(command.amount);
  const order=snapshot.db.orders.find(o=>o.id===command.orderId&&o.tripId===trip.id&&o.status!=='cancelled');
  if(!order||!hasAgreedPrice(order))throw new Error('Pirmiausia turi būti nurodyta užsakymo kaina.');
  if(!['cash','bank','card'].includes(command.method)||command.amount>order.price-order.paid)throw new Error('Suma viršija likusią mokėti sumą.');
  order.paid+=command.amount;
  (snapshot.workspace.receipts??=[]).push({id:crypto.randomUUID(),tripId:trip.id,orderId:order.id,actorId:user.id,amount:command.amount,method:command.method,date:today(),createdAt:new Date().toISOString()});
 } else {
  const receipt=snapshot.workspace.receipts?.find(r=>r.id===command.receiptId&&r.tripId===trip.id&&!r.voidedAt);
  if(!receipt||(user.role==='driver'&&receipt.actorId!==user.id))throw new Error('Mokėjimo atšaukti negalima.');
  const order=snapshot.db.orders.find(o=>o.id===receipt.orderId&&(user.role!=='driver'||o.tripId===trip.id));
  if(!order||order.paid<receipt.amount)throw new Error('Mokėjimo duomenys pasikeitė. Kreipkitės į vadybininką.');
  order.paid-=receipt.amount;receipt.voidedAt=new Date().toISOString();receipt.voidedBy=user.id;
 }
}
export function validateFinanceRecords(snapshot:ReviewSnapshot) {
 const users=new Set(snapshot.workspace.users.map(u=>u.id));const seen=new Set<string>();
 for(const receipt of snapshot.workspace.receipts??[]) {
  if(!receipt.id||seen.has(receipt.id)||!users.has(receipt.actorId)||!Number.isSafeInteger(receipt.amount)||receipt.amount<=0||!['cash','bank','card'].includes(receipt.method)||!Number.isFinite(Date.parse(receipt.createdAt))||!/^\d{4}-\d{2}-\d{2}$/.test(receipt.date)||!snapshot.db.orders.some(o=>o.id===receipt.orderId)||!snapshot.db.trips.some(t=>t.id===receipt.tripId)||receipt.voidedAt&&(!Number.isFinite(Date.parse(receipt.voidedAt))||!users.has(receipt.voidedBy??'')))throw new Error('Netinkamas mokėjimo įrašas.');
  seen.add(receipt.id);
 }
 for(const order of snapshot.db.orders) {
  const recorded=(snapshot.workspace.receipts??[]).filter(r=>r.orderId===order.id&&!r.voidedAt).reduce((sum,r)=>sum+r.amount,0);
  if(order.paid<recorded)throw new Error('Sumokėta suma mažesnė už registruotus mokėjimus. Pirmiausia atšaukite mokėjimo įrašą.');
 }
 for(const submission of snapshot.workspace.expenseSubmissions??[])if(!users.has(submission.actorId)||typeof submission.expenseId!=='string'||!Number.isFinite(Date.parse(submission.createdAt)))throw new Error('Netinkamas išlaidų įrašas.');
}
