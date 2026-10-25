import { ArrowDownRight, ArrowUpRight, CircleHelp } from 'lucide-react';
import { money } from '../../domain/logic';
import { extraCostLabels, type Calculation, type CalculatorInput } from '../../domain/calculator';
import { calculationMoney } from './format';

const missingLabels: Record<string, string> = {
  routeKm: 'Maršruto kilometrai', extraKm: 'Papildomi kilometrai', fuel: 'Kuro sąnaudos arba kaina',
  wear: 'Eksploatacijos įkainis', driver: 'Vairuotojo atlygis arba dienos', waiting: 'Laukimo laikas arba įkainis',
  totalRevenue: 'Bendra pajamų suma', bookings: 'Reiso užsakymai', bookingPrices: 'Dalies užsakymų kainos',
  bookingQuantity: 'Dalies užsakymų kiekiai',
  outboundPassengers: 'Keleiviai arba bilieto kaina pirmyn', returnPassengers: 'Keleiviai arba bilieto kaina atgal',
  outboundParcels: 'Siuntos arba jų kaina pirmyn', returnParcels: 'Siuntos arba jų kaina atgal',
  otherRevenue: 'Kitos pajamos', monthlyTrips: 'Reisų skaičius per mėnesį', monthlyFixed: 'Mėnesio pastoviosios sąnaudos',
  ...extraCostLabels,
};
const costLabels: Record<string, string> = { fuel: 'Kuras', wear: 'Eksploatacija be kuro', driver: 'Vairuotojo atlygis', waiting: 'Papildomas laukimas', ...extraCostLabels };

