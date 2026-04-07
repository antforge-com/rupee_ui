export interface Advisor {
  id: number;
  name: string;
  designation: string;
  charges: number;
  shiftTimings: string;
  skills: string[];
}

// ✅ Added Exported Type
export type BookingStatus = 'CONFIRMED' | 'PENDING' | 'COMPLETED';

export interface Booking {
  id: number;
  userName: string;
  userAvatar?: string;
  date: string;
  time: string;
  status: BookingStatus; // ✅ Uses the type
  meetingLink: string;
}

export interface Query {
  id: number;
  title: string;
  question: string;
  date: string;
  status: 'Pending Review' | 'Replied';
  user: string;
}