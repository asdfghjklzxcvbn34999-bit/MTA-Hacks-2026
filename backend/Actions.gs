/**
 * Actions.gs - Handlers for each API action.
 * Allowed email domains: @mta.ca, @umoncton.ca
 */

var ALLOWED_DOMAINS = ['mta.ca', 'umoncton.ca'];

function isAllowedEmail(email) {
  if (!email || typeof email !== 'string') return false;
  var domain = email.split('@')[1];
  if (!domain) return false;
  return ALLOWED_DOMAINS.indexOf(domain.toLowerCase().trim()) >= 0;
}

var PEOPLE_HEADERS = ['email', 'name', 'role', 'password', 'course1', 'course2', 'course3', 'course4'];

function actionGetPersonByEmail(payload) {
  var email = payload.email;
  if (!email) return null;
  if (!isAllowedEmail(email)) return null;

  var sheet = getSheet('People');
  ensureHeaders(sheet, PEOPLE_HEADERS);
  var rows = getAllRows(sheet);
  var normalized = email.toString().toLowerCase().trim();
  for (var i = 0; i < rows.length; i++) {
    var rowEmail = (rows[i][0] || '').toString().toLowerCase().trim();
    if (rowEmail === normalized) {
      var courseIds = [];
      for (var c = 1; c <= 4; c++) {
        var cid = (rows[i][c + 3] || '').toString().trim();
        if (cid) courseIds.push(cid);
      }
      return {
        email: rows[i][0],
        name: rows[i][1] || '',
        role: rows[i][2] || 'student',
        courseIds: courseIds
      };
    }
  }
  return null;
}

// --- Frontend-compatible actions (Office Hours Booking UI) ---

function actionValidateLogin(payload) {
  var email = payload.email;
  var password = payload.password;
  if (!email || !password) return null;
  if (!isAllowedEmail(email)) return null;

  var sheet = getSheet('People');
  ensureHeaders(sheet, PEOPLE_HEADERS);
  var rows = getAllRows(sheet);
  var normalized = email.toString().toLowerCase().trim();
  var pwd = (password || '').toString();
  for (var i = 0; i < rows.length; i++) {
    var rowEmail = (rows[i][0] || '').toString().toLowerCase().trim();
    var rowPwd = (rows[i][3] || '').toString();
    if (rowEmail === normalized && rowPwd === pwd) {
      return {
        email: rows[i][0],
        role: rows[i][2] || 'student',
        name: rows[i][1] || ''
      };
    }
  }
  return null;
}

function actionCreateUser(payload) {
  var user = payload.user;
  if (!user) throw new Error('Missing user');
  if (!isAllowedEmail(user.email)) throw new Error('Invalid email domain');

  var sheet = getSheet('People');
  ensureHeaders(sheet, PEOPLE_HEADERS);
  var rows = getAllRows(sheet);
  var normalized = (user.email || '').toString().toLowerCase().trim();
  for (var i = 0; i < rows.length; i++) {
    var rowEmail = (rows[i][0] || '').toString().toLowerCase().trim();
    if (rowEmail === normalized) throw new Error('User already exists.');
  }
  appendRow(sheet, [
    normalized,
    user.name || '',
    user.role || 'student',
    (user.password || '').toString(),
    '', '', '', ''
  ]);
  return {};
}

function actionListCoursesByTeacher(payload) {
  var teacherEmail = payload.teacherEmail;
  if (!teacherEmail || !isAllowedEmail(teacherEmail)) return [];

  var sheet = getSheet('Classes');
  ensureHeaders(sheet, ['classId', 'className', 'teacherEmail', 'term', 'createdAt']);
  var rows = getAllRows(sheet);
  var normalized = teacherEmail.toString().toLowerCase().trim();
  var result = [];
  for (var i = 0; i < rows.length; i++) {
    if ((rows[i][2] || '').toString().toLowerCase().trim() === normalized) {
      result.push({
        courseId: rows[i][0],
        name: rows[i][1] || rows[i][0],
        teacherEmail: rows[i][2] || '',
        term: rows[i][3] || ''
      });
    }
  }
  return result;
}

function actionListAllCourses(payload) {
  var sheet = getSheet('Classes');
  ensureHeaders(sheet, ['classId', 'className', 'teacherEmail', 'term', 'createdAt']);
  var rows = getAllRows(sheet);
  var result = [];
  for (var i = 0; i < rows.length; i++) {
    result.push({
      courseId: rows[i][0],
      name: rows[i][1] || rows[i][0],
      teacherEmail: rows[i][2] || '',
      term: rows[i][3] || ''
    });
  }
  return result;
}

