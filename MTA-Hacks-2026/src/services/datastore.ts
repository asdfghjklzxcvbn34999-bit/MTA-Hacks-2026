import { appConfig } from "../config";
import type {
  Announcement,
  Booking,
  ClassMembership,
  OfficeHoursConfig,
  OfficeHoursPoll,
  Person,
  PollResponse,
  SessionUser,
  Slot,
  SuggestedConfig
} from "../types";

interface DataStore {
  getPersonByEmail(email: string): Promise<Person | null>;
  getClassesByIds(classIds: string[]): Promise<ClassMembership[]>;
  listClasses(email: string): Promise<ClassMembership[]>;
  listPolls(classId: string): Promise<OfficeHoursPoll[]>;
  listPollsForStudent(courseIds: string[]): Promise<OfficeHoursPoll[]>;
  createPoll(poll: OfficeHoursPoll): Promise<void>;
  savePollResponse(response: PollResponse): Promise<void>;
  suggestTopConfigs(pollId: string): Promise<SuggestedConfig[]>;
  saveOfficeHoursConfig(config: OfficeHoursConfig): Promise<void>;
  listSlots(classId: string): Promise<Slot[]>;
  createBooking(booking: Booking): Promise<void>;
  listBookings(classId: string): Promise<Booking[]>;
  saveAnnouncement(announcement: Announcement): Promise<void>;
}

const SEED_PEOPLE: Person[] = [
  {
    email: "teacher@mta.ca",
    name: "Prof. Smith",
    role: "teacher",
    courseIds: ["comp-101", "math-210"]
  },
  {
    email: "teacher2@umoncton.ca",
    name: "Dr. Jones",
    role: "teacher",
    courseIds: ["math-210"]
  },
  {
    email: "student@mta.ca",
    name: "Alice Student",
    role: "student",
    courseIds: ["comp-101", "math-210"]
  },
  {
    email: "student2@umoncton.ca",
    name: "Bob Student",
    role: "student",
    courseIds: ["comp-101"]
  }
];

type LocalState = {
  people: Person[];
  classes: ClassMembership[];
  polls: OfficeHoursPoll[];
  responses: PollResponse[];
  configs: OfficeHoursConfig[];
  slots: Slot[];
  bookings: Booking[];
  announcements: Announcement[];
};

const LOCAL_KEY = "office-hours-local-state-v2";

const DEFAULT_CLASSES: ClassMembership[] = [
  { classId: "comp-101", className: "COMP 101", teacherEmail: "teacher@mta.ca" },
  { classId: "math-210", className: "MATH 210", teacherEmail: "teacher2@umoncton.ca" }
];

function loadState(): LocalState {
  const raw = localStorage.getItem(LOCAL_KEY);
  if (!raw) {
    return {
      people: SEED_PEOPLE,
      classes: DEFAULT_CLASSES,
      polls: [],
      responses: [],
      configs: [],
      slots: [],
      bookings: [],
      announcements: []
    };
  }
  const parsed = JSON.parse(raw) as LocalState;
  if (!parsed.people || parsed.people.length === 0) {
    parsed.people = SEED_PEOPLE;
  }
  if (!parsed.classes || parsed.classes.length === 0) {
    parsed.classes = DEFAULT_CLASSES;
  }
  for (const poll of parsed.polls ?? []) {
    if (poll.pollType === undefined) poll.pollType = "office_hours";
  }
  return parsed;
}

function saveState(state: LocalState): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
}

class LocalDataStore implements DataStore {
  async getPersonByEmail(email: string): Promise<Person | null> {
    const normalized = email.trim().toLowerCase();
    const person = loadState().people.find((p) => p.email.toLowerCase() === normalized);
    return person ?? null;
  }

  async getClassesByIds(classIds: string[]): Promise<ClassMembership[]> {
    const normalizedIds = classIds.filter(Boolean).map((id) => id.trim());
    if (normalizedIds.length === 0) return [];
    const set = new Set(normalizedIds.map((id) => id.toLowerCase()));
    const found = loadState().classes.filter((c) => set.has(c.classId.toLowerCase()));
    const foundIds = new Set(found.map((c) => c.classId.toLowerCase()));
    const missing = normalizedIds.filter((id) => !foundIds.has(id.toLowerCase()));
    const fallbacks: ClassMembership[] = missing.map((classId) => ({
      classId,
      className: classId,
      teacherEmail: ""
    }));
    return [...found, ...fallbacks];
  }

  async listClasses(_email: string): Promise<ClassMembership[]> {
    return loadState().classes;
  }

  async listPolls(classId: string): Promise<OfficeHoursPoll[]> {
    return loadState().polls.filter((poll) => poll.classId === classId);
  }

  async listPollsForStudent(courseIds: string[]): Promise<OfficeHoursPoll[]> {
    const set = new Set(courseIds.map((id) => id.toLowerCase()));
    return loadState().polls.filter((poll) => set.has(poll.classId.toLowerCase()));
  }