export function CalculationResults({ result, input, view, dirty, savedAt }: {
  result: Calculation; input: CalculatorInput; view: 'trip' | 'month'; dirty: boolean; savedAt?: string;
}) {
  const values = view === 'trip' ? result.trip : result.month;
  const max = Math.max(values.revenue ?? 0, values.totalCost ?? 0, 1);
  const percent = (value: number) => new Intl.NumberFormat('lt-LT', { style: 'percent', maximumFractionDigits: 1 }).format(value);
  const remainder = values.remainder;
  const missing = result.missing.filter(key => view === 'month'
    ? input.monthlyTrips === 0 ? ['monthlyTrips', 'monthlyFixed'].includes(key) : key !== 'fixedShare'
    : !['monthlyTrips', 'monthlyFixed'].includes(key));
  return <aside className="calc-results panel" id="calculation-results" tabIndex={-1} aria-label="Skaičiavimo rezultatai">
    <header><span>{view === 'trip' ? 'Reiso įvertinimas' : 'Mėnesio įvertinimas'}</span>
      <small>{dirty || !savedAt ? 'Pagal dabartines prielaidas' : `Išsaugota ${new Intl.DateTimeFormat('lt-LT', { dateStyle: 'short' }).format(new Date(savedAt))}`}</small></header>
    <div className={`calc-remainder ${remainder === null ? '' : remainder < 0 ? 'negative' : 'positive'}`}>
      <span>Preliminarus likutis</span><strong>{remainder === null ? '—' : money(remainder)}</strong>
      <small>{remainder === null ? 'Užpildykite trūkstamas prielaidas' : remainder < 0 ? 'Sąnaudos viršija pajamas' : 'Pajamos padengia įtrauktas sąnaudas'}</small>
    </div>
    <div className="calc-comparison" aria-label="Pajamų ir sąnaudų palyginimas">
      <div><span><ArrowUpRight size={15} />Planuojamos pajamos</span><b>{calculationMoney(values.revenue)}</b></div>
      <div className="calc-bar revenue"><i style={{ width: `${(values.revenue ?? 0) / max * 100}%` }} /></div>
      <div><span><ArrowDownRight size={15} />Sąnaudos</span><b>{calculationMoney(values.totalCost)}</b></div>
      <div className="calc-bar cost"><i style={{ width: `${(values.totalCost ?? 0) / max * 100}%` }} /></div>
    </div>
    <dl className="calc-breakdown">
      {view === 'trip' ? Object.entries(result.trip.costs).filter(([key, value]) => value !== 0
        || key === 'fuel' && input.includeFuel || key === 'wear' && input.includeWear || key === 'driver' && input.includeDriver
        || key === 'waiting' && input.includeWaiting || Object.hasOwn(input.extras, key) && input.extras[key as keyof typeof input.extras].included).map(([key, value]) =>
        <div key={key}><dt>{costLabels[key]}</dt><dd>{calculationMoney(value)}</dd></div>) : <>
          <div><dt>Reisų sąnaudos × {input.monthlyTrips ?? '?'}</dt><dd>{calculationMoney(result.month.tripCosts)}</dd></div>
          <div><dt>Mėnesio pastoviosios sąnaudos</dt><dd>{calculationMoney(result.month.fixed)}</dd></div>
        </>}
      <div className="calc-total"><dt>Iš viso sąnaudų</dt><dd>{calculationMoney(values.totalCost)}</dd></div>
    </dl>
    {view === 'trip' && <dl className="calc-facts">
      <div><dt>Sąnaudos kilometrui</dt><dd>{result.trip.costPerKm === null ? '—' : `${calculationMoney(result.trip.costPerKm)}/km`}</dd></div>
      <div><dt>Pajamų ir sąnaudų santykis</dt><dd>{result.trip.coverage === null ? '—' : `${result.trip.coverage.toLocaleString('lt-LT', { maximumFractionDigits: 2 })}×`}</dd></div>
    </dl>}
    <div className="calc-shortfall"><span>Iki sąnaudų padengimo trūksta</span><b>{calculationMoney(values.shortfall)}</b></div>
    {view === 'trip' && input.revenueMode !== 'total' && <div className="calc-occupancy">
      {result.trip.occupancy.peak !== null && <p>Vienu metu daugiausia: <b>{result.trip.occupancy.peak}</b> / {input.seats ?? '?'} vietų</p>}
      {(['outbound', 'returnLeg'] as const).map(key => {
        const value = result.trip.occupancy[key];
        if (value === null) return null;
        return <div key={key}><div><span>{input.revenueMode === 'bookings' && input.turnaround === null ? 'Didžiausias užimtumas' : key === 'outbound' ? 'Užimtumas pirmyn' : 'Užimtumas atgal'}</span><b>{percent(value)}</b></div>
          <progress aria-label={key === 'outbound' ? 'Keleivių užimtumas pirmyn' : 'Keleivių užimtumas atgal'} max={100} value={Math.min(100, value * 100)} /></div>;
      })}
      {result.trip.breakEvenOccupancy !== null && <details className="calc-explanation"><summary><CircleHelp size={15} />Užimtumas sąnaudoms padengti <b>{percent(result.trip.breakEvenOccupancy)}</b></summary>
        <p>Bilietų kainos ir ne keleivių pajamos nekinta. Abiejų krypčių užimtumas keičiamas vienodu procentu.</p>
        {result.trip.breakEvenOccupancy > 1 && <p>Reikėtų daugiau nei 100 % užimtumo. Pagal šias prielaidas vien keleiviais sąnaudų padengti nepavyktų.</p>}</details>}
    </div>}
    {!!missing.length && <div className="calc-missing" role="status"><b>Trūksta prielaidų: {missing.length}</b><ul>{missing.map(key => <li key={key}>{missingLabels[key] ?? key}</li>)}</ul></div>}
    {result.warnings.map(key => <p className="calc-warning" key={key} role="status">{key === 'capacity' ? 'Keleivių skaičius viršija scenarijuje nurodytas vietas.'
      : 'Nurodytos grįžimo pajamos. Patikrinkite, ar kilometruose įtrauktas ir grįžimas.'}</p>)}
    <p className="calc-footnote">Planavimo rezultatas pagal įtrauktas prielaidas. Faktiniai užsakymai, mokėjimai ir išlaidos nekeičiami.</p>
  </aside>;
}
