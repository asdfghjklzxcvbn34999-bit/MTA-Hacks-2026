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

function actionGetPersonByEmail(payload) {
  var email = payload.email;
  if (!email) return null;
  if (!isAllowedEmail(email)) return null;

  var sheet = getSheet('People');
  ensureHeaders(sheet, ['email', 'name', 'role', 'course1', 'course2', 'course3', 'course4']);
  var rows = getAllRows(sheet);
  var normalized = email.toString().toLowerCase().trim();
  for (var i = 0; i < rows.length; i++) {
    var rowEmail = (rows[i][0] || '').toString().toLowerCase().trim();
    if (rowEmail === normalized) {
      var courseIds = [];
      for (var c = 1; c <= 4; c++) {
        var cid = (rows[i][c + 2] || '').toString().trim();
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

function actionGetClassesByIds(payload) {
  var classIds = payload.classIds;
  if (!Array.isArray(classIds) || classIds.length === 0) return [];

  var normalizedIds = classIds.filter(Boolean).map(function(id) { return id.toString().trim().toLowerCase(); });
  var set = {};
  for (var n = 0; n < normalizedIds.length; n++) set[normalizedIds[n]] = true;

  var sheet = getSheet('Classes');
  ensureHeaders(sheet, ['classId', 'className', 'teacherEmail', 'createdAt']);
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
        teacherEmail: rows[i][2] || ''
      });
    }
  }
  for (var j = 0; j < normalizedIds.length; j++) {
    if (!foundIds[normalizedIds[j]]) {
      result.push({
        classId: normalizedIds[j],
        className: normalizedIds[j],
        teacherEmail: ''
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
