import type { Order } from '../domain/models';
import type { VisitTask } from '../domain/route-plan';
import { handoverLabels } from '../domain/terminology';
import { HandoverIcon } from './HandoverIcon';

export function TaskDetails({ task, order, className = '', showPhone = false }: {
  task: VisitTask;
  order?: Order;
  className?: string;
  showPhone?: boolean;
}) {
  const name = order?.name ?? task.name;
  const recipient = task.type === 'parcel' && task.kind === 'delivery' && order?.recipient !== name ? order?.recipient : '';
  return <div className={`task-details ${className}`}>
    <div className="task-meta">
      <span className={`task-direction ${task.kind}`}><HandoverIcon kind={task.kind} size={14} />{handoverLabels[task.kind].title}</span>
      <span className="task-quantity">{task.type === 'passenger' ? 'Keleiviai' : 'Siuntos'}: {task.quantity}</span>
    </div>
    <b className="task-name">{name}</b>
    {recipient && <span className="task-contact">Gavėjas: {recipient}</span>}
    {showPhone && task.phone && <a className="task-phone" href={`tel:${task.phone.replace(/\s/g, '')}`}>{task.phone}</a>}
  </div>;
}
