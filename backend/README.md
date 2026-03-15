# Office Hours Planner - Google Apps Script Backend

Backend for the Office Hours Planner web app. Uses Google Sheets as the data store and Google Apps Script as the API layer. No email sending (announcements are persisted only).

## Prerequisites

- Google account
- Access to [script.google.com](https://script.google.com)

## 1. Create the Google Sheet Workbook

Create a new Google Sheet and add the following sheets (tabs) with these exact column headers in row 1:

| Sheet | Headers (row 1) |
|-------|-----------------|
| **People** | `email`, `name`, `role`, `password`, `course1`, `course2`, `course3`, `course4` |
| **Classes** | `classId`, `className`, `teacherEmail`, `term`, `createdAt` |
| **Roster** | `classId`, `studentEmail`, `addedAt` |
| **ProfessorAvailability** | `courseId`, `timeRangesJson` |
| **StudentPreferences** | `studentEmail`, `courseId`, `timeRangesJson` |
| **Polls** | `pollId`, `classId`, `teacherEmail`, `pollType`, `title`, `slotMinutes`, `daysPerWeek`, `closesAtIso`, `optionsJson`, `createdAt` |
| **PollResponses** | `responseId`, `pollId`, `classId`, `studentEmail`, `selectedOptionKeysJson`, `submittedAtIso` |
| **OfficeHoursConfigs** | `configId`, `classId`, `pollId`, `summary`, `slotMinutes`, `sessionsJson`, `chosenByTeacher`, `createdAt` |
| **Slots** | `slotId`, `classId`, `startsAtIso`, `endsAtIso`, `capacity`, `createdAt` |
| **Bookings** | `bookingId`, `classId`, `slotId`, `studentEmail`, `createdAtIso` |
| **Announcements** | `announcementId`, `classId`, `teacherEmail`, `subject`, `body`, `createdAtIso` |
| **PollResults** | `pollId`, `rank`, `summary`, `estimatedCoverage`, `computedAt` |

### Seed data (optional)

Add at least one row to **People** so users can sign in (include `password` for frontend auth):

| email | name | role | password | course1 | course2 | course3 | course4 |
|-------|------|------|----------|---------|---------|---------|---------|
| teacher@mta.ca | Prof. Smith | teacher | password | comp-101 | math-210 | | |
| teacher2@umoncton.ca | Dr. Jones | teacher | password | | | | |
| student@mta.ca | Alice Student | student | password | comp-101 | math-210 | | |
| student2@umoncton.ca | Bob Student | student | password | | | | |

Add matching rows to **Classes** (include `term`):

| classId | className | teacherEmail | term | createdAt |
|---------|-----------|--------------|------|-----------|
| comp-101 | COMP 101 | teacher@mta.ca | Spring 2026 | (leave empty or ISO date) |
| math-210 | MATH 210 | teacher@mta.ca | Spring 2026 | (leave empty or ISO date) |

**ProfessorAvailability** and **StudentPreferences** are created automatically when professors/students set availability or preferences. You do not need to add seed data to these sheets.

## 2. Create the Apps Script Project

1. Go to [script.google.com](https://script.google.com)
2. Create a new project (blank project)
3. Copy the contents of each `.gs` file into the project:
   - `Code.gs`
   - `SheetsService.gs`
   - `Actions.gs`
   - `Triggers.gs`
4. Set the Script Property:
   - Project Settings (gear icon) → Script Properties
   - Add property: `SPREADSHEET_ID` = your Google Sheet workbook ID (from the URL: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`)
5. Save the project

## 3. Link the Script to the Sheet

The script must run in the context of a user who has edit access to the Sheet. Either:

- Create the Apps Script project from the Sheet: **Extensions → Apps Script** (this binds the script to the Sheet and uses the same Google account), or
- Ensure the Google account that owns the Apps Script project has edit access to the Sheet (share the Sheet with that account)

## 4. Deploy as Web App

1. Click **Deploy** → **New deployment**
2. Type: **Web app**
3. Description: e.g. "Office Hours Planner API"
4. Execute as: **Me** (your account)
5. Who has access: **Anyone** (so the frontend can call it from any origin)
6. Click **Deploy**
7. Authorize the script when prompted (spreadsheet access)
8. Copy the **Web app URL** (e.g. `https://script.google.com/macros/s/.../exec`)

## 5. Configure the Frontend

Set the Web app URL as an environment variable:

- Local: in `.env`: `VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec`
- Netlify: Site settings → Environment variables → `VITE_APPS_SCRIPT_URL`

## 6. Install the Daily Trigger

The daily trigger pre-computes top-two poll results for closed polls.

1. In the Apps Script editor, select the function `installDailyTrigger` from the dropdown
2. Click **Run**
3. Authorize if prompted
4. Check **Executions** to confirm it ran successfully

You only need to run this once. The trigger will run `processClosedPolls` every day.

## API Contract

The frontend sends POST requests with JSON body: `{ "action": "<actionName>", ...payload }`.

### Frontend-compatible actions (Office Hours Booking UI)

| Action | Payload | Returns |
|--------|---------|---------|
| validateLogin | email, password | SessionUser or null |
| createUser | user: { email, password, name, role } | void |
| listCoursesByTeacher | teacherEmail | Course[] |
| listAllCourses | — | Course[] |
| createCourse | course: { courseId, name, teacherEmail, term } | void |
| getAvailability | courseId | ProfessorAvailability or null |
| setAvailability | courseId, timeRanges | void |
| listEnrollmentsForCourse | courseId | string[] (student emails) |
| listEnrollmentsForStudent | studentEmail | Course[] |
| enroll | studentEmail, courseId | void |
| getPreferences | studentEmail, courseId | TimeRange[] |
| setPreferences | studentEmail, courseId, timeRanges | void |
| computeBestTimes | courseId | BestTimeResult or null |

### Legacy poll/slot actions (optional)

| Action | Payload | Returns |
|--------|---------|---------|
| getPersonByEmail | email | Person or null |
| getClassesByIds | classIds | ClassMembership[] |
| listClasses | email | ClassMembership[] |
| listPolls | classId | OfficeHoursPoll[] |
| listPollsForStudent | courseIds | OfficeHoursPoll[] |
| createPoll | poll | void |
| savePollResponse | response | void |
| suggestTopConfigs | pollId | SuggestedConfig[] |
| saveOfficeHoursConfig | config | void |
| listSlots | classId | Slot[] |
| createBooking | booking | void |
| listBookings | classId | Booking[] |
| saveAnnouncement | announcement | void |
| sendAnnouncementEmail | payload | void (no-op) |

## Security

- Only emails from `@mta.ca` and `@umoncton.ca` are accepted for login and mutations
- Do not commit `SPREADSHEET_ID` or any secrets to the repo
- The Web app URL is public; authorization is enforced by checking email domain and class membership in the backend

## Troubleshooting

- **"SPREADSHEET_ID script property is not set"**: Add the property in Project Settings → Script Properties
- **CORS errors**: Google Apps Script Web Apps typically handle CORS automatically when deployed as "Anyone". If you see CORS errors, ensure the deployment is set to "Anyone" and the frontend uses the correct URL
- **"Account not found"**: Add the user's email to the People sheet with the correct role and course IDs
