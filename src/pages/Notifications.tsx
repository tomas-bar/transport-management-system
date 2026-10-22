import {Bell,CheckCheck,Mail} from 'lucide-react';
import {useState} from 'react';
import {useApp} from '../context';
import {Button,PageHeading} from '../components/ui';
import {NotificationGroups} from '../components/NotificationInbox';
export function Notifications() {
 const {workspace,user,readNotifications,setInApp,busy}=useApp();
 const [unreadOnly,setUnreadOnly]=useState(false);if(!user)return null;
 const events=workspace.notifications.filter(n=>n.recipientId===user.id);
 const unread=events.filter(n=>!n.readAt).length;
 return <><PageHeading title="Pranešimai"><Button variant="secondary" disabled={busy||!unread} onClick={()=>readNotifications()}><CheckCheck size={18}/>Visi perskaityti</Button></PageHeading>
 <div className="notification-layout"><section className="panel"><div className="notification-tabs"><button className={!unreadOnly?'selected':''} onClick={()=>setUnreadOnly(false)}>Visi<span>{events.length}</span></button><button className={unreadOnly?'selected':''} onClick={()=>setUnreadOnly(true)}>Neskaityti<span>{unread}</span></button></div><NotificationGroups unreadOnly={unreadOnly}/></section>
 <aside className="panel notification-preferences"><h2>Gavimo būdai</h2><label><Bell size={19}/><span><b>Sistemoje</b><small>Reisų ir užsakymų pakeitimai</small></span><input type="checkbox" disabled={busy} checked={workspace.preferences[user.id]?.inApp!==false} onChange={e=>setInApp(e.target.checked)}/></label><div><Mail size={19}/><span><b>El. paštu</b><small>Siuntimo paslauga neprijungta</small></span></div></aside></div></>;
}
