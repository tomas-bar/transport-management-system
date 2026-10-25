import { money } from '../../domain/logic';

export const calculationMoney = (value: number | null) => value === null ? 'Nežinoma' : money(Math.round(value));
