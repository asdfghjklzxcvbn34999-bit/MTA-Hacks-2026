import { appConfig } from "../config";
import type {
  BestTimeResult,
  Course,
  ProfessorAvailability,
  SessionUser,
  TimeRange,
  User
} from "../types";
import type { DataStore } from "./datastore";

async function callAction<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const url = appConfig.appsScriptUrl;
  if (!url) throw new Error("VITE_APPS_SCRIPT_URL is not configured");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  const data = (await res.json()) as T;
  return data;
}

class RemoteDataStore implements DataStore {
  async validateLogin(email: string, password: string): Promise<SessionUser | null> {
    return callAction<SessionUser | null>("validateLogin", { email, password });
  }

  async createUser(user: User): Promise<void> {
    await callAction("createUser", { user });
  }

  async listCoursesByTeacher(teacherEmail: string): Promise<Course[]> {
    return callAction<Course[]>("listCoursesByTeacher", { teacherEmail });
  }

  async listAllCourses(): Promise<Course[]> {
    return callAction<Course[]>("listAllCourses");
  }

  async createCourse(course: Course): Promise<void> {
    await callAction("createCourse", { course });
  }

  async getAvailability(courseId: string): Promise<ProfessorAvailability | null> {
    return callAction<ProfessorAvailability | null>("getAvailability", { courseId });
  }

  async setAvailability(courseId: string, timeRanges: TimeRange[]): Promise<void> {
    await callAction("setAvailability", { courseId, timeRanges });
  }

  async listEnrollmentsForCourse(courseId: string): Promise<string[]> {
    return callAction<string[]>("listEnrollmentsForCourse", { courseId });
  }

  async listEnrollmentsForStudent(studentEmail: string): Promise<Course[]> {
    return callAction<Course[]>("listEnrollmentsForStudent", { studentEmail });
  }

  async enroll(studentEmail: string, courseId: string): Promise<void> {
    await callAction("enroll", { studentEmail, courseId });
  }

  async getPreferences(studentEmail: string, courseId: string): Promise<TimeRange[]> {
    return callAction<TimeRange[]>("getPreferences", { studentEmail, courseId });
  }

  async setPreferences(
    studentEmail: string,
    courseId: string,
    timeRanges: TimeRange[]
  ): Promise<void> {
    await callAction("setPreferences", { studentEmail, courseId, timeRanges });
  }

  async computeBestTimes(courseId: string): Promise<BestTimeResult | null> {
    return callAction<BestTimeResult | null>("computeBestTimes", { courseId });
  }
}

export function createRemoteDataStore(): DataStore {
  return new RemoteDataStore();
}
