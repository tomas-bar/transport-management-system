import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, MapPin, Package, Play, Truck, UserRound, Navigation, ChevronDown, Users, Undo2 } from 'lucide-react';
import { useApp } from '../context';
import { Badge, Button, Empty, PageHeading, Plate } from '../components/ui';
import {TripFinance} from '../components/TripFinance';
import { Journey } from '../components/Journey';
import { MapView } from '../components/MapView';
import { dateLabel, today, tripOrders } from '../domain/logic';
import { routeVisits, visitTasks } from '../domain/route-plan';
import type { Trip } from '../domain/models';

export function DriverWorkspace({id}:{id?:string}) {
  const {db,user,navigate,driverCommand,busy,workspace}=useApp();
  const [history,setHistory]=useState(false);
  const [showMap,setShowMap]=useState(false);
  if(!user||user.role!=='driver')return null;
  const trips=db.trips.filter(t=>t.driverId===user.driverId).sort((a,b)=>a.departure.localeCompare(b.departure));
  const trip=id?trips.find(t=>t.id===id):undefined;
  if(id&&!trip)return <Empty title="Reisas nepasiekiamas" description="Galite peržiūrėti tik jums priskirtus reisus."><Button onClick={()=>navigate('my-trips')}>Mano reisai</Button></Empty>;
  if(trip) {
    const vehicle=db.vehicles.find(v=>v.id===trip.vehicleId);
    const visits=routeVisits(trip.stops);
    const orders=tripOrders(db,trip.id);
    const next=visits.findIndex(v=>!v.completed);
    const closed=['completed','cancelled'].includes(trip.status);
    const confirmation=(orderId:string,kind:'pickup'|'delivery')=>workspace.confirmations.find(c=>c.tripId===trip.id&&c.orderId===orderId&&c.kind===kind);
    const unfinished=orders.filter(o=>!['completed','cancelled'].includes(o.status));
    const pendingVisit=visits.find(v=>v.completed&&visitTasks(v,orders).some(task=>!confirmation(task.orderId,task.kind)))??visits[next];
    const pendingTasks=pendingVisit?visitTasks(pendingVisit,orders).filter(task=>!confirmation(task.orderId,task.kind)):[];
    const singleTask=pendingTasks.length===1?pendingTasks[0]:null;
    const taskReady=singleTask&&(singleTask.kind==='pickup'||!!confirmation(singleTask.orderId,'pickup'));
    const scrollToVisit=()=>document.getElementById(`visit-${pendingVisit?.number}`)?.scrollIntoView({behavior:'smooth',block:'start'});
    return <>
      <button className="back-link" onClick={()=>navigate('my-trips')}><ArrowLeft size={17}/>Mano reisai</button>
      <PageHeading eyebrow={trip.number} title={trip.name}><Badge status={trip.status}/></PageHeading>
      <div className="driver-meta"><span><Clock3 size={17}/>{dateLabel(trip.departure,true)}</span>{vehicle&&<span><Truck size={17}/>{vehicle.model}<Plate value={vehicle.plate}/></span>}</div>
      <Journey trip={trip}/>
      {!closed&&<div className="driver-next">
        <div><span className="overline">{trip.status!=='active'?'IŠVYKIMAS':pendingVisit?.completed?'LAUKIA PATVIRTINIMO':'ARTIMIAUSIAS SUSTOJIMAS'}</span><h2>{pendingVisit?.place.name??'Sustojimai aplankyti'}</h2><p>{pendingVisit?.place.address??(unfinished.length?'Liko nepatvirtintų užduočių.':'Visos užduotys atliktos.')}</p></div>
        {trip.status==='confirmed'?<Button disabled={busy} onClick={()=>driverCommand({type:'start',tripId:trip.id})}><Play size={18}/>Pradėti reisą</Button>
          :trip.status==='planned'?<span className="status-note">Laukiama vadybininko patvirtinimo</span>
          :singleTask&&taskReady?<Button disabled={busy} onClick={()=>driverCommand({type:'task',tripId:trip.id,orderId:singleTask.orderId,kind:singleTask.kind})}><Check size={18}/>{singleTask.kind==='pickup'?'Paėmiau':'Pristačiau'}</Button>
          :pendingTasks.length>0?<Button onClick={scrollToVisit}>Užduotys ({pendingTasks.length})<ArrowRight size={18}/></Button>
          :next>=0?<Button disabled={busy} onClick={()=>driverCommand({type:'arrive',tripId:trip.id,visitIndex:next})}><MapPin size={18}/>Atvykau</Button>
          :<Button disabled={busy||unfinished.length>0} onClick={()=>{if(confirm('Užbaigti šį reisą?'))driverCommand({type:'finish',tripId:trip.id});}}><CheckCircle2 size={18}/>Užbaigti reisą</Button>}
      </div>}
      <div className="driver-section-heading"><h2>Sustojimai ir užduotys</h2><button className="text-link" onClick={()=>setShowMap(!showMap)}><MapPin size={17}/>{showMap?'Slėpti žemėlapį':'Rodyti žemėlapį'}<ChevronDown size={15}/></button></div>
      {showMap&&<div className="panel driver-map"><MapView stops={trip.stops}/></div>}
      <div className="driver-visits">{visits.map((visit,index)=>{
        const tasks=visitTasks(visit,orders);
        const canUndoArrival=!closed&&visit.completed&&index===visits.findLastIndex(v=>v.completed)&&!tasks.some(task=>confirmation(task.orderId,task.kind));
        return <article id={`visit-${visit.number}`} key={visit.place.id} className={`driver-visit ${visit.completed||trip.status==='completed'?'visited':''} ${index===next&&!closed?'current':''}`}>
          <header><span className="visit-number">{visit.completed||trip.status==='completed'?<Check size={19}/>:visit.number}</span><div><h3>{visit.place.name}</h3><p>{visit.place.address}</p></div><span className="visit-state">{trip.status==='completed'||visit.completed?'Atvykta':index===next?'Kitas':'Laukia'}</span></header>
          {visit.place.arrival&&<p className="visit-time"><Clock3 size={14}/>{dateLabel(visit.place.arrival,true)}</p>}
          {tasks.length>0&&<div className="driver-tasks">{tasks.map(task=>{
            const event=confirmation(task.orderId,task.kind);
            const done=!!event||trip.status==='completed';
            const allowed=trip.status==='active'&&(visit.completed||index===next)&&(task.kind==='pickup'||!!confirmation(task.orderId,'pickup'));
            const canUndo=event?.actorId===user.id&&!closed&&(task.kind==='delivery'||!confirmation(task.orderId,'delivery'));
            return <div className={`driver-task ${done?'done':''}`} key={task.stopId}>
              <span className={`task-symbol ${task.kind}`}>{task.type==='passenger'?<UserRound size={20}/>:<Package size={20}/>}</span>
              <div><span className="task-kind">{task.kind==='pickup'?'Paėmimas':'Pristatymas'} · {task.type==='passenger'?'Keleiviai':'Siuntos'}: {task.quantity}</span><b>{task.name}</b>{task.phone&&<small>{task.phone}</small>}</div>
              {done?<div className="task-result"><span className="task-done"><Check size={16}/>Atlikta</span>{canUndo&&<button className="undo-action" disabled={busy} onClick={()=>{if(confirm('Atšaukti šį patvirtinimą?'))driverCommand({type:'undoTask',tripId:trip.id,confirmationId:event!.id});}}><Undo2 size={14}/>Atšaukti</button>}</div>
                :!closed&&<Button variant="secondary" disabled={busy||!allowed} title={task.kind==='delivery'&&!confirmation(task.orderId,'pickup')?'Pirmiausia patvirtinkite paėmimą':index!==next&&!visit.completed?'Laukia ankstesnių sustojimų':undefined} onClick={()=>driverCommand({type:'task',tripId:trip.id,orderId:task.orderId,kind:task.kind})}>{task.kind==='pickup'?'Paėmiau':'Pristačiau'}</Button>}
            </div>;
          })}</div>}
          {index===next&&trip.status==='active'&&<div className="visit-action"><a target="_blank" rel="noreferrer" className="button secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${visit.place.lat},${visit.place.lng}&travelmode=driving`}><Navigation size={17}/>Naviguoti</a><Button variant={tasks.length?'secondary':'primary'} disabled={busy} onClick={()=>driverCommand({type:'arrive',tripId:trip.id,visitIndex:index})}><MapPin size={17}/>Atvykau</Button></div>}
          {canUndoArrival&&<button className="undo-action undo-arrival" disabled={busy} onClick={()=>{if(confirm('Atšaukti atvykimo patvirtinimą?'))driverCommand({type:'undoArrival',tripId:trip.id,visitIndex:index});}}><Undo2 size={14}/>Atšaukti atvykimą</button>}
        </article>;
      })}</div>
      <TripFinance tripId={trip.id} driverMode/>
      {trip.notes&&<div className="driver-notes"><h2>Reiso pastabos</h2><p>{trip.notes}</p></div>}
    </>;
  }
  const visible=trips.filter(t=>history?['completed','cancelled'].includes(t.status):!['completed','cancelled'].includes(t.status));
  return <><PageHeading eyebrow={user.name} title="Mano reisai"/><div className="review-tabs"><button className={!history?'selected':''} onClick={()=>setHistory(false)}>Artimiausi</button><button className={history?'selected':''} onClick={()=>setHistory(true)}>Istorija</button></div><div className="driver-trip-list">{visible.map(t=><DriverTripCard key={t.id} trip={t}/>)}</div>{!visible.length&&<Empty title={history?'Užbaigtų reisų nėra':'Priskirtų reisų nėra'} description="Čia rodomi jums priskirti reisai."/>}</>;
}
function DriverTripCard({trip}:{trip:Trip}) {
  const {db,navigate}=useApp();const orders=tripOrders(db,trip.id);const vehicle=db.vehicles.find(v=>v.id===trip.vehicleId);
  return <button className={`driver-trip-card ${trip.status==='active'?'running':''}`} onClick={()=>navigate(`my-trips/${trip.id}`)}><header><span>{trip.number} · {dateLabel(trip.departure,true)}</span><Badge status={trip.status}/></header><h2>{trip.name}</h2><Journey trip={trip} compact/><footer>{vehicle&&<Plate value={vehicle.plate}/>}<span><Users size={17}/>{orders.filter(o=>o.type==='passenger').reduce((s,o)=>s+o.quantity,0)}</span><span><Package size={17}/>{orders.filter(o=>o.type==='parcel').reduce((s,o)=>s+o.quantity,0)}</span><ArrowRight size={21}/></footer></button>;
}
