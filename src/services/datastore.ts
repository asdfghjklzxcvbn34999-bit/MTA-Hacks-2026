import { appConfig } from "../config";
import { computeBestTimes as computeBestTimesAlgo } from "./bestTime";
import type {
  Course,
  Enrollment,
  ProfessorAvailability,
  SessionUser,
  StudentPreference,
  TimeRange,
  User,
  BestTimeResult
} from "../types";

const SEED_USERS: User[] = [
  { email: "teacher@mta.ca", password: "password", role: "teacher", name: "Prof. Smith" },
  { email: "teacher2@umoncton.ca", password: "password", role: "teacher", name: "Dr. Jones" },
  { email: "student@mta.ca", password: "password", role: "student", name: "Alice Student" },
  { email: "student2@umoncton.ca", password: "password", role: "student", name: "Bob Student" }
];

type LocalState = {
  users: User[];
  courses: Course[];
  professorAvailability: ProfessorAvailability[];
  studentPreferences: StudentPreference[];
  enrollments: Enrollment[];
};

const LOCAL_KEY = "office-hours-booking-state-v1";

function loadState(): LocalState {
  const raw = localStorage.getItem(LOCAL_KEY);
  if (!raw) {
    return {
      users: [...SEED_USERS],
      courses: [],
      professorAvailability: [],
      studentPreferences: [],
      enrollments: []
    };
  }
  const parsed = JSON.parse(raw) as LocalState;
  if (!parsed.users || parsed.users.length === 0) {
    parsed.users = [...SEED_USERS];
  }
  if (!parsed.courses) parsed.courses = [];
  if (!parsed.professorAvailability) parsed.professorAvailability = [];
  if (!parsed.studentPreferences) parsed.studentPreferences = [];
  if (!parsed.enrollments) parsed.enrollments = [];
  return parsed;
}

function saveState(state: LocalState): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
}

export interface DataStore {
  validateLogin(email: string, password: string): Promise<SessionUser | null>;
  createUser(user: User): Promise<void>;
  listCoursesByTeacher(teacherEmail: string): Promise<Course[]>;
  listAllCourses(): Promise<Course[]>;
  createCourse(course: Course): Promise<void>;
  getAvailability(courseId: string): Promise<ProfessorAvailability | null>;
  setAvailability(courseId: string, timeRanges: TimeRange[]): Promise<void>;
  listEnrollmentsForCourse(courseId: string): Promise<string[]>;
  listEnrollmentsForStudent(studentEmail: string): Promise<Course[]>;
  enroll(studentEmail: string, courseId: string): Promise<void>;
  getPreferences(studentEmail: string, courseId: string): Promise<TimeRange[]>;
  setPreferences(studentEmail: string, courseId: string, timeRanges: TimeRange[]): Promise<void>;
  computeBestTimes(courseId: string): Promise<BestTimeResult | null>;
}

class LocalDataStore implements DataStore {
  validateLogin(email: string, password: string): Promise<SessionUser | null> {
    const normalized = email.trim().toLowerCase();
    const state = loadState();
    const user = state.users.find((u) => u.email.toLowerCase() === normalized);
    if (!user || user.password !== password) return Promise.resolve(null);
    return Promise.resolve({
      email: user.email,
      role: user.role,
      name: user.name
    });
  }

  async createUser(user: User): Promise<void> {
    const state = loadState();
    const exists = state.users.some((u) => u.email.toLowerCase() === user.email.toLowerCase());
    if (exists) throw new Error("User already exists.");
    state.users.push({
      ...user,
      email: user.email.trim().toLowerCase()
    });
    saveState(state);
  }

  listCoursesByTeacher(teacherEmail: string): Promise<Course[]> {
    const normalized = teacherEmail.trim().toLowerCase();
    const courses = loadState().courses.filter(
      (c) => c.teacherEmail.trim().toLowerCase() === normalized
    );
    return Promise.resolve(courses);
  }

  listAllCourses(): Promise<Course[]> {
    return Promise.resolve(loadState().courses);
  }

