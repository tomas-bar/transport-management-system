import { useConfirm } from './Feedback';
import { isDraft } from '../domain/record-mode';
import {paymentMethodLabels as methods} from '../domain/terminology';
import {useState} from 'react';
import {Plus,Wallet,ReceiptText,Undo2} from 'lucide-react';
import {useApp} from '../context';
import {driverPermissions} from '../domain/trip-finance';
import {expenseCategories} from '../domain/models';
import {money,today,hasAgreedPrice} from '../domain/logic';
import {Button,Field,Modal,Panel} from './ui';

export function TripFinance({tripId,driverMode=false}:{tripId:string;driverMode?:boolean}) {
  const confirm = useConfirm();
 const {db,user,workspace,financeCommand,busy,modules}=useApp();const [form,setForm]=useState<'expense'|'receipt'|null>(null);
 const [amount,setAmount]=useState('');const [category,setCategory]=useState('Degalai');const [date,setDate]=useState(today());const [description,setDescription]=useState('');const [orderId,setOrderId]=useState('');const [method,setMethod]=useState<'cash'|'bank'|'card'>('cash');
 if(!user||!modules.includes('finance'))return null;const trip=db.trips.find(t=>t.id===tripId);if(!trip||isDraft(trip))return null;
 const permissions=driverPermissions(user);const canExpense=user.role!=='driver'||permissions.recordExpenses;const canCollect=user.role!=='driver'||permissions.collectPayments;
 if(driverMode&&!canExpense&&!canCollect)return null;
 const expenses=db.expenses.filter(e=>e.tripId===tripId&&(!driverMode||(workspace.expenseSubmissions??[]).some(s=>s.expenseId===e.id&&s.actorId===user.id)));
 const receipts=(workspace.receipts??[]).filter(r=>r.tripId===tripId&&(!driverMode||r.actorId===user.id)).slice().reverse();
 const orders=db.orders.filter(o=>o.tripId===tripId&&o.status!=='cancelled'&&hasAgreedPrice(o)&&o.paid<o.price);
 const selected=orders.find(o=>o.id===orderId);const max=selected?(selected.price-selected.paid)/100:undefined;
 const launch=(type:'expense'|'receipt')=>{setForm(type);setAmount(type==='receipt'&&orders[0]?((orders[0].price-orders[0].paid)/100).toFixed(2):'');setDate(today());setDescription('');setOrderId(orders[0]?.id??'');};
 return <section className="trip-finance-module">
  <div className="section-title"><h2>{driverMode?'Išlaidos ir mokėjimai':'Reiso išlaidos ir mokėjimai'}</h2></div>
  <div className="trip-finance-actions">{canExpense&&<Button variant="secondary" disabled={trip.status==='cancelled'} onClick={()=>launch('expense')}><Plus size={17}/>Pridėti išlaidas</Button>}{canCollect&&<Button variant="secondary" disabled={!orders.length||trip.status==='cancelled'} onClick={()=>launch('receipt')}><Wallet size={17}/>Gautas mokėjimas</Button>}</div>
  {canExpense&&<Panel title={driverMode?'Mano įvestos išlaidos':'Išlaidos'}><div className="trip-expense-list">{expenses.map(expense=><div key={expense.id}><span className="event-icon expense"><ReceiptText size={17}/></span><span><b>{expense.category}</b><small>{expense.date}{expense.description?' · '+expense.description:''}</small></span><b>{money(expense.amount)}</b></div>)}{!expenses.length&&<p className="inline-empty">Išlaidų nėra.</p>}</div></Panel>}
  {canCollect&&<Panel title={driverMode?'Mano registruoti mokėjimai':'Registruoti mokėjimai'}><div className="trip-receipt-list">{receipts.map(receipt=><div className={receipt.voidedAt?'voided':''} key={receipt.id}><span><b>{db.orders.find(o=>o.id===receipt.orderId)?.name}</b><small>{methods[receipt.method]} · {receipt.date}{receipt.voidedAt?' · Atšauktas':''}</small>{!driverMode&&<small>{workspace.users.find(u=>u.id===receipt.actorId)?.name}</small>}</span><div><b>{money(receipt.amount)}</b>{!receipt.voidedAt&&<button className="undo-action" disabled={busy} onClick={async ()=>{if(await confirm('Atšaukti šį mokėjimo įrašą? Sumokėta suma bus sumažinta.'))financeCommand({type:'voidReceipt',tripId,receiptId:receipt.id});}}><Undo2 size={14}/>Atšaukti</button>}</div></div>)}{!receipts.length&&<p className="inline-empty">Registruotų mokėjimų nėra.</p>}</div></Panel>}
  {form&&<Modal title={form==='expense'?'Reiso išlaidos':'Gautas mokėjimas'} subtitle={trip.number+' · '+trip.name} onClose={()=>setForm(null)}><form onSubmit={async e=>{e.preventDefault();const cents=Math.round(Number(amount.replace(',','.'))*100);const ok=await financeCommand(form==='expense'?{type:'expense',tripId,category,amount:cents,date,description}:{type:'receipt',tripId,orderId,amount:cents,method});if(ok)setForm(null);}}><div className="modal-body form-grid">
   {form==='expense'?<><Field label="Kategorija"><select value={category} onChange={e=>setCategory(e.target.value)}>{expenseCategories.map(c=><option key={c}>{c}</option>)}</select></Field><Field label="Data"><input type="date" required max={today()} value={date} onChange={e=>setDate(e.target.value)}/></Field></>:<><Field label="Užsakymas" full><select required value={orderId} onChange={e=>{setOrderId(e.target.value);const next=orders.find(o=>o.id===e.target.value);setAmount(next?((next.price-next.paid)/100).toFixed(2):'');}}>{orders.map(order=><option key={order.id} value={order.id}>{order.number} · {order.name} · Liko {money(order.price-order.paid)}</option>)}</select></Field><Field label="Mokėjimo būdas"><select value={method} onChange={e=>setMethod(e.target.value as typeof method)}>{Object.entries(methods).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field></>}
   <Field label="Suma, €" hint={form==='receipt'&&selected?'Liko mokėti: '+money(selected.price-selected.paid):undefined}><input type="number" inputMode="decimal" min="0.01" max={form==='receipt'?max:undefined} step="0.01" required value={amount} onChange={e=>setAmount(e.target.value)}/></Field>
   {form==='expense'&&<Field label="Pastaba" full><input maxLength={1000} value={description} onChange={e=>setDescription(e.target.value)}/></Field>}
  </div><footer><Button variant="secondary" onClick={()=>setForm(null)}>Atšaukti</Button><Button type="submit" disabled={busy}>Išsaugoti</Button></footer></form></Modal>}
 </section>;
}
