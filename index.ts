export interface Advisor {
  id: number;
  name: string;
  role: string;
  tags: string[];
  rating: number;
  fee: number;
  exp: number;
  reviews: number;
  avatar: string;
}

export interface BookingData {
  day: string;
  bookings: number;
}

export interface RecentBooking {
  user: string;
  advisor: string;
  time: string;
  status: BookingStatus;
  amount: number;
}

export interface PendingQuery {
  id: number;
  question: string;
}

export interface UserBooking extends Advisor {
  time: string;
  status: BookingStatus;
  date: string;
}

export interface UserQuery {
  text: string;
  status: BookingStatus;
}

export type BookingStatus = "Upcoming" | "Completed" | "Pending";

export type TabType = "advisors" | "bookings" | "queries" | "settings";

export type AdminSectionType = "dashboard" | "advisors" | "bookings" | "queries" | "settings";

export interface NavItem {
  id: TabType;
  label: string;
  icon: JSX.Element;
}

export interface AdminNavItem {
  id: AdminSectionType;
  label: string;
  icon: JSX.Element;
}

export interface StatCard {
  label: string;
  value: string;
  change: string;
  positive: boolean;
  icon: JSX.Element;
}