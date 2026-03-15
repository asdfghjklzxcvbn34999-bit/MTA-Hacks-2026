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
          onSetAllAvailability={async (ranges) => {
            resetMessage();
            try {
              for (const c of courses) {
                await dataStore.setAvailability(c.courseId, ranges);
              }
              setStatus("Availability saved.");
              void loadProfessorData();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to save availability.");
              throw e;
            }
          }}
        />
      ) : (
        <StudentView
          courses={courses}
          allCourses={allCourses}
          studentEmail={session.email}
          onEnrollMultiple={async (courseIds) => {
            resetMessage();
            let ok = 0;
            let lastError = "";
            for (const courseId of courseIds) {
              try {
                await dataStore.enroll(session.email, courseId);
                ok++;
              } catch (e) {
                lastError = e instanceof Error ? e.message : "Failed to enroll.";
              }
            }
            if (ok > 0) {
              setStatus(ok === courseIds.length ? "Enrolled successfully." : `Enrolled in ${ok} of ${courseIds.length} courses.${lastError ? ` ${lastError}` : ""}`);
              void loadStudentData();
            } else if (lastError) setError(lastError);
          }}
          onSaveAllPreferences={async (ranges) => {
            resetMessage();
            try {
              for (const c of courses) {
                await dataStore.setPreferences(session.email, c.courseId, ranges);
              }
              setStatus("Schedule saved.");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to save availability.");
              throw e;
            }
          }}
        />
      )}
    </main>
  );
}