  async createCourse(course: Course): Promise<void> {
    const state = loadState();
    state.courses.push(course);
    saveState(state);
  }

  getAvailability(courseId: string): Promise<ProfessorAvailability | null> {
    return Promise.resolve(
      loadState().professorAvailability.find((a) => a.courseId === courseId) ?? null
    );
  }

  setAvailability(courseId: string, timeRanges: TimeRange[]): Promise<void> {
    const state = loadState();
    const idx = state.professorAvailability.findIndex((a) => a.courseId === courseId);
    const entry: ProfessorAvailability = { courseId, timeRanges };
    if (idx >= 0) {
      state.professorAvailability[idx] = entry;
    } else {
      state.professorAvailability.push(entry);
    }
    saveState(state);
    return Promise.resolve();
  }

  async listEnrollmentsForCourse(courseId: string): Promise<string[]> {
    const enrollments = loadState().enrollments.filter((e) => e.courseId === courseId);
    return enrollments.map((e) => e.studentEmail);
  }

  async listEnrollmentsForStudent(studentEmail: string): Promise<Course[]> {
    const normalized = studentEmail.trim().toLowerCase();
    const enrollments = loadState().enrollments.filter(
      (e) => e.studentEmail.toLowerCase() === normalized
    );
    const courseIds = enrollments.map((e) => e.courseId);
    const courses = loadState().courses.filter((c) => courseIds.includes(c.courseId));
    return courses;
  }

  async enroll(studentEmail: string, courseId: string): Promise<void> {
    const state = loadState();
    const normalizedEmail = studentEmail.trim().toLowerCase();
    const exists = state.enrollments.some(
      (e) => e.studentEmail.toLowerCase() === normalizedEmail && e.courseId === courseId
    );
    if (exists) throw new Error("Already enrolled in this course.");
    state.enrollments.push({ studentEmail: normalizedEmail, courseId });
    saveState(state);
  }

  getPreferences(studentEmail: string, courseId: string): Promise<TimeRange[]> {
    const prefs = loadState().studentPreferences.find(
      (p) => p.studentEmail.toLowerCase() === studentEmail.toLowerCase() && p.courseId === courseId
    );
    return Promise.resolve(prefs?.timeRanges ?? []);
  }

  setPreferences(studentEmail: string, courseId: string, timeRanges: TimeRange[]): Promise<void> {
    const state = loadState();
    const normalizedEmail = studentEmail.trim().toLowerCase();
    const idx = state.studentPreferences.findIndex(
      (p) => p.studentEmail.toLowerCase() === normalizedEmail && p.courseId === courseId
    );
    const entry: StudentPreference = { studentEmail: normalizedEmail, courseId, timeRanges };
    if (idx >= 0) {
      state.studentPreferences[idx] = entry;
    } else {
      state.studentPreferences.push(entry);
    }
    saveState(state);
    return Promise.resolve();
  }

  async computeBestTimes(courseId: string): Promise<BestTimeResult | null> {
    const state = loadState();
    const course = state.courses.find((c) => c.courseId === courseId);
    if (!course) return null;
    const availability = state.professorAvailability.find((a) => a.courseId === courseId);
    const profRanges = availability?.timeRanges ?? [];
    const enrolledEmails = state.enrollments
      .filter((e) => e.courseId === courseId)
      .map((e) => e.studentEmail);
    const studentPrefsArrays = enrolledEmails.map((email) => {
      const p = state.studentPreferences.find(
        (sp) => sp.studentEmail.toLowerCase() === email.toLowerCase() && sp.courseId === courseId
      );
      return p?.timeRanges ?? [];
    });
    return computeBestTimesAlgo(course.name, courseId, profRanges, studentPrefsArrays);
  }
}

import { createRemoteDataStore } from "./remoteDatastore";

export function createDataStore(): DataStore {
  if (appConfig.appsScriptUrl) {
    return createRemoteDataStore();
  }
  return new LocalDataStore();
}
