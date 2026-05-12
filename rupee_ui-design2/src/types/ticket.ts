export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT" | "CRITICAL";
export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export interface Ticket {
  id: number;
  userId?: number;
  description: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: string;
  attachmentUrl?: string;
  agentName?: string;
  feedbackRating?: number;
  feedbackText?: string;
  isSlaBreached?: boolean;
  slaRespondBy?: string;
  ticketNumber?: string;
  categoryName?: string;
  consultantId?: number | null;
  emailSubject?: string;
  emailBody?: string;
}

export interface TicketComment {
  id: number;
  ticketId: number;
  authorName: string;
  content: string;
  createdAt: string;
  isOfficial?: boolean;
}

export interface TicketCategory {
  id: number;
  name: string;
}
