import {useEffect,useRef,useState} from 'react';
import {Bell,Route,Wallet,MapPin,ArrowUpRight,ArrowDownRight,Undo2,ReceiptText,CheckCheck,ChevronDown,ArrowRight,ClipboardList} from 'lucide-react';
import {useApp} from '../context';
import {groupNotifications} from '../domain/notifications';
import type {AppNotification} from '../domain/workspace';
import {Empty} from './ui';
const formatTime=(date:string)=>new Intl.DateTimeFormat('lt-LT',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(date));
function eventStyle(event:AppNotification) {
 const activity=event.activity??(event.title.startsWith('Atvykta')?'arrival':event.title.startsWith('Paėmimas')?'pickup':event.title.includes('pristatytas')?'delivery':event.type==='assignment'?'assignment':'trip');
 return {activity,Icon:activity==='arrival'?MapPin:activity==='pickup'?ArrowUpRight:activity==='delivery'?ArrowDownRight:activity==='correction'?Undo2:activity==='payment'?Wallet:activity==='expense'?ReceiptText:activity==='assignment'?ClipboardList:Route};
}
export function NotificationGroups({compact=false,unreadOnly=false}:{compact?:boolean;unreadOnly?:boolean}) {
 const {db,workspace,user,readNotifications,navigate,path,busy}=useApp();
 const tripQuery=new URLSearchParams(path.split('?')[1]).get('trip');
 const [expanded,setExpanded]=useState<string[]>(tripQuery?[`trip:${tripQuery}`]:[]);
 if(!user)return null;
 const groups=groupNotifications(db,workspace.notifications,user).filter(g=>!unreadOnly||g.unread>0||expanded.includes(g.key));
 const visible=compact?groups.slice(0,4):groups;
 return <div className={`notification-groups ${compact?'compact':''}`}>
   {visible.map(group=>{
     const open=expanded.includes(group.key);const latest=group.events[0];
     return <section key={group.key} className={`notification-group ${group.unread?'has-unread':''}`}>
       <button className="notification-group-toggle" aria-expanded={open} onClick={()=>{
         setExpanded(open?expanded.filter(key=>key!==group.key):[...expanded,group.key]);
         if(!open&&group.unread)void readNotifications(group.events.map(e=>e.id));
       }}>
         <span className={`notification-group-icon ${latest.entity.type==='finance'?'finance':''}`}>{latest.entity.type==='finance'?<Wallet size={20}/>:latest.entity.type==='order'?<ClipboardList size={20}/>:<Route size={20}/>}</span>
         <span className="notification-group-summary"><span className="notification-group-reference">{group.reference||'Įmonės veikla'}</span><b>{group.title}</b><span className="notification-preview">{latest.title}</span><small>{formatTime(latest.createdAt)} · Įvykių: {group.events.length}</small></span>
         <span className="notification-group-controls">{group.unread>0&&<span className="unread-count" aria-label={`Neskaitytų: ${group.unread}`}>{group.unread}</span>}<ChevronDown size={17} className={open?'rotated':''}/></span>
       </button>
       {open&&<div className="notification-event-list">
         {group.events.map(event=>{const {Icon,activity}=eventStyle(event);return <div className={`notification-event ${!event.readAt?'unread':''}`} key={event.id}>
           <span className={`event-icon ${activity}`}><Icon size={16}/></span>
           <div><b>{event.title}</b><p>{event.body}</p><small>{formatTime(event.createdAt)}</small></div>
           {!event.readAt&&<button className="event-read" aria-label="Pažymėti pranešimą perskaitytu" disabled={busy} onClick={()=>readNotifications(event.id)}><CheckCheck size={16}/></button>}
         </div>;})}
         <div className="notification-group-footer">{group.unread>0&&<button disabled={busy} onClick={()=>readNotifications(group.events.map(e=>e.id))}><CheckCheck size={15}/>Perskaityta</button>}{group.path&&<button onClick={()=>navigate(group.path)}>{group.path.startsWith('trips/')||group.path.startsWith('my-trips/')?'Atidaryti reisą':'Atidaryti'}<ArrowUpRight size={15}/></button>}</div>
       </div>}
     </section>;
   })}
   {!visible.length&&<Empty title={unreadOnly?'Visi pranešimai perskaityti':'Pranešimų nėra'} description=""/>}
 </div>;
}
export function NotificationBell() {
 const {workspace,user,navigate,path,readNotifications,busy}=useApp();
 const [open,setOpen]=useState(false);const container=useRef<HTMLDivElement>(null);const trigger=useRef<HTMLButtonElement>(null);
 const unread=workspace.notifications.filter(n=>n.recipientId===user?.id&&!n.readAt).length;
 useEffect(()=>{setOpen(false);},[path,user?.id]);
 useEffect(()=>{
   if(!open)return;
   const outside=(e:PointerEvent)=>{if(!container.current?.contains(e.target as Node))setOpen(false);};
   const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}};
   document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);
   return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);};
 },[open]);
 return <div className="notification-anchor" ref={container}>
   <button ref={trigger} className="notification-button icon-button" aria-label={`Pranešimai, neskaitytų: ${unread}`} aria-expanded={open} aria-controls="notification-popover" onClick={()=>setOpen(!open)}><Bell size={21}/>{unread>0&&<span className="bell-count">{unread>99?'99+':unread}</span>}</button>
   {open&&<section id="notification-popover" className="notification-popover" aria-label="Pranešimai"><header><h2>Pranešimai</h2><button disabled={busy||!unread} onClick={()=>readNotifications()} aria-label="Pažymėti visus perskaitytais"><CheckCheck size={19}/></button></header><div className="notification-popover-body"><NotificationGroups compact/></div><footer><button onClick={()=>navigate('notifications')}>Visi pranešimai<ArrowRight size={16}/></button></footer></section>}
 </div>;
}
