import { Advisor, BookingData, RecentBooking, PendingQuery } from "/workspaces/finco1/finadvise-ts/src/types";

export const advisors: Advisor[] = [
  { id: 1, name: "Sarah Jenkins", role: "Certified Financial Planner", tags: ["Tax Planning", "Retirement", "Wealth Management"], rating: 4.9, fee: 1500, exp: 12, reviews: 850, avatar: "https://randomuser.me/api/portraits/women/44.jpg" },
  { id: 2, name: "Michael Chen", role: "Investment Strategist", tags: ["Stock Market", "Crypto", "ETFs"], rating: 4.8, fee: 1200, exp: 8, reviews: 420, avatar: "https://randomuser.me/api/portraits/men/32.jpg" },
  { id: 3, name: "Elena Rodriguez", role: "Wealth Management Expert", tags: ["Estate Planning", "Private Banking", "Insurance"], rating: 5.0, fee: 2500, exp: 15, reviews: 610, avatar: "https://randomuser.me/api/portraits/women/68.jpg" },
  { id: 4, name: "Arjun Mehta", role: "Tax Consultant", tags: ["Tax Experts", "ITR Filing", "GST"], rating: 4.7, fee: 900, exp: 6, reviews: 310, avatar: "https://randomuser.me/api/portraits/men/75.jpg" },
];

export const bookingData: BookingData[] = [
  { day: "Mon", bookings: 10 }, { day: "Tue", bookings: 20 }, { day: "Wed", bookings: 15 },
  { day: "Thu", bookings: 23 }, { day: "Fri", bookings: 31 }, { day: "Sat", bookings: 9 }, { day: "Sun", bookings: 8 },
];

export const recentBookings: RecentBooking[] = [
  { user: "Alex Morgan", advisor: "Sarah Jenkins", time: "10:30 AM", status: "Upcoming", amount: 1500 },
  { user: "David Beck", advisor: "Michael Chen", time: "11:45 AM", status: "Completed", amount: 1200 },
  { user: "Linda Ray", advisor: "Elena Rodriguez", time: "02:00 PM", status: "Pending", amount: 2500 },
];

export const pendingQueries: PendingQuery[] = [
  { id: 1025, question: "How to optimize tax for LTCG?" },
  { id: 1026, question: "How to optimize tax for LTCG?" },
  { id: 1027, question: "Should I invest in NPS for retirement?" },
];

export const categories: string[] = ["All Advisors", "Tax Experts", "Investment", "Wealth", "Retirement"];