function actionCreateCourse(payload) {
  var course = payload.course;
  if (!course) throw new Error('Missing course');
  if (!isAllowedEmail(course.teacherEmail)) throw new Error('Invalid email domain');

  var sheet = getSheet('Classes');
  ensureHeaders(sheet, ['classId', 'className', 'teacherEmail', 'term', 'createdAt']);
  var now = new Date().toISOString();
  appendRow(sheet, [
    course.courseId,
    course.name || course.courseId,
    course.teacherEmail,
    course.term || '',
    now
  ]);
  return {};
}

function actionGetAvailability(payload) {
  var courseId = payload.courseId;
  if (!courseId) return null;

  var sheet = getSheet('ProfessorAvailability');
  ensureHeaders(sheet, ['courseId', 'timeRangesJson']);
  var rows = getAllRows(sheet);
  var normalized = courseId.toString().toLowerCase().trim();
  for (var i = 0; i < rows.length; i++) {
    if ((rows[i][0] || '').toString().toLowerCase().trim() === normalized) {
      var timeRanges = [];
      try {
        timeRanges = JSON.parse(rows[i][1] || '[]');
      } catch (e) {}
      return { courseId: courseId, timeRanges: timeRanges };
    }
  }
  return null;
}

function actionSetAvailability(payload) {
  var courseId = payload.courseId;
  var timeRanges = payload.timeRanges;
  if (!courseId) throw new Error('Missing courseId');
  if (!Array.isArray(timeRanges)) throw new Error('timeRanges must be an array');

  var sheet = getSheet('ProfessorAvailability');
  ensureHeaders(sheet, ['courseId', 'timeRangesJson']);
  var data = sheet.getDataRange().getValues();
  var normalized = courseId.toString().toLowerCase().trim();
  var timeRangesJson = JSON.stringify(timeRanges);
  var existingRow = -1;
  for (var i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().toLowerCase().trim() === normalized) {
      existingRow = i + 1;
      break;
    }
  }
  if (existingRow > 0) {
    updateRow(sheet, existingRow, [courseId, timeRangesJson]);
  } else {
    appendRow(sheet, [courseId, timeRangesJson]);
  }
  return {};
}

function actionListEnrollmentsForCourse(payload) {
  var courseId = payload.courseId;
  if (!courseId) return [];

  var sheet = getSheet('Roster');
  ensureHeaders(sheet, ['classId', 'studentEmail', 'addedAt']);
  var rows = getAllRows(sheet);
  var normalized = courseId.toString().toLowerCase().trim();
  var result = [];
  for (var i = 0; i < rows.length; i++) {
    if ((rows[i][0] || '').toString().toLowerCase().trim() === normalized) {
      result.push(rows[i][1] || '');
    }
  }
  return result;
}

function actionListEnrollmentsForStudent(payload) {
  var studentEmail = payload.studentEmail;
  if (!studentEmail || !isAllowedEmail(studentEmail)) return [];

  var rosterSheet = getSheet('Roster');
  ensureHeaders(rosterSheet, ['classId', 'studentEmail', 'addedAt']);
  var rosterRows = getAllRows(rosterSheet);
  var normalized = studentEmail.toString().toLowerCase().trim();
  var classIds = [];
  for (var i = 0; i < rosterRows.length; i++) {
    if ((rosterRows[i][1] || '').toString().toLowerCase().trim() === normalized) {
      classIds.push((rosterRows[i][0] || '').toString().toLowerCase().trim());
    }
  }
  if (classIds.length === 0) return [];

  var classesSheet = getSheet('Classes');
  ensureHeaders(classesSheet, ['classId', 'className', 'teacherEmail', 'term', 'createdAt']);
  var classRows = getAllRows(classesSheet);
  var result = [];
  for (var j = 0; j < classIds.length; j++) {
    for (var k = 0; k < classRows.length; k++) {
      if ((classRows[k][0] || '').toString().toLowerCase().trim() === classIds[j]) {
        result.push({
          courseId: classRows[k][0],
          name: classRows[k][1] || classRows[k][0],
          teacherEmail: classRows[k][2] || '',
          term: classRows[k][3] || ''
        });
        break;
      }
    }
  }
  return result;
}

