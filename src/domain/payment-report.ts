import type { ReviewSnapshot } from './workspace.ts';
export interface PaymentMovement { id: string; orderId: string; receiptId: string; date: string; amount: number; kind: 'receipt' | 'void'; method: 'cash' | 'bank' | 'card'; actorId: string }
const civilDay = (value: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
export function paymentReport(snapshot: ReviewSnapshot, from: string, to: string) {
  const movements: PaymentMovement[] = [];
  for (const receipt of snapshot.workspace.receipts ?? []) {
    movements.push({ id: receipt.id, receiptId: receipt.id, orderId: receipt.orderId, date: receipt.date, amount: receipt.amount, kind: 'receipt', method: receipt.method, actorId: receipt.actorId });
    if (receipt.voidedAt) movements.push({ id: receipt.id + ':void', receiptId: receipt.id, orderId: receipt.orderId, date: civilDay(receipt.voidedAt), amount: -receipt.amount, kind: 'void', method: receipt.method, actorId: receipt.voidedBy! });
  }
  const period = movements.filter(m => m.date >= from && m.date <= to).sort((a, b) => b.date.localeCompare(a.date));
  const sum = (list: PaymentMovement[]) => {
    const result = list.reduce((total, movement) => total + movement.amount, 0);
    if (!Number.isSafeInteger(result)) throw new Error('Suma viršija saugią skaičiavimo ribą.');
    return result;
  };
  return { movements: period, received: sum(period.filter(m => m.kind === 'receipt')), reversed: Math.abs(sum(period.filter(m => m.kind === 'void'))), net: sum(period) };
}
