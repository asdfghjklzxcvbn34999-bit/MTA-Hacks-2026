import { FormEvent, useEffect, useState } from "react";
import { appConfig } from "./config";
import { getSessionUser, signIn, signOut } from "./services/auth";
import { createDataStore } from "./services/datastore";
import type {
  BestTimeResult,
  Course,
  SessionUser,
  TimeRange
} from "./types";

const dataStore = createDataStore();

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 11)}`;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function App() {
  const [session, setSession] = useState<SessionUser | null>(() => getSessionUser());
  const [courses, setCourses] = useState<Course[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [activeCourseId, setActiveCourseId] = useState<string>("");
  const [bestTimes, setBestTimes] = useState<BestTimeResult[]>([]);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");

  function resetMessage(): void {
    setStatus("");
    setError("");
  }

  function handleSignOut(): void {
    signOut();
    setSession(null);
    setCourses([]);
    setAllCourses([]);
    setActiveCourseId("");
  }

  async function loadProfessorData(): Promise<void> {
    if (!session || session.role !== "teacher") return;
    const myCourses = await dataStore.listCoursesByTeacher(session.email);
    setCourses(myCourses);
    if (myCourses.length > 0 && !activeCourseId) {
      setActiveCourseId(myCourses[0].courseId);
    }
    const results: BestTimeResult[] = [];
    for (const c of myCourses) {
      const bt = await dataStore.computeBestTimes(c.courseId);
      if (bt) results.push(bt);
    }
    setBestTimes(results);
  }

  async function loadStudentData(): Promise<void> {
    if (!session || session.role !== "student") return;
    const enrolled = await dataStore.listEnrollmentsForStudent(session.email);
    setCourses(enrolled);
    const all = await dataStore.listAllCourses();
    setAllCourses(all);
    if (enrolled.length > 0 && !activeCourseId) {
      setActiveCourseId(enrolled[0].courseId);
    }
  }

  useEffect(() => {
    if (!session) return;
    if (session.role === "teacher") {
      void loadProfessorData();
    } else {
      void loadStudentData();
    }
  }, [session?.email]);

  useEffect(() => {
    if (!session || session.role !== "teacher") return;
    void loadProfessorData();
  }, [activeCourseId]);

  const refreshBestTimes = () => {
    if (session?.role === "teacher") void loadProfessorData();
  };

  useEffect(() => {
    if (!session || session.role !== "teacher") return;
    const interval = setInterval(refreshBestTimes, 5000);
    return () => clearInterval(interval);
  }, [session?.email, session?.role]);

  if (!session) {
    return <SignInScreen onSignedIn={setSession} />;
  }

  return (
    <main className="page">
      <header className="header">
        <div>
          <h1>{appConfig.appName}</h1>
          <p className="muted">
            Signed in as {session.name} ({session.email}) – {session.role}
          </p>
        </div>
        <button className="secondary" onClick={handleSignOut}>
          Sign out
        </button>
      </header>

      {status && <pre className="status ok">{status}</pre>}
      {error && <pre className="status error">{error}</pre>}

      {session.role === "teacher" ? (
        <ProfessorView
          courses={courses}
          activeCourseId={activeCourseId}
          setActiveCourseId={setActiveCourseId}
          bestTimes={bestTimes}
          onCreateCourse={async (form) => {
            resetMessage();
            const name = String(form.get("courseName") ?? "").trim();
            const term = String(form.get("term") ?? "Spring 2026").trim();
            const course: Course = {
              courseId: makeId("course"),
              name,
              teacherEmail: session.email,
              term
            };
            try {
              await dataStore.createCourse(course);
              setCourses((prev) => [course, ...prev]);
              setStatus("Course created.");
              void loadProfessorData();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to create course.");
            }
          }}
          onSetAvailability={async (courseId, ranges) => {
            resetMessage();
            try {
              await dataStore.setAvailability(courseId, ranges);
              setStatus("Availability saved.");
              void loadProfessorData();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to save availability.");
            }
          }}
        />
      ) : (
        <StudentView
          courses={courses}
          allCourses={allCourses}
          activeCourseId={activeCourseId}
          setActiveCourseId={setActiveCourseId}
          studentEmail={session.email}
          onEnroll={async (courseId) => {
            resetMessage();
            try {
              await dataStore.enroll(session.email, courseId);
              setStatus("Enrolled successfully.");
              void loadStudentData();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to enroll.");
            }
          }}
          onSavePreferences={async (courseId, ranges) => {
            resetMessage();
            try {
              await dataStore.setPreferences(session.email, courseId, ranges);
              setStatus("Availability saved.");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to save availability.");
            }
          }}
        />
      )}
    </main>
  );
}

function SignInScreen({ onSignedIn }: { onSignedIn: (u: SessionUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const user = await dataStore.validateLogin(email, password);
      if (!user) {
        setErr("Invalid email or password.");
        setLoading(false);
        return;
      }
      signIn(user);
      onSignedIn(user);
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page center">
      <form className="card form" onSubmit={handleSubmit}>
        <h1>Sign In</h1>
        <p className="muted">
          Use email and password. Demo: teacher@mta.ca / password, student@mta.ca / password
        </p>
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            placeholder="you@mta.ca"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            placeholder="••••••••"
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        {err && <p className="error-text">{err}</p>}
      </form>
    </main>
  );
}

function ProfessorView({
  courses,
  activeCourseId,
  setActiveCourseId,
  bestTimes,
  onCreateCourse,
  onSetAvailability
}: {
  courses: Course[];
  activeCourseId: string;
  setActiveCourseId: (id: string) => void;
  bestTimes: BestTimeResult[];
  onCreateCourse: (form: FormData) => Promise<void>;
  onSetAvailability: (courseId: string, ranges: TimeRange[]) => Promise<void>;
}) {
  return (
    <>
      <section className="card">
        <h2>Create course</h2>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void onCreateCourse(new FormData(e.currentTarget));
            e.currentTarget.reset();
          }}
        >
          <label>
            Course name
            <input name="courseName" required placeholder="COMP 101" />
          </label>
          <label>
            Term
            <input name="term" defaultValue="Spring 2026" placeholder="Spring 2026" />
          </label>
          <button type="submit">Create course</button>
        </form>
      </section>

      <section className="card">
        <h2>Current best office hours</h2>
        <p className="muted">Updates automatically as students set their availability.</p>
        {bestTimes.length === 0 ? (
          <p className="muted">Create a course and set your availability to see results.</p>
        ) : (
          <ul className="list">
            {bestTimes.map((bt) => (
              <li key={bt.courseId}>
                <strong>{bt.courseName}</strong>
                {bt.bestSlots.length === 0 ? (
                  <p className="muted">No overlapping times yet. Set your availability and ask students to add theirs.</p>
                ) : (
                  <ul>
                    {bt.bestSlots.map((s) => (
                      <li key={`${bt.courseId}-${s.day}`}>
                        {s.day}: {s.startHour}–{s.endHour}
                        {s.studentCount != null && ` (${s.studentCount} students)`}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Set your availability</h2>
        <p className="muted">When are you willing to offer office hours? Students will indicate when they can attend.</p>
        {courses.length === 0 ? (
          <p className="muted">Create a course first.</p>
        ) : (
          <>
            <label>
              Course
              <select
                value={activeCourseId}
                onChange={(e) => setActiveCourseId(e.target.value)}
              >
                {courses.map((c) => (
                  <option key={c.courseId} value={c.courseId}>
                    {c.name} ({c.term})
                  </option>
                ))}
              </select>
            </label>
            <ProfessorAvailabilityForm
              courseId={activeCourseId}
              onSave={onSetAvailability}
            />
          </>
        )}
      </section>
    </>
  );
}

function ProfessorAvailabilityForm({
  courseId,
  onSave
}: {
  courseId: string;
  onSave: (courseId: string, ranges: TimeRange[]) => Promise<void>;
}) {
  const [ranges, setRanges] = useState<TimeRange[]>([]);

  useEffect(() => {
    let cancelled = false;
    createDataStore()
      .getAvailability(courseId)
      .then((avail) => {
        if (!cancelled) setRanges(avail?.timeRanges ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  function addRange(): void {
    setRanges((prev) => [...prev, { day: "Mon", startHour: "09:00", endHour: "10:00" }]);
  }

  function updateRange(i: number, updates: Partial<TimeRange>): void {
    setRanges((prev) => prev.map((r, j) => (j === i ? { ...r, ...updates } : r)));
  }

  function removeRange(i: number): void {
    setRanges((prev) => prev.filter((_, j) => j !== i));
  }

  return (
    <div className="form">
      {ranges.map((r, i) => (
        <div key={i} className="row" style={{ alignItems: "flex-end", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <label>
            Day
            <select
              value={r.day}
              onChange={(e) => updateRange(i, { day: e.target.value })}
            >
              {DAYS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label>
            Start
            <input
              type="time"
              value={r.startHour}
              onChange={(e) => updateRange(i, { startHour: e.target.value })}
            />
          </label>
          <label>
            End
            <input
              type="time"
              value={r.endHour}
              onChange={(e) => updateRange(i, { endHour: e.target.value })}
            />
          </label>
          <button type="button" className="secondary" onClick={() => removeRange(i)}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="secondary" onClick={addRange}>
        Add time range
      </button>
      <button
        type="button"
        onClick={() => void onSave(courseId, ranges)}
      >
        Save availability
      </button>
    </div>
  );
}

function StudentView({
  courses,
  allCourses,
  activeCourseId,
  setActiveCourseId,
  studentEmail,
  onEnroll,
  onSavePreferences
}: {
  courses: Course[];
  allCourses: Course[];
  activeCourseId: string;
  setActiveCourseId: (id: string) => void;
  studentEmail: string;
  onEnroll: (courseId: string) => Promise<void>;
  onSavePreferences: (courseId: string, ranges: TimeRange[]) => Promise<void>;
}) {
  const [enrollCourseId, setEnrollCourseId] = useState("");

  const notEnrolled = allCourses.filter(
    (c) => !courses.some((e) => e.courseId === c.courseId)
  );

  return (
    <>
      <section className="card">
        <h2>Register for courses</h2>
        <p className="muted">Courses appear here after professors create them.</p>
        {notEnrolled.length === 0 ? (
          <p className="muted">No courses available to register, or you are enrolled in all.</p>
        ) : (
          <div className="row" style={{ alignItems: "flex-end", gap: "0.5rem" }}>
            <label>
              Course
              <select
                value={enrollCourseId}
                onChange={(e) => setEnrollCourseId(e.target.value)}
              >
                <option value="">Select a course</option>
                {notEnrolled.map((c) => (
                  <option key={c.courseId} value={c.courseId}>
                    {c.name} ({c.term}) – {c.teacherEmail}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={!enrollCourseId}
              onClick={() => void onEnroll(enrollCourseId)}
            >
              Register
            </button>
          </div>
        )}
      </section>

      <section className="card">
        <h2>When I&apos;m available for office hours</h2>
        <p className="muted">Indicate which times work for you per course. This helps your professor choose the best office hours.</p>
        {courses.length === 0 ? (
          <p className="muted">Register for a course first.</p>
        ) : (
          <>
            <label>
              Course
              <select
                value={activeCourseId}
                onChange={(e) => setActiveCourseId(e.target.value)}
              >
                {courses.map((c) => (
                  <option key={c.courseId} value={c.courseId}>
                    {c.name} ({c.term})
                  </option>
                ))}
              </select>
            </label>
            <StudentSchedulerForm
              courseId={activeCourseId}
              studentEmail={studentEmail}
              onSave={onSavePreferences}
            />
          </>
        )}
      </section>
    </>
  );
}

function StudentSchedulerForm({
  courseId,
  studentEmail,
  onSave
}: {
  courseId: string;
  studentEmail: string;
  onSave: (courseId: string, ranges: TimeRange[]) => Promise<void>;
}) {
  const [ranges, setRanges] = useState<TimeRange[]>([]);

  useEffect(() => {
    let cancelled = false;
    createDataStore()
      .getPreferences(studentEmail, courseId)
      .then((prefs) => {
        if (!cancelled) setRanges(prefs ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, studentEmail]);

  function addRange(): void {
    setRanges((prev) => [...prev, { day: "Mon", startHour: "09:00", endHour: "10:00" }]);
  }

  function updateRange(i: number, updates: Partial<TimeRange>): void {
    setRanges((prev) => prev.map((r, j) => (j === i ? { ...r, ...updates } : r)));
  }

  function removeRange(i: number): void {
    setRanges((prev) => prev.filter((_, j) => j !== i));
  }

  return (
    <div className="form">
      {ranges.map((r, i) => (
        <div key={i} className="row" style={{ alignItems: "flex-end", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <label>
            Day
            <select
              value={r.day}
              onChange={(e) => updateRange(i, { day: e.target.value })}
            >
              {DAYS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label>
            Start
            <input
              type="time"
              value={r.startHour}
              onChange={(e) => updateRange(i, { startHour: e.target.value })}
            />
          </label>
          <label>
            End
            <input
              type="time"
              value={r.endHour}
              onChange={(e) => updateRange(i, { endHour: e.target.value })}
            />
          </label>
          <button type="button" className="secondary" onClick={() => removeRange(i)}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="secondary" onClick={addRange}>
        Add time range
      </button>
      <button
        type="button"
        onClick={() => void onSave(courseId, ranges)}
      >
        Save my availability
      </button>
    </div>
  );
}