function actionEnroll(payload) {
  var studentEmail = payload.studentEmail;
  var courseId = payload.courseId;
  if (!studentEmail || !courseId) throw new Error('Missing studentEmail or courseId');
  if (!isAllowedEmail(studentEmail)) throw new Error('Invalid email domain');

  var sheet = getSheet('Roster');
  ensureHeaders(sheet, ['classId', 'studentEmail', 'addedAt']);
  var rows = getAllRows(sheet);
  var normalizedEmail = studentEmail.toString().toLowerCase().trim();
  var normalizedCourse = courseId.toString().toLowerCase().trim();
  for (var i = 0; i < rows.length; i++) {
    var rCourse = (rows[i][0] || '').toString().toLowerCase().trim();
    var rEmail = (rows[i][1] || '').toString().toLowerCase().trim();
    if (rCourse === normalizedCourse && rEmail === normalizedEmail) {
      throw new Error('Already enrolled in this course.');
    }
  }
  appendRow(sheet, [courseId, studentEmail, new Date().toISOString()]);
  return {};
}

function actionGetPreferences(payload) {
  var studentEmail = payload.studentEmail;
  var courseId = payload.courseId;
  if (!studentEmail || !courseId) return [];

  var sheet = getSheet('StudentPreferences');
  ensureHeaders(sheet, ['studentEmail', 'courseId', 'timeRangesJson']);
  var rows = getAllRows(sheet);
  var normalizedEmail = studentEmail.toString().toLowerCase().trim();
  var normalizedCourse = courseId.toString().toLowerCase().trim();
  for (var i = 0; i < rows.length; i++) {
    var rEmail = (rows[i][0] || '').toString().toLowerCase().trim();
    var rCourse = (rows[i][1] || '').toString().toLowerCase().trim();
    if (rEmail === normalizedEmail && rCourse === normalizedCourse) {
      try {
        return JSON.parse(rows[i][2] || '[]');
      } catch (e) {}
      return [];
    }
  }
  return [];
}

function actionSetPreferences(payload) {
  var studentEmail = payload.studentEmail;
  var courseId = payload.courseId;
  var timeRanges = payload.timeRanges;
  if (!studentEmail || !courseId) throw new Error('Missing studentEmail or courseId');
  if (!isAllowedEmail(studentEmail)) throw new Error('Invalid email domain');
  if (!Array.isArray(timeRanges)) throw new Error('timeRanges must be an array');

  var sheet = getSheet('StudentPreferences');
  ensureHeaders(sheet, ['studentEmail', 'courseId', 'timeRangesJson']);
  var data = sheet.getDataRange().getValues();
  var normalizedEmail = studentEmail.toString().toLowerCase().trim();
  var normalizedCourse = courseId.toString().toLowerCase().trim();
  var timeRangesJson = JSON.stringify(timeRanges);
  var existingRow = -1;
  for (var i = 1; i < data.length; i++) {
    var rEmail = (data[i][0] || '').toString().toLowerCase().trim();
    var rCourse = (data[i][1] || '').toString().toLowerCase().trim();
    if (rEmail === normalizedEmail && rCourse === normalizedCourse) {
      existingRow = i + 1;
      break;
    }
  }
  if (existingRow > 0) {
    updateRow(sheet, existingRow, [studentEmail, courseId, timeRangesJson]);
  } else {
    appendRow(sheet, [studentEmail, courseId, timeRangesJson]);
  }
  return {};
}

