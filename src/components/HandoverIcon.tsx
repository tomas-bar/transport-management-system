import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

export function HandoverIcon({ kind, size = 16 }: { kind: 'pickup' | 'delivery'; size?: number }) {
  const Icon = kind === 'pickup' ? ArrowUpRight : ArrowDownRight;
  return <Icon size={size} aria-hidden="true" />;
}
