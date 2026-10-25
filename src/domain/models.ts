import type { CalculatorState } from './calculator.ts';

export type TripStatus =
  | "planned"
  | "confirmed"
  | "active"
  | "completed"
  | "cancelled";
export type OrderStatus =
  | "new"
  | "confirmed"
  | "assigned"
  | "active"
  | "completed"
  | "cancelled";
export type EntityStatus = "active" | "unavailable" | "archived";
export interface Place {
  name: string;
  address: string;
  lat: number;
  lng: number;
}
export interface Stop extends Place {
  id: string;
  arrival?: string;
  note?: string;
  completed?: boolean;
  orderId?: string;
  kind?: "pickup" | "delivery";
}
export interface Route {
  id: string;
  name: string;
  type: "local" | "international";
  stops: Stop[];
  notes: string;
  archived?: boolean;
}
export interface Trip {
  recordMode?: 'draft' | 'historical';
  id: string;
  number: string;
  name: string;
  type: "local" | "international";
  departure: string;
  arrival: string;
  vehicleId: string;
  driverId: string;
  routeId: string;
  status: TripStatus;
  notes: string;
  stops: Stop[];
}
export interface Order {
  recordMode?: 'historical';
  id: string;
  number: string;
  type: "passenger" | "parcel";
  customerId: string;
  name: string;
  phone: string;
  recipient: string;
  recipientPhone: string;
  pickup: Place;
  delivery: Place;
  date: string;
  quantity: number;
  luggage: string;
  description: string;
  weight: number | null;
  dimensions: string;
  price: number;
  priceSet?: boolean;
  paid: number;
  status: OrderStatus;
  tripId: string;
  notes: string;
}
export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  type: string;
  seats: number;
  maxMass: number;
  payload: number | null;
  fuel: string;
  consumption: number;
  mileage: number;
  status: EntityStatus;
  notes: string;
}
export interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  categories: string;
  status: EntityStatus;
  notes: string;
}
export interface Customer {
  id: string;
  name: string;
  type: "person" | "company";
  phone: string;
  email: string;
  address: string;
  notes: string;
  status: EntityStatus;
}
export interface Expense {
  id: string;
  date: string;
  category: string;
  amount: number;
  tripId: string;
  vehicleId: string;
  description: string;
}
export interface NumberSeries { prefix: string; start: number }
export interface Settings {
  company: string;
  email: string;
  phone: string;
  routingUrl: string;
  geocodingUrl: string;
  numbering?: { trips: NumberSeries; orders: NumberSeries };
}
export interface Database {
  version: 1;
  planning?: CalculatorState;
  trips: Trip[];
  routes: Route[];
  orders: Order[];
  vehicles: Vehicle[];
  drivers: Driver[];
  customers: Customer[];
  expenses: Expense[];
  settings: Settings;
}
export type Collection =
  | "trips"
  | "routes"
  | "orders"
  | "vehicles"
  | "drivers"
  | "customers"
  | "expenses";
export const tripStatuses: Record<TripStatus, string> = {
  planned: "Planuojamas",
  confirmed: "Patvirtintas",
  active: "Vykdomas",
  completed: "Užbaigtas",
  cancelled: "Atšauktas",
};
export const orderStatuses: Record<OrderStatus, string> = {
  new: "Naujas",
  confirmed: "Patvirtintas",
  assigned: "Priskirtas reisui",
  active: "Vykdomas",
  completed: "Įvykdytas",
  cancelled: "Atšauktas",
};
export const entityStatuses: Record<EntityStatus, string> = {
  active: "Aktyvus",
  unavailable: "Nepasiekiamas",
  archived: "Archyvuotas",
};
export const expenseCategories = [
  "Degalai",
  "Kelių mokesčiai",
  "Automobilio priežiūra",
  "Parkavimas",
  "Nakvynė",
  "Kitos išlaidos",
];
