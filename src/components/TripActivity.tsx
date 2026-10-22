import {CheckCircle2,Undo2} from 'lucide-react';
import {useApp} from '../context';
export function TripActivity({tripId}:{tripId:string}) {
 const {db,workspace}=useApp();
 const events=[...workspace.confirmations.filter(c=>c.tripId===tripId).map(c=>({id:c.id,actorId:c.actorId,createdAt:c.createdAt,correction:false,description:`${c.kind==='pickup'?'Paėmimas':'Pristatymas'} · ${db.orders.find(o=>o.id===c.orderId)?.name??c.orderId}`})),...(workspace.corrections??[]).filter(c=>c.tripId===tripId).map(c=>({...c,correction:true}))].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 if(!events.length)return null;
 return <details className="handover-activity"><summary>Vairuotojo veiksmai<span>{events.length}</span></summary><div>{events.map(event=><div key={event.id}>{event.correction?<Undo2 size={17}/>:<CheckCircle2 size={17}/>}<span><b>{event.description}</b><small>{workspace.users.find(u=>u.id===event.actorId)?.name} · {new Intl.DateTimeFormat('lt-LT',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(event.createdAt))}</small></span></div>)}</div></details>;
}
