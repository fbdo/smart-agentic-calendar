export interface Event {
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  isAllDay: boolean;
  date: string | null;
  createdAt: string;
  updatedAt: string;
}