  async createPoll(poll: OfficeHoursPoll): Promise<void> {
    const state = loadState();
    if (poll.pollType === "office_hours") {
      const existing = state.polls.some(
        (p) => p.classId === poll.classId && p.pollType === "office_hours"
      );
      if (existing) {
        throw new Error("This course already has an office-hours poll. Only one office-hours poll per course is allowed.");
      }
    }
    state.polls.push(poll);
    saveState(state);
  }

  async savePollResponse(response: PollResponse): Promise<void> {
    const state = loadState();
    const existing = state.responses.findIndex(
      (item) =>
        item.pollId === response.pollId && item.studentEmail.toLowerCase() === response.studentEmail.toLowerCase()
    );
    if (existing >= 0) {
      state.responses[existing] = response;
    } else {
      state.responses.push(response);
    }
    saveState(state);
  }

  async suggestTopConfigs(pollId: string): Promise<SuggestedConfig[]> {
    const state = loadState();
    const poll = state.polls.find((item) => item.pollId === pollId);
    if (!poll) {
      return [];
    }
    const counts = new Map<string, number>();
    for (const response of state.responses.filter((item) => item.pollId === pollId)) {
      for (const key of response.selectedOptionKeys) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 2);
    return sorted.map(([key, count], index) => ({
      rank: (index + 1) as 1 | 2,
      summary: key,
      estimatedCoverage: count
    }));
  }

  async saveOfficeHoursConfig(config: OfficeHoursConfig): Promise<void> {
    const state = loadState();
    state.configs.push(config);
    const generatedSlots = config.sessions.map((session, index) => ({
      slotId: `${config.configId}-${index}`,
      classId: config.classId,
      startsAtIso: `${new Date().toISOString().slice(0, 10)}T${session.startHour}:00.000Z`,
      endsAtIso: `${new Date().toISOString().slice(0, 10)}T${session.endHour}:00.000Z`,
      capacity: 1
    }));
    state.slots.push(...generatedSlots);
    saveState(state);
  }

  async listSlots(classId: string): Promise<Slot[]> {
    return loadState().slots.filter((slot) => slot.classId === classId);
  }

  async createBooking(booking: Booking): Promise<void> {
    const state = loadState();
    const alreadyBooked = state.bookings.some(
      (item) => item.slotId === booking.slotId && item.studentEmail.toLowerCase() === booking.studentEmail.toLowerCase()
    );
    if (alreadyBooked) {
      throw new Error("This student has already booked the selected slot.");
    }
    state.bookings.push(booking);
    saveState(state);
  }

  async listBookings(classId: string): Promise<Booking[]> {
    return loadState().bookings.filter((booking) => booking.classId === classId);
  }

  async saveAnnouncement(announcement: Announcement): Promise<void> {
    const state = loadState();
    state.announcements.push(announcement);
    saveState(state);
  }
}

class AppsScriptDataStore implements DataStore {
  constructor(private readonly endpoint: string) {}

  private async call<T>(action: string, payload: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload })
    });
    if (!response.ok) {
      throw new Error(`Apps Script request failed: ${response.status}`);
    }
    return (await response.json()) as T;
  }

  getPersonByEmail(email: string): Promise<Person | null> {
    return this.call("getPersonByEmail", { email });
  }

  getClassesByIds(classIds: string[]): Promise<ClassMembership[]> {
    return this.call("getClassesByIds", { classIds });
  }

  listClasses(email: string): Promise<ClassMembership[]> {
    return this.call("listClasses", { email });
  }

  listPolls(classId: string): Promise<OfficeHoursPoll[]> {
    return this.call("listPolls", { classId });
  }

  listPollsForStudent(courseIds: string[]): Promise<OfficeHoursPoll[]> {
    return this.call("listPollsForStudent", { courseIds });
  }

  createPoll(poll: OfficeHoursPoll): Promise<void> {
    return this.call("createPoll", { poll });
  }

  savePollResponse(response: PollResponse): Promise<void> {
    return this.call("savePollResponse", { response });
  }

  suggestTopConfigs(pollId: string): Promise<SuggestedConfig[]> {
    return this.call("suggestTopConfigs", { pollId });
  }

  saveOfficeHoursConfig(config: OfficeHoursConfig): Promise<void> {
    return this.call("saveOfficeHoursConfig", { config });
  }

  listSlots(classId: string): Promise<Slot[]> {
    return this.call("listSlots", { classId });
  }

  createBooking(booking: Booking): Promise<void> {
    return this.call("createBooking", { booking });
  }

  listBookings(classId: string): Promise<Booking[]> {
    return this.call("listBookings", { classId });
  }

  saveAnnouncement(announcement: Announcement): Promise<void> {
    return this.call("saveAnnouncement", { announcement });
  }
}

export function createDataStore(): DataStore {
  if (appConfig.appsScriptUrl) {
    return new AppsScriptDataStore(appConfig.appsScriptUrl);
  }
  return new LocalDataStore();
}

export function inferRole(user: SessionUser, classes: ClassMembership[]): "teacher" | "student" {
  const teachesAny = classes.some((entry) => entry.teacherEmail.toLowerCase() === user.email.toLowerCase());
  return teachesAny ? "teacher" : "student";
}
