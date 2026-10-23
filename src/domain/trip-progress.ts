import type { Order, Trip } from './models.ts';
import type { TaskConfirmation } from './workspace.ts';
import { routeVisits, visitTasks } from './route-plan.ts';

export type VisitState = 'done' | 'arrived' | 'next' | 'pending';

/** A read-only projection: physical arrival never implies a completed handover. */
export function tripProgress(trip: Trip, orders: Order[], confirmations: TaskConfirmation[]) {
  const booked = orders.filter(order => order.tripId === trip.id && order.status !== 'cancelled');
  const events = confirmations.filter(event => event.tripId === trip.id);
  const visits = routeVisits(trip.stops);
  const nextArrival = visits.findIndex(visit => !visit.completed);
  const result = visits.map((visit, index) => {
    const tasks = visitTasks(visit, booked).map(task => {
      const confirmation = events.find(event => event.orderId === task.orderId && event.kind === task.kind);
      const done = !!confirmation || trip.status === 'completed'
        || booked.some(order => order.id === task.orderId && order.status === 'completed');
      const pickupDone = done || events.some(event => event.orderId === task.orderId && event.kind === 'pickup');
      const available = trip.status === 'active' && (visit.completed || index === nextArrival);
      const blockedBy = !available ? 'visit' : task.kind === 'delivery' && !pickupDone ? 'pickup' : null;
      return { ...task, confirmation, done, allowed: !done && !blockedBy, blockedBy };
    });
    const done = trip.status === 'completed' || (visit.completed && tasks.every(task => task.done));
    const state: VisitState = done ? 'done' : visit.completed ? 'arrived'
      : index === nextArrival && trip.status !== 'cancelled' ? 'next' : 'pending';
    return { ...visit, tasks, state, done, pending: tasks.filter(task => !task.done).length };
  });
  const unconfirmed = result.findIndex(visit => visit.completed && visit.pending > 0);
  return {
    visits: result,
    nextArrival,
    focusIndex: trip.status === 'completed' || trip.status === 'cancelled' ? -1
      : unconfirmed >= 0 ? unconfirmed : nextArrival,
    arrived: result.filter(visit => visit.completed || trip.status === 'completed').length,
    completed: result.filter(visit => visit.done).length,
    taskCount: result.reduce((sum, visit) => sum + visit.tasks.length, 0),
    confirmedTasks: result.reduce((sum, visit) => sum + visit.tasks.filter(task => task.done).length, 0),
  };
}
