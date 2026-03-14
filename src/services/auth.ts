import { isAllowedSchoolEmail } from "../lib/domain";
import type { Person, SessionUser } from "../types";

const SESSION_KEY = "office-hours-session-v2";

export function getSessionUser(): SessionUser | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }
  const parsed = JSON.parse(raw) as SessionUser;
  if (!parsed.myCourses) {
    parsed.myCourses = [];
  }
  return parsed;
}

export function signOut(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function signInWithPerson(person: Person): SessionUser {
  if (!isAllowedSchoolEmail(person.email)) {
    throw new Error("Only @mta.ca and @umoncton.ca emails are allowed.");
  }
  const user: SessionUser = {
    email: person.email.trim().toLowerCase(),
    role: person.role,
    name: person.name.trim() || person.email.split("@")[0],
    myCourses: person.courseIds ?? []
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
}

export function updateSession(updates: Partial<SessionUser>): SessionUser | null {
  const current = getSessionUser();
  if (!current) return null;
  const updated = { ...current, ...updates };
  localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
  return updated;
}
