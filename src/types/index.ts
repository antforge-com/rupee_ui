// src/types/index.ts

export interface Advisor {
  id: number;
  name: string;
  designation: string;
  charges: number;
  shiftTimings: string;
  skills: string[];
}

export interface Booking {
  id: number;
  userName: string;
  userAvatar?: string;
  date: string;
  time: string;
  status: 'CONFIRMED' | 'PENDING' | 'COMPLETED';
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