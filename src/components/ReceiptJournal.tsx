import {paymentMethodLabels as methods} from '../domain/terminology';
import { useApp } from '../context';
import { paymentReport } from '../domain/payment-report';
import { money } from '../domain/logic';
import { csv } from '../services/export';
import { Button, Empty } from './ui';

export function ReceiptJournal({ from, to }: { from: string; to: string }) {
  const { db, workspace } = useApp();
  const report = paymentReport({ db, workspace }, from, to);
  return <div className="settings-form"><p className="muted">Mokėjimų įrašai ir atšaukimai pagal operacijos datą. Ankstesnės bendros užsakymų sumos neįtrauktos.</p>
    <div className="trip-finance-actions"><b>Gauta: {money(report.received)}</b><b>Atšaukta: {money(report.reversed)}</b><b>Pokytis: {money(report.net)}</b><Button variant="secondary" onClick={() => csv(['Data', 'Užsakymas', 'Veiksmas', 'Būdas', 'Suma EUR'], report.movements.map(m => [m.date, db.orders.find(o => o.id === m.orderId)?.number ?? m.orderId, m.kind === 'receipt' ? 'Gauta' : 'Atšaukta', methods[m.method], (m.amount / 100).toFixed(2)]), 'krypta-mokejimu-zurnalas.csv')}>Eksportuoti žurnalą</Button></div>
    {report.movements.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Data</th><th>Užsakymas</th><th>Veiksmas</th><th>Būdas</th><th>Suma</th><th>Naudotojas</th></tr></thead><tbody>{report.movements.map(m => <tr key={m.id}><td>{m.date}</td><td>{db.orders.find(o => o.id === m.orderId)?.number}</td><td>{m.kind === 'receipt' ? 'Mokėjimas gautas' : 'Mokėjimas atšauktas'}</td><td>{methods[m.method]}</td><td>{money(m.amount)}</td><td>{workspace.users.find(u => u.id === m.actorId)?.name}</td></tr>)}</tbody></table></div> : <Empty title="Šiuo laikotarpiu mokėjimų įrašų nėra"/>}
  </div>;
}
