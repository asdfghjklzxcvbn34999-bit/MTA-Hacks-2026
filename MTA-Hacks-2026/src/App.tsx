import { FormEvent, useEffect, useMemo, useState } from "react";
import { appConfig } from "./config";
import { addDays, prettyDate, toIso } from "./lib/time";
import { getSessionUser, signInWithPerson, signOut, updateSession } from "./services/auth";
import { createDataStore } from "./services/datastore";
import { createNotificationSender } from "./services/notifications";
import type {
  Announcement,
  Booking,
  ClassMembership,
  OfficeHoursConfig,
  OfficeHoursPoll,
  PollResponse,
  PollType,
  SessionUser,
  Slot,
  SuggestedConfig
} from "./types";

const dataStore = createDataStore();
const notifier = createNotificationSender(appConfig.appsScriptUrl);

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 11)}`;
}

export default function App() {
  const [session, setSession] = useState<SessionUser | null>(() => getSessionUser());
  const [classes, setClasses] = useState<ClassMembership[]>([]);
  const [activeClassId, setActiveClassId] = useState<string>("");
  const [polls, setPolls] = useState<OfficeHoursPoll[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");

  const activeClass = useMemo(
    () => classes.find((item) => item.classId === activeClassId) ?? null,
    [classes, activeClassId]
  );

  async function loadCoreData(user: SessionUser): Promise<void> {
    try {
      let effectiveUser = user;
      if (user.myCourses.length === 0) {
        const person = await dataStore.getPersonByEmail(user.email);
        if (person && person.courseIds.length > 0) {
          const refreshed = updateSession({ myCourses: person.courseIds });
          if (refreshed) effectiveUser = refreshed;
          setSession(effectiveUser);
        }
      }
      if (effectiveUser.role === "teacher") {
        const classMemberships = await dataStore.getClassesByIds(effectiveUser.myCourses);
        setClasses(classMemberships);
        if (classMemberships.length > 0) {
          const classId = classMemberships[0].classId;
          setActiveClassId(classId);
          const [pollList, slotList, bookingList] = await Promise.all([
            dataStore.listPolls(classId),
            dataStore.listSlots(classId),
            dataStore.listBookings(classId)
          ]);
          setPolls(pollList);
          setSlots(slotList);
          setBookings(bookingList);
        }
      } else {
        const pollList = await dataStore.listPollsForStudent(effectiveUser.myCourses);
        setPolls(pollList);
        setClasses(await dataStore.getClassesByIds(effectiveUser.myCourses));
        if (effectiveUser.myCourses.length > 0) {
          setActiveClassId(effectiveUser.myCourses[0]);
          const [slotList, bookingList] = await Promise.all([
            dataStore.listSlots(effectiveUser.myCourses[0]),
            dataStore.listBookings(effectiveUser.myCourses[0])
          ]);
          setSlots(slotList);
          setBookings(bookingList);
        }
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to load class data.";
      setError(message);
    }
  }

  useEffect(() => {
    if (!session) {
      return;
    }
    void loadCoreData(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session || !activeClassId) {
      return;
    }
    if (session.role === "teacher") {
      void (async () => {
        const [pollList, slotList, bookingList] = await Promise.all([
          dataStore.listPolls(activeClassId),
          dataStore.listSlots(activeClassId),
          dataStore.listBookings(activeClassId)
        ]);
        setPolls(pollList);
        setSlots(slotList);
        setBookings(bookingList);
      })();
    } else {
      void (async () => {
        const [slotList, bookingList] = await Promise.all([
          dataStore.listSlots(activeClassId),
          dataStore.listBookings(activeClassId)
        ]);
        setSlots(slotList);
        setBookings(bookingList);
      })();
    }
  }, [session, activeClassId]);

  function resetMessage(): void {
    setStatus("");
    setError("");
  }

  function handleSignOut(): void {
    signOut();
    setSession(null);
    setClasses([]);
    setPolls([]);
    setSlots([]);
    setBookings([]);
    setActiveClassId("");
  }

  async function handleCreatePoll(form: FormData): Promise<void> {
    if (!session || !activeClass) {
      return;
    }
    resetMessage();
    const pollType = (form.get("pollType") as PollType) ?? "office_hours";
    const title = String(form.get("title") ?? "").trim();
    const slotMinutes = Number(form.get("slotMinutes") ?? 30);
    const daysPerWeek = Number(form.get("daysPerWeek") ?? 1);
    const optionRows = String(form.get("options") ?? "")
      .split("\n")
      .map((line: string) => line.trim())
      .filter(Boolean);
    const options = optionRows.map((line: string) => {
      const [day, hours] = line.split(":");
      const [startHour, endHour] = (hours ?? "").split("-").map((part: string) => part.trim());
      return { day: day.trim(), startHour, endHour };
    });
    const poll: OfficeHoursPoll = {
      pollId: makeId("poll"),
      classId: activeClass.classId,
      teacherEmail: session.email,
      pollType,
      title,
      slotMinutes,
      daysPerWeek,
      closesAtIso: toIso(addDays(new Date(), 7)),
      options
    };
    try {
      await dataStore.createPoll(poll);
      setPolls((previous) => [poll, ...previous]);
      setStatus("Poll created. It will close one week from now.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to create poll.";
      setError(message);
    }
  }

  async function handleSubmitResponse(poll: OfficeHoursPoll, selectedKeys: string[]): Promise<void> {
    if (!session) {
      return;
    }
    resetMessage();
    const response: PollResponse = {
      responseId: makeId("resp"),
      pollId: poll.pollId,
      classId: poll.classId,
      studentEmail: session.email,
      selectedOptionKeys: selectedKeys,
      submittedAtIso: toIso(new Date())
    };
    try {
      await dataStore.savePollResponse(response);
      setStatus("Poll response saved.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to save response.";
      setError(message);
    }
  }

  async function handleBuildConfig(poll: OfficeHoursPoll): Promise<void> {
    if (!activeClass) {
      return;
    }
    resetMessage();
    try {
      const top = await dataStore.suggestTopConfigs(poll.pollId);
      if (top.length === 0) {
        setError("No responses yet. Top configurations cannot be generated.");
        return;
      }
      const chosen = top[0];
      const config: OfficeHoursConfig = {
        configId: makeId("cfg"),
        classId: poll.classId,
        pollId: poll.pollId,
        chosenByTeacher: false,
        summary: chosen.summary,
        slotMinutes: poll.slotMinutes,
        sessions: chosen.summary.split(",").map((segment) => {
          const [day, hours] = segment.trim().split(":");
          const [startHour, endHour] = (hours ?? "").split("-");
          return {
            day: day.trim(),
            startHour: (startHour ?? "13:00").trim(),
            endHour: (endHour ?? "14:00").trim()
          };
        })
      };
      await dataStore.saveOfficeHoursConfig(config);
      const nextSlots = await dataStore.listSlots(activeClass.classId);
      setSlots(nextSlots);
      const lines = top.map((item) => `#${item.rank}: ${item.summary} (${item.estimatedCoverage} votes)`);
      setStatus(`Top two configurations:\n${lines.join("\n")}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to suggest configurations.";
      setError(message);
    }
  }

  async function handleBookSlot(slotId: string): Promise<void> {
    if (!session || !activeClass) {
      return;
    }
    resetMessage();
    const booking: Booking = {
      bookingId: makeId("book"),
      classId: activeClass.classId,
      slotId,
      studentEmail: session.email,
      createdAtIso: toIso(new Date())
    };
    try {
      await dataStore.createBooking(booking);
      const bookingList = await dataStore.listBookings(activeClass.classId);
      setBookings(bookingList);
      setStatus("Slot booked.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to book slot.";
      setError(message);
    }
  }

  async function handleAnnouncement(form: FormData): Promise<void> {
    if (!session) {
      return;
    }
    const classId = String(form.get("classId") ?? activeClassId).trim();
    const targetClass = classes.find((c) => c.classId === classId);
    if (!targetClass) {
      setError("Please select a course.");
      return;
    }
    resetMessage();
    const subject = String(form.get("subject") ?? "").trim();
    const body = String(form.get("body") ?? "").trim();
    const announcement: Announcement = {
      announcementId: makeId("ann"),
      classId: targetClass.classId,
      teacherEmail: session.email,
      subject,
      body,
      createdAtIso: toIso(new Date())
    };
    try {
      await dataStore.saveAnnouncement(announcement);
      await notifier.sendAnnouncement({
        recipients: [], // Apps Script should resolve recipients from class roster.
        subject,
        body
      });
      setStatus("Announcement saved and email request sent.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to send announcement.";
      setError(message);
    }
  }

  if (!session) {
    return <SignInScreen onSignedIn={setSession} />;
  }

  return (
    <main className="page">
      <header className="header">
        <div>
          <h1>{appConfig.appName}</h1>
          <p className="muted">
            Signed in as {session.name} ({session.email}) - {session.role}
          </p>
        </div>
        <button className="secondary" onClick={handleSignOut}>
          Sign out
        </button>
      </header>

      {classes.length > 0 && (
        <section className="card">
          <label>
            {session.role === "teacher" ? "Active course" : "Course (for booking slots)"}
            <select value={activeClassId} onChange={(event) => setActiveClassId(event.target.value)}>
              {classes.map((item) => (
                <option key={item.classId} value={item.classId}>
                  {item.className} ({item.classId})
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {status && <pre className="status ok">{status}</pre>}
      {error && <pre className="status error">{error}</pre>}

      {session.role === "teacher" ? (
        <>
          <TeacherPollCard onCreatePoll={handleCreatePoll} />
          <TeacherReviewCard polls={polls} onSuggest={handleBuildConfig} />
          <TeacherAnnouncementCard classes={classes} activeClassId={activeClassId} onSubmit={handleAnnouncement} />
        </>
      ) : (
        <>
          <StudentPollCard polls={polls} classes={classes} onSubmit={handleSubmitResponse} />
          <StudentBookingCard slots={slots} bookings={bookings} onBook={handleBookSlot} />
        </>
      )}
    </main>
  );
}

function SignInScreen({ onSignedIn }: { onSignedIn: (user: SessionUser) => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const person = await dataStore.getPersonByEmail(email);
      if (!person) {
        setError("Account not found. Use a registered @mta.ca or @umoncton.ca email.");
        setLoading(false);
        return;
      }
      const user = signInWithPerson(person);
      onSignedIn(user);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Sign in failed.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page center">
      <form className="card form" onSubmit={handleSubmit}>
        <h1>School Sign In</h1>
        <p className="muted">
          Only {appConfig.allowedDomains.map((item: string) => `@${item}`).join(" / ")} accounts are allowed.
        </p>
        <label>
          School email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={loading}
            placeholder="you@mta.ca or you@umoncton.ca"
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Checking…" : "Continue"}
        </button>
        {error && <p className="error-text">{error}</p>}
      </form>
    </main>
  );
}

function TeacherPollCard({ onCreatePoll }: { onCreatePoll: (form: FormData) => Promise<void> }) {
  return (
    <section className="card">
      <h2>Create poll</h2>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          void onCreatePoll(new FormData(event.currentTarget));
          event.currentTarget.reset();
        }}
      >
        <label>
          Poll type
          <select name="pollType" defaultValue="office_hours">
            <option value="office_hours">Office hours</option>
            <option value="general">General</option>
          </select>
        </label>
        <label>
          Poll title
          <input required name="title" placeholder="Week 5 Office Hours Availability" />
        </label>
        <div className="row">
          <label>
            Slot length (minutes)
            <input required type="number" min={10} max={120} defaultValue={30} name="slotMinutes" />
          </label>
          <label>
            Days per week to offer
            <input required type="number" min={1} max={7} defaultValue={2} name="daysPerWeek" />
          </label>
        </div>
        <label>
          Options (one per line, format `Mon: 13:00-15:00`)
          <textarea
            required
            name="options"
            rows={5}
            defaultValue={"Mon: 13:00-15:00\nTue: 10:00-12:00\nThu: 14:00-16:00"}
          />
        </label>
        <button type="submit">Create poll</button>
      </form>
    </section>
  );
}

function TeacherReviewCard({
  polls,
  onSuggest
}: {
  polls: OfficeHoursPoll[];
  onSuggest: (poll: OfficeHoursPoll) => Promise<void>;
}) {
  return (
    <section className="card">
      <h2>Poll review and top two suggestions</h2>
      {polls.length === 0 && <p className="muted">No polls yet.</p>}
      <ul className="list">
        {polls.map((poll) => (
          <li key={poll.pollId}>
            <div>
              <strong>{poll.title}</strong>
              <p className="muted">
                {poll.pollType === "office_hours" ? "Office hours" : "General"} · Closes:{" "}
                {prettyDate(poll.closesAtIso)}
              </p>
            </div>
            {poll.pollType === "office_hours" && (
              <button onClick={() => void onSuggest(poll)}>Compute top two</button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StudentPollCard({
  polls,
  classes,
  onSubmit
}: {
  polls: OfficeHoursPoll[];
  classes: ClassMembership[];
  onSubmit: (poll: OfficeHoursPoll, selectedKeys: string[]) => Promise<void>;
}) {
  const [selectedMap, setSelectedMap] = useState<Record<string, string[]>>({});
  const classByName = useMemo(
    () => new Map(classes.map((c) => [c.classId, c.className])),
    [classes]
  );

  return (
    <section className="card">
      <h2>Polls for your courses</h2>
      {polls.length === 0 && <p className="muted">No active polls yet.</p>}
      {polls.map((poll) => (
        <form
          key={poll.pollId}
          className="form poll"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit(poll, selectedMap[poll.pollId] ?? []);
          }}
        >
          <h3>{poll.title}</h3>
          <p className="muted">
            {classByName.get(poll.classId) ?? poll.classId} ·{" "}
            {poll.pollType === "office_hours" ? "Office hours" : "General"} · Slot length:{" "}
            {poll.slotMinutes} minutes
          </p>
          {poll.options.map((option) => {
            const key = `${option.day}: ${option.startHour}-${option.endHour}`;
            const selected = selectedMap[poll.pollId]?.includes(key) ?? false;
            return (
              <label key={key} className="checkbox">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(event) => {
                    setSelectedMap((previous) => {
                      const current = new Set(previous[poll.pollId] ?? []);
                      if (event.target.checked) {
                        current.add(key);
                      } else {
                        current.delete(key);
                      }
                      return { ...previous, [poll.pollId]: Array.from(current) };
                    });
                  }}
                />
                {key}
              </label>
            );
          })}
          <button type="submit">Submit response</button>
        </form>
      ))}
    </section>
  );
}

function StudentBookingCard({
  slots,
  bookings,
  onBook
}: {
  slots: Slot[];
  bookings: Booking[];
  onBook: (slotId: string) => Promise<void>;
}) {
  const bookingBySlot = useMemo(
    () =>
      bookings.reduce<Record<string, number>>((acc, booking) => {
        acc[booking.slotId] = (acc[booking.slotId] ?? 0) + 1;
        return acc;
      }, {}),
    [bookings]
  );

  return (
    <section className="card">
      <h2>Book office-hours slots</h2>
      {slots.length === 0 && <p className="muted">No bookable slots yet.</p>}
      <ul className="list">
        {slots.map((slot) => {
          const used = bookingBySlot[slot.slotId] ?? 0;
          const full = used >= slot.capacity;
          return (
            <li key={slot.slotId}>
              <div>
                <strong>{prettyDate(slot.startsAtIso)}</strong>
                <p className="muted">
                  Ends {prettyDate(slot.endsAtIso)} - {used}/{slot.capacity} booked
                </p>
              </div>
              <button disabled={full} onClick={() => void onBook(slot.slotId)}>
                {full ? "Full" : "Pick slot"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TeacherAnnouncementCard({
  classes,
  activeClassId,
  onSubmit
}: {
  classes: ClassMembership[];
  activeClassId: string;
  onSubmit: (form: FormData) => Promise<void>;
}) {
  return (
    <section className="card">
      <h2>Send class announcement</h2>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit(new FormData(event.currentTarget));
          event.currentTarget.reset();
        }}
      >
        <label>
          Course
          <select name="classId" defaultValue={activeClassId} required>
            {classes.map((c) => (
              <option key={c.classId} value={c.classId}>
                {c.className} ({c.classId})
              </option>
            ))}
          </select>
        </label>
        <label>
          Subject
          <input name="subject" required placeholder="Office hours reminder" />
        </label>
        <label>
          Message
          <textarea name="body" required rows={4} placeholder="Remember to book your slot before Friday noon." />
        </label>
        <button type="submit">Send email announcement</button>
      </form>
    </section>
  );
}
