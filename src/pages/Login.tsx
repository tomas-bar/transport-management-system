import {useState} from 'react';
import {ArrowRight,Route,ClipboardList,Check,Truck,Users,Wallet,Moon,Sun} from 'lucide-react';
import {useApp} from '../context';
import {Button,Field} from '../components/ui';
export function Login() {
 const {login,busy,theme,toggleTheme}=useApp();
 const [username,setUsername]=useState('admin');const [password,setPassword]=useState('admin');const [error,setError]=useState('');
 return <div className="login-screen product-login login-refined">
  <section className="login-visual">
   <div className="review-brand"><span className="review-mark"><Route size={23}/></span>krypta<span className="brand-period">.</span></div>
   <div className="login-art">
    <span className="overline">KELEIVIŲ IR SIUNTŲ VEŽIMUI</span>
    <h1>Reisų ir užsakymų<br/>valdymas.</h1>
    <p className="login-platform-copy">Užsakymai susieti su maršrutu, transportu ir vairuotoju. Reiso eiga atnaujinama pagal atliktus veiksmus.</p>
    <div className="login-workflow" aria-label="Užsakymo eiga">
     <div className="workflow-card workflow-booking"><span className="workflow-icon"><ClipboardList size={21}/></span><div><b>Užsakymai</b><p>Keleiviai ir siuntos</p></div><span className="workflow-step">01</span></div>
     <div className="workflow-connector"><span/><ArrowRight size={15}/></div>
     <div className="workflow-card workflow-trip"><span className="workflow-icon"><Route size={23}/></span><div><b>Reiso planas</b><p>Maršrutas ir sustojimai</p></div><span className="workflow-step">02</span><footer><span><Truck size={14}/>Transportas</span><span><Users size={14}/>Vairuotojas</span></footer></div>
     <div className="workflow-connector"><span/><ArrowRight size={15}/></div>
     <div className="workflow-card workflow-delivery"><span className="workflow-icon"><Check size={23}/></span><div><b>Pristatymas</b><p>Paėmimo ir pristatymo patvirtinimai</p></div><span className="workflow-step">03</span></div>
    </div>
    <div className="login-capabilities"><span><Users size={16}/>Atskiros komandos rolės</span><span><Wallet size={16}/>Reiso išlaidos ir mokėjimai</span></div>
   </div>
   <span className="login-visual-footer">Transporto valdymo sistema</span>
  </section>
  <section className="login-content"><button className="login-theme-button icon-button" onClick={toggleTheme} aria-label={theme==='light'?'Įjungti tamsų režimą':'Įjungti šviesų režimą'}>{theme==='light'?<Moon size={20}/>:<Sun size={20}/>}</button>
   <div className="login-mobile-brand review-brand"><span className="review-mark"><Route/></span>krypta.</div>
   <div className="login-form-wrap"><span className="login-form-eyebrow">DARBO ERDVĖ</span><h1>Prisijungti</h1><p className="login-description">Prisijunkite prie įmonės paskyros.</p>
    <form onSubmit={e=>{e.preventDefault();if(!login(username,password))setError('Neteisingas naudotojo vardas arba slaptažodis.');}}>
     <Field label="Naudotojo vardas"><input autoComplete="username" required value={username} onChange={e=>setUsername(e.target.value)}/></Field>
     <Field label="Slaptažodis"><input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></Field>
     {error&&<p role="alert" className="form-error">{error}</p>}<Button type="submit" disabled={busy}>Prisijungti<ArrowRight size={18}/></Button>
    </form>
   </div>
  </section>
 </div>;
}