function SignInScreen({ onSignedIn }: { onSignedIn: (u: SessionUser) => void }) {
  const [mode, setMode] = useState<"signin" | "create">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  function clearForm(): void {
    setErr("");
    setSuccess("");
    setEmail("");
    setPassword("");
    setName("");
  }

  function handleSwitchMode(): void {
    setMode((m) => (m === "signin" ? "create" : "signin"));
    clearForm();
  }

  async function handleSignIn(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setErr("");
    setSuccess("");
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

  async function handleCreateAccount(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setErr("");
    setSuccess("");
    setLoading(true);
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();
    const domain = trimmedEmail.split("@")[1] ?? "";
    if (!appConfig.allowedDomains.includes(domain.toLowerCase())) {
      setErr("Email must end with @mta.ca or @umoncton.ca.");
      setLoading(false);
      return;
    }
    if (!password) {
      setErr("Password is required.");
      setLoading(false);
      return;
    }
    if (!trimmedName) {
      setErr("Name is required.");
      setLoading(false);
      return;
    }
    try {
      await dataStore.createUser({
        email: trimmedEmail,
        password,
        name: trimmedName,
        role: "student"
      });
      setSuccess("Account created. You can now sign in.");
      setEmail("");
      setPassword("");
      setName("");
      setTimeout(() => {
        setMode("signin");
        setSuccess("");
      }, 2000);
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : "Failed to create account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page center">
      {mode === "signin" ? (
        <form className="card form" onSubmit={handleSignIn}>
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
          <p className="muted" style={{ marginTop: "1rem" }}>
            Don&apos;t have an account?{" "}
            <button type="button" className="link" onClick={handleSwitchMode}>
              Create student account
            </button>
          </p>
        </form>
      ) : (
        <form className="card form" onSubmit={handleCreateAccount}>
          <h1>Create Student Account</h1>
          <p className="muted">Email must be @mta.ca or @umoncton.ca.</p>
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
          <label>
            Name
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              placeholder="Your name"
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create account"}
          </button>
          {err && <p className="error-text">{err}</p>}
          {success && <p className="status ok">{success}</p>}
          <p className="muted" style={{ marginTop: "1rem" }}>
            Already have an account?{" "}
            <button type="button" className="link" onClick={handleSwitchMode}>
              Sign in
            </button>
          </p>
        </form>
      )}
    </main>
  );
}

function ProfessorView({
  courses,
  bestTimes,
  onCreateCourse,
  onSetAllAvailability
}: {
  courses: Course[];
  bestTimes: BestTimeResult[];
  onCreateCourse: (form: FormData) => Promise<void>;
  onSetAllAvailability: (ranges: TimeRange[]) => Promise<void>;
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
        <p className="muted">When are you willing to offer office hours? This applies to all your courses. Students will indicate when they can attend.</p>
        {courses.length === 0 ? (
          <p className="muted">Create a course first.</p>
        ) : (
          <ProfessorAvailabilityForm
            courses={courses}
            onSave={onSetAllAvailability}
          />
        )}
      </section>
    </>
  );
}

function ProfessorAvailabilityForm({
  courses,
  onSave
}: {
  courses: Course[];
  onSave: (ranges: TimeRange[]) => Promise<void>;
}) {
  const [ranges, setRanges] = useState<TimeRange[]>([]);
  const [savedMessage, setSavedMessage] = useState("");

  const firstCourseId = courses[0]?.courseId;
  useEffect(() => {
    let cancelled = false;
    if (firstCourseId) {
      createDataStore()
        .getAvailability(firstCourseId)
        .then((avail) => {
          if (!cancelled) setRanges(avail?.timeRanges ?? []);
        });
    } else {
      if (!cancelled) setRanges([]);
    }
    return () => {
      cancelled = true;
    };
  }, [firstCourseId]);

  function addRange(): void {
    setRanges((prev) => [...prev, { day: "Mon", startHour: "09:00", endHour: "10:00" }]);
    setSavedMessage("");
  }

  function updateRange(i: number, updates: Partial<TimeRange>): void {
    setRanges((prev) => prev.map((r, j) => (j === i ? { ...r, ...updates } : r)));
    setSavedMessage("");
  }

  function removeRange(i: number): void {
    setRanges((prev) => prev.filter((_, j) => j !== i));
    setSavedMessage("");
  }

  async function handleSave(): Promise<void> {
    try {
      await onSave(ranges);
      setSavedMessage("Submitted.");
      setTimeout(() => setSavedMessage(""), 3000);
    } catch {
      // Parent handles error
    }
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
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <button type="button" onClick={() => void handleSave()}>
          Save availability
        </button>
        {savedMessage && <span className="status ok" style={{ padding: "0.25rem 0.5rem" }}>{savedMessage}</span>}
      </div>
    </div>
  );
}

function StudentView({
  courses,
  allCourses,
  studentEmail,
  onEnrollMultiple,
  onSaveAllPreferences
}: {
  courses: Course[];
  allCourses: Course[];
  studentEmail: string;
  onEnrollMultiple: (courseIds: string[]) => Promise<void>;
  onSaveAllPreferences: (ranges: TimeRange[]) => Promise<void>;
}) {
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set());

  const notEnrolled = allCourses.filter(
    (c) => !courses.some((e) => e.courseId === c.courseId)
  );
  const atCap = courses.length >= 6;
  const canSelectMore = !atCap && selectedCourseIds.size + courses.length < 6;

  function toggleCourse(courseId: string): void {
    if (courses.some((c) => c.courseId === courseId)) return;
    if (selectedCourseIds.has(courseId)) {
      setSelectedCourseIds((s) => {
        const next = new Set(s);
        next.delete(courseId);
        return next;
      });
    } else if (canSelectMore) {
      setSelectedCourseIds((s) => new Set(s).add(courseId));
    }
  }

  function handleRegisterSelected(): void {
    const ids = Array.from(selectedCourseIds);
    if (ids.length === 0) return;
    void onEnrollMultiple(ids);
    setSelectedCourseIds(new Set());
  }

  return (
    <>
      <section className="card">
        <h2>Register for courses</h2>
        <p className="muted">Select up to 6 courses total. Courses appear here after professors create them.</p>
        <p className="muted">You are enrolled in {courses.length} of 6 courses.</p>
        {notEnrolled.length === 0 ? (
          <p className="muted">No courses available to register, or you are enrolled in all.</p>
        ) : atCap ? (
          <p className="muted">You have reached the maximum of 6 courses.</p>
        ) : (
          <>
            <ul className="list" style={{ listStyle: "none", paddingLeft: 0 }}>
              {notEnrolled.map((c) => (
                <li key={c.courseId} style={{ marginBottom: "0.5rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={selectedCourseIds.has(c.courseId)}
                      onChange={() => toggleCourse(c.courseId)}
                      disabled={!canSelectMore && !selectedCourseIds.has(c.courseId)}
                    />
                    <span>
                      {c.name} ({c.term}) – {c.teacherEmail}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              disabled={selectedCourseIds.size === 0}
              onClick={handleRegisterSelected}
            >
              Register selected
            </button>
          </>
        )}
      </section>

      <section className="card">
        <h2>When I&apos;m available for office hours</h2>
        <p className="muted">Enter your availability once. It will be applied to all your enrolled courses.</p>
        {courses.length === 0 ? (
          <p className="muted">Register for a course first.</p>
        ) : (
          <StudentSingleScheduleForm
            studentEmail={studentEmail}
            enrolledCourses={courses}
            onSave={onSaveAllPreferences}
          />
        )}
      </section>
    </>
  );
}

function StudentSingleScheduleForm({
  studentEmail,
  enrolledCourses,
  onSave
}: {
  studentEmail: string;
  enrolledCourses: Course[];
  onSave: (ranges: TimeRange[]) => Promise<void>;
}) {
  const [ranges, setRanges] = useState<TimeRange[]>([]);
  const [savedMessage, setSavedMessage] = useState("");

  const firstCourseId = enrolledCourses[0]?.courseId;
  useEffect(() => {
    let cancelled = false;
    if (firstCourseId) {
      createDataStore()
        .getPreferences(studentEmail, firstCourseId)
        .then((prefs) => {
          if (!cancelled) setRanges(prefs ?? []);
        });
    } else {
      if (!cancelled) setRanges([]);
    }
    return () => {
      cancelled = true;
    };
  }, [studentEmail, firstCourseId]);

  function addRange(): void {
    setRanges((prev) => [...prev, { day: "Mon", startHour: "09:00", endHour: "10:00" }]);
    setSavedMessage("");
  }

  function updateRange(i: number, updates: Partial<TimeRange>): void {
    setRanges((prev) => prev.map((r, j) => (j === i ? { ...r, ...updates } : r)));
    setSavedMessage("");
  }

  function removeRange(i: number): void {
    setRanges((prev) => prev.filter((_, j) => j !== i));
    setSavedMessage("");
  }

  async function handleSave(): Promise<void> {
    try {
      await onSave(ranges);
      setSavedMessage("Submitted.");
      setTimeout(() => setSavedMessage(""), 3000);
    } catch {
      // Parent handles error
    }
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
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <button type="button" onClick={() => void handleSave()}>
          Save my schedule
        </button>
        {savedMessage && <span className="status ok" style={{ padding: "0.25rem 0.5rem" }}>{savedMessage}</span>}
      </div>
    </div>
  );
}