function toMinutesAppsScript(hhmm) {
  if (!hhmm) return 0;
  var parts = (hhmm + '').split(':');
  var h = parseInt(parts[0], 10) || 0;
  var m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

function overlapAppsScript(aStart, aEnd, bStart, bEnd) {
  var aS = toMinutesAppsScript(aStart);
  var aE = toMinutesAppsScript(aEnd);
  var bS = toMinutesAppsScript(bStart);
  var bE = toMinutesAppsScript(bEnd);
  var overlapStart = Math.max(aS, bS);
  var overlapEnd = Math.min(aE, bE);
  if (overlapStart >= overlapEnd) return null;
  var pad = function(n) { return (n < 10 ? '0' : '') + n; };
  return {
    start: pad(Math.floor(overlapStart / 60)) + ':' + pad(overlapStart % 60),
    end: pad(Math.floor(overlapEnd / 60)) + ':' + pad(overlapEnd % 60)
  };
}

function findBestOverlapForDayAppsScript(day, profRanges, studentRangesByStudent) {
  var dayProf = [];
  for (var p = 0; p < profRanges.length; p++) {
    if ((profRanges[p].day || '').toLowerCase() === (day || '').toLowerCase()) {
      dayProf.push(profRanges[p]);
    }
  }
  if (dayProf.length === 0) return null;

  var segmentCounts = {};
  for (var pr = 0; pr < dayProf.length; pr++) {
    var prRange = dayProf[pr];
    for (var s = 0; s < studentRangesByStudent.length; s++) {
      var studentRanges = studentRangesByStudent[s];
      var dayStudent = [];
      for (var st = 0; st < studentRanges.length; st++) {
        if ((studentRanges[st].day || '').toLowerCase() === (day || '').toLowerCase()) {
          dayStudent.push(studentRanges[st]);
        }
      }
      for (var sr = 0; sr < dayStudent.length; sr++) {
        var srRange = dayStudent[sr];
        var seg = overlapAppsScript(prRange.startHour, prRange.endHour, srRange.startHour, srRange.endHour);
        if (seg) {
          var key = seg.start + '~' + seg.end;
          if (!segmentCounts[key]) segmentCounts[key] = {};
          segmentCounts[key]['s' + s] = true;
        }
      }
    }
  }
  var best = null;
  for (var key in segmentCounts) {
    var students = segmentCounts[key];
    var count = 0;
    for (var k in students) count++;
    var parts = key.split('~');
    if (!best || count > best.studentCount) {
      best = { startHour: parts[0], endHour: parts[1], studentCount: count };
    }
  }
  return best;
}

function actionComputeBestTimes(payload) {
  var courseId = payload.courseId;
  if (!courseId) return null;

  var classesSheet = getSheet('Classes');
  ensureHeaders(classesSheet, ['classId', 'className', 'teacherEmail', 'term', 'createdAt']);
  var classRows = getAllRows(classesSheet);
  var courseName = courseId;
  for (var c = 0; c < classRows.length; c++) {
    if ((classRows[c][0] || '').toString().toLowerCase().trim() === courseId.toString().toLowerCase().trim()) {
      courseName = classRows[c][1] || classRows[c][0];
      break;
    }
  }

  var availability = actionGetAvailability({ courseId: courseId });
  var profRanges = availability ? (availability.timeRanges || []) : [];

  var enrolledEmails = actionListEnrollmentsForCourse({ courseId: courseId });
  var studentPrefsArrays = [];
  for (var e = 0; e < enrolledEmails.length; e++) {
    var prefs = actionGetPreferences({ studentEmail: enrolledEmails[e], courseId: courseId });
    studentPrefsArrays.push(prefs);
  }

  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var bestSlots = [];
  for (var d = 0; d < DAYS.length; d++) {
    var slot = findBestOverlapForDayAppsScript(DAYS[d], profRanges, studentPrefsArrays);
    if (slot) {
      bestSlots.push({
        day: DAYS[d],
        startHour: slot.startHour,
        endHour: slot.endHour,
        studentCount: slot.studentCount
      });
    }
  }
  return {
    courseId: courseId,
    courseName: courseName,
    bestSlots: bestSlots
  };
}

// --- Legacy actions (getClassesByIds updated for term) ---

function actionGetClassesByIds(payload) {
  var classIds = payload.classIds;
  if (!Array.isArray(classIds) || classIds.length === 0) return [];

  var normalizedIds = classIds.filter(Boolean).map(function(id) { return id.toString().trim().toLowerCase(); });
  var set = {};
  for (var n = 0; n < normalizedIds.length; n++) set[normalizedIds[n]] = true;

  var sheet = getSheet('Classes');
  ensureHeaders(sheet, ['classId', 'className', 'teacherEmail', 'term', 'createdAt']);
  var rows = getAllRows(sheet);
  var result = [];
  var foundIds = {};
  for (var i = 0; i < rows.length; i++) {
    var cid = (rows[i][0] || '').toString().toLowerCase();
    if (set[cid]) {
      foundIds[cid] = true;
      result.push({
        classId: rows[i][0],
        className: rows[i][1] || rows[i][0],
        teacherEmail: rows[i][2] || '',
        term: rows[i][3] || ''
      });
    }
  }
  for (var j = 0; j < normalizedIds.length; j++) {
    if (!foundIds[normalizedIds[j]]) {
      result.push({
        classId: normalizedIds[j],
        className: normalizedIds[j],
        teacherEmail: '',
        term: ''
      });
    }
  }
  return result;
}

function actionListClasses(payload) {
  var email = payload.email;
  if (!email || !isAllowedEmail(email)) return [];

  var person = actionGetPersonByEmail({ email: email });
  if (!person) return [];

  if (person.role === 'teacher') {
    return actionGetClassesByIds({ classIds: person.courseIds });
  }
  return actionGetClassesByIds({ classIds: person.courseIds });
}

function parsePollOption(opt) {
  if (!opt) return { day: '', startHour: '', endHour: '' };
  return {
    day: opt.day || '',
    startHour: opt.startHour || '',
    endHour: opt.endHour || ''
  };
}

function rowToPoll(row) {
  var options = [];
  try {
    options = JSON.parse(row[8] || '[]').map(parsePollOption);
  } catch (e) {}
  return {
    pollId: row[0],
    classId: row[1],
    teacherEmail: row[2],
    pollType: row[3] || 'office_hours',
    title: row[4] || '',
    slotMinutes: parseInt(row[5], 10) || 30,
    daysPerWeek: parseInt(row[6], 10) || 1,
    closesAtIso: row[7] || '',
    options: options
  };
}

function actionListPolls(payload) {
  var classId = payload.classId;
  if (!classId) return [];

  var sheet = getSheet('Polls');
  ensureHeaders(sheet, ['pollId', 'classId', 'teacherEmail', 'pollType', 'title', 'slotMinutes', 'daysPerWeek', 'closesAtIso', 'optionsJson', 'createdAt']);
  var rows = getAllRows(sheet);
  var normalized = classId.toString().toLowerCase().trim();
  var result = [];
  for (var i = 0; i < rows.length; i++) {
    if ((rows[i][1] || '').toString().toLowerCase().trim() === normalized) {
      result.push(rowToPoll(rows[i]));
    }
  }
  return result;
}

function actionListPollsForStudent(payload) {
  var courseIds = payload.courseIds;
  if (!Array.isArray(courseIds) || courseIds.length === 0) return [];

  var set = {};
  for (var s = 0; s < courseIds.length; s++) {
    set[(courseIds[s] || '').toString().toLowerCase().trim()] = true;
  }

  var sheet = getSheet('Polls');
  ensureHeaders(sheet, ['pollId', 'classId', 'teacherEmail', 'pollType', 'title', 'slotMinutes', 'daysPerWeek', 'closesAtIso', 'optionsJson', 'createdAt']);
  var rows = getAllRows(sheet);
  var result = [];
  for (var i = 0; i < rows.length; i++) {
    var cid = (rows[i][1] || '').toString().toLowerCase().trim();
    if (set[cid]) result.push(rowToPoll(rows[i]));
  }
  return result;
}

function actionCreatePoll(payload) {
  var poll = payload.poll;
  if (!poll) throw new Error('Missing poll');

  if (!isAllowedEmail(poll.teacherEmail)) throw new Error('Invalid email domain');

  if (poll.pollType === 'office_hours') {
    var existing = actionListPolls({ classId: poll.classId });
    for (var e = 0; e < existing.length; e++) {
      if (existing[e].pollType === 'office_hours') {
        throw new Error('This course already has an office-hours poll. Only one office-hours poll per course is allowed.');
      }
    }
  }

  var sheet = getSheet('Polls');
  ensureHeaders(sheet, ['pollId', 'classId', 'teacherEmail', 'pollType', 'title', 'slotMinutes', 'daysPerWeek', 'closesAtIso', 'optionsJson', 'createdAt']);
  var optionsJson = JSON.stringify(poll.options || []);
  var now = new Date().toISOString();
  appendRow(sheet, [
    poll.pollId,
    poll.classId,
    poll.teacherEmail,
    poll.pollType || 'office_hours',
    poll.title || '',
    poll.slotMinutes || 30,
    poll.daysPerWeek || 1,
    poll.closesAtIso || '',
    optionsJson,
    now
  ]);
  return {};
}

function actionSavePollResponse(payload) {
  var response = payload.response;
  if (!response) throw new Error('Missing response');

  if (!isAllowedEmail(response.studentEmail)) throw new Error('Invalid email domain');

  var polls = actionListPolls({ classId: response.classId });
  var poll = null;
  for (var p = 0; p < polls.length; p++) {
    if (polls[p].pollId === response.pollId) { poll = polls[p]; break; }
  }
  if (poll && poll.closesAtIso && new Date(poll.closesAtIso) < new Date()) {
    throw new Error('This poll has closed. Responses are no longer accepted.');
  }

  var sheet = getSheet('PollResponses');
  ensureHeaders(sheet, ['responseId', 'pollId', 'classId', 'studentEmail', 'selectedOptionKeysJson', 'submittedAtIso']);
  var rows = sheet.getDataRange().getValues();
  var pollId = (response.pollId || '').toString().toLowerCase().trim();
  var studentEmail = (response.studentEmail || '').toString().toLowerCase().trim();
  var existingRow = -1;
  for (var i = 1; i < rows.length; i++) {
    var rPoll = (rows[i][1] || '').toString().toLowerCase().trim();
    var rEmail = (rows[i][3] || '').toString().toLowerCase().trim();
    if (rPoll === pollId && rEmail === studentEmail) {
      existingRow = i + 1;
      break;
    }
  }
  var selectedJson = JSON.stringify(response.selectedOptionKeys || []);
  var values = [
    response.responseId,
    response.pollId,
    response.classId,
    response.studentEmail,
    selectedJson,
    response.submittedAtIso || new Date().toISOString()
  ];
  if (existingRow > 0) {
    updateRow(sheet, existingRow, values);
  } else {
    appendRow(sheet, values);
  }
  return {};
}

function computeTopConfigsFromResponses(pollId) {
  var sheet = getSheet('PollResponses');
  var rows = getAllRows(sheet);
  var counts = {};
  var normalizedPollId = (pollId || '').toString().toLowerCase().trim();
  for (var i = 0; i < rows.length; i++) {
    if ((rows[i][1] || '').toString().toLowerCase().trim() !== normalizedPollId) continue;
    var keys = [];
    try {
      keys = JSON.parse(rows[i][4] || '[]');
    } catch (e) {}
    for (var k = 0; k < keys.length; k++) {
      var key = (keys[k] || '').toString();
      if (key) counts[key] = (counts[key] || 0) + 1;
    }
  }
  var entries = [];
  for (var key in counts) entries.push({ key: key, count: counts[key] });
  entries.sort(function(a, b) { return b.count - a.count; });
  var top = entries.slice(0, 2);
  return top.map(function(item, idx) {
    return {
      rank: (idx + 1),
      summary: item.key,
      estimatedCoverage: item.count
    };
  });
}

function actionSuggestTopConfigs(payload) {
  var pollId = payload.pollId;
  if (!pollId) return [];

  var sheet = getSheet('PollResults');
  ensureHeaders(sheet, ['pollId', 'rank', 'summary', 'estimatedCoverage', 'computedAt']);
  var rows = getAllRows(sheet);
  var normalized = pollId.toString().toLowerCase().trim();
  var stored = [];
  for (var i = 0; i < rows.length; i++) {
    if ((rows[i][0] || '').toString().toLowerCase().trim() === normalized) {
      stored.push({
        rank: parseInt(rows[i][1], 10) || 1,
        summary: rows[i][2] || '',
        estimatedCoverage: parseInt(rows[i][3], 10) || 0
      });
    }
  }
  if (stored.length > 0) {
    stored.sort(function(a, b) { return a.rank - b.rank; });
    return stored;
  }
  return computeTopConfigsFromResponses(pollId);
}

function actionSaveOfficeHoursConfig(payload) {
  var config = payload.config;
  if (!config) throw new Error('Missing config');

  var sheet = getSheet('OfficeHoursConfigs');
  ensureHeaders(sheet, ['configId', 'classId', 'pollId', 'summary', 'slotMinutes', 'sessionsJson', 'chosenByTeacher', 'createdAt']);
  var sessionsJson = JSON.stringify(config.sessions || []);
  var now = new Date().toISOString();
  appendRow(sheet, [
    config.configId,
    config.classId,
    config.pollId,
    config.summary || '',
    config.slotMinutes || 30,
    sessionsJson,
    config.chosenByTeacher ? 'TRUE' : 'FALSE',
    now
  ]);

  var slotsSheet = getSheet('Slots');
  ensureHeaders(slotsSheet, ['slotId', 'classId', 'startsAtIso', 'endsAtIso', 'capacity', 'createdAt']);
  var baseDate = new Date().toISOString().slice(0, 10);
  var sessions = config.sessions || [];
  for (var s = 0; s < sessions.length; s++) {
    var sess = sessions[s];
    var slotId = config.configId + '-' + s;
    var startsAt = baseDate + 'T' + (sess.startHour || '13:00') + ':00.000Z';
    var endsAt = baseDate + 'T' + (sess.endHour || '14:00') + ':00.000Z';
    appendRow(slotsSheet, [slotId, config.classId, startsAt, endsAt, 1, now]);
  }
  return {};
}

function actionListSlots(payload) {
  var classId = payload.classId;
  if (!classId) return [];

  var sheet = getSheet('Slots');
  ensureHeaders(sheet, ['slotId', 'classId', 'startsAtIso', 'endsAtIso', 'capacity', 'createdAt']);
  var rows = getAllRows(sheet);
  var normalized = classId.toString().toLowerCase().trim();
  var result = [];
  for (var i = 0; i < rows.length; i++) {
    if ((rows[i][1] || '').toString().toLowerCase().trim() === normalized) {
      result.push({
        slotId: rows[i][0],
        classId: rows[i][1],
        startsAtIso: rows[i][2],
        endsAtIso: rows[i][3],
        capacity: parseInt(rows[i][4], 10) || 1
      });
    }
  }
  return result;
}

function actionCreateBooking(payload) {
  var booking = payload.booking;
  if (!booking) throw new Error('Missing booking');

  if (!isAllowedEmail(booking.studentEmail)) throw new Error('Invalid email domain');

  var bookingsSheet = getSheet('Bookings');
  ensureHeaders(bookingsSheet, ['bookingId', 'classId', 'slotId', 'studentEmail', 'createdAtIso']);
  var bookings = getAllRows(bookingsSheet);
  var slotId = (booking.slotId || '').toString();
  var studentEmail = (booking.studentEmail || '').toString().toLowerCase().trim();
  for (var b = 0; b < bookings.length; b++) {
    var bSlot = (bookings[b][2] || '').toString();
    var bEmail = (bookings[b][3] || '').toString().toLowerCase().trim();
    if (bSlot === slotId && bEmail === studentEmail) {
      throw new Error('This student has already booked the selected slot.');
    }
  }

  var slots = actionListSlots({ classId: booking.classId });
  var slot = null;
  for (var s = 0; s < slots.length; s++) {
    if (slots[s].slotId === slotId) { slot = slots[s]; break; }
  }
  if (!slot) throw new Error('Slot not found');

  var count = 0;
  for (var c = 0; c < bookings.length; c++) {
    if ((bookings[c][2] || '').toString() === slotId) count++;
  }
  if (count >= slot.capacity) throw new Error('Slot is full');

  appendRow(bookingsSheet, [
    booking.bookingId,
    booking.classId,
    booking.slotId,
    booking.studentEmail,
    booking.createdAtIso || new Date().toISOString()
  ]);
  return {};
}

function actionListBookings(payload) {
  var classId = payload.classId;
  if (!classId) return [];

  var sheet = getSheet('Bookings');
  ensureHeaders(sheet, ['bookingId', 'classId', 'slotId', 'studentEmail', 'createdAtIso']);
  var rows = getAllRows(sheet);
  var normalized = classId.toString().toLowerCase().trim();
  var result = [];
  for (var i = 0; i < rows.length; i++) {
    if ((rows[i][1] || '').toString().toLowerCase().trim() === normalized) {
      result.push({
        bookingId: rows[i][0],
        classId: rows[i][1],
        slotId: rows[i][2],
        studentEmail: rows[i][3],
        createdAtIso: rows[i][4]
      });
    }
  }
  return result;
}

function actionSaveAnnouncement(payload) {
  var announcement = payload.announcement;
  if (!announcement) throw new Error('Missing announcement');

  if (!isAllowedEmail(announcement.teacherEmail)) throw new Error('Invalid email domain');

  var sheet = getSheet('Announcements');
  ensureHeaders(sheet, ['announcementId', 'classId', 'teacherEmail', 'subject', 'body', 'createdAtIso']);
  appendRow(sheet, [
    announcement.announcementId,
    announcement.classId,
    announcement.teacherEmail,
    announcement.subject || '',
    announcement.body || '',
    announcement.createdAtIso || new Date().toISOString()
  ]);
  return {};
}

function actionSendAnnouncementEmail(payload) {
  return {};
}
