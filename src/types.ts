export type Role = "teacher" | "student";

export type PollType = "office_hours" | "general";

export interface Person {
  email: string;
  name: string;
  role: Role;
  courseIds: string[];
}

export interface SessionUser {
  email: string;
  role: Role;
  name: string;
  myCourses: string[];
}

export interface ClassMembership {
  classId: string;
  className: string;
  teacherEmail: string;
}

export interface PollOption {
  day: string;
  startHour: string;
  endHour: string;
}

export interface OfficeHoursPoll {
  pollId: string;
  classId: string;
  teacherEmail: string;
  pollType: PollType;
  title: string;
  slotMinutes: number;
  daysPerWeek: number;
  closesAtIso: string;
  options: PollOption[];
}

export interface PollResponse {
  responseId: string;
  pollId: string;
  classId: string;
  studentEmail: string;
  selectedOptionKeys: string[];
  submittedAtIso: string;
}

export interface SuggestedConfig {
  rank: 1 | 2;
  summary: string;
  estimatedCoverage: number;
}

export interface OfficeHoursConfig {
  configId: string;
  classId: string;
  pollId: string;
  chosenByTeacher: boolean;
  summary: string;
  slotMinutes: number;
  sessions: {
    day: string;
    startHour: string;
    endHour: string;
  }[];
}

export interface Slot {
  slotId: string;
  classId: string;
  startsAtIso: string;
  endsAtIso: string;
  capacity: number;
}

export interface Booking {
  bookingId: string;
  classId: string;
  slotId: string;
  studentEmail: string;
  createdAtIso: string;
}

export interface Announcement {
  announcementId: string;
  classId: string;
  teacherEmail: string;
  subject: string;
  body: string;
  createdAtIso: string;
}
