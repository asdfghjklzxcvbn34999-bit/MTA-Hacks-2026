/**
 * Code.gs - Entry point for Office Hours Planner Apps Script Web App.
 * Handles POST (main API) and GET (health/405), with CORS headers.
 */

var ACTIONS = {
  getPersonByEmail: actionGetPersonByEmail,
  getClassesByIds: actionGetClassesByIds,
  listClasses: actionListClasses,
  listPolls: actionListPolls,
  listPollsForStudent: actionListPollsForStudent,
  createPoll: actionCreatePoll,
  savePollResponse: actionSavePollResponse,
  suggestTopConfigs: actionSuggestTopConfigs,
  saveOfficeHoursConfig: actionSaveOfficeHoursConfig,
  listSlots: actionListSlots,
  createBooking: actionCreateBooking,
  listBookings: actionListBookings,
  saveAnnouncement: actionSaveAnnouncement,
  sendAnnouncementEmail: actionSendAnnouncementEmail
};

/**
 * Handle POST requests. Expects JSON body: { action: string, ...payload }
 * Throws on error so the client receives a failed response (Apps Script returns 500).
 */
function doPost(e) {
  var body = e.postData && e.postData.contents ? e.postData.contents : '{}';
  var data = JSON.parse(body);
  var action = data.action;
  if (!action || typeof action !== 'string') {
    throw new Error('Missing or invalid action');
  }
  var handler = ACTIONS[action];
  if (!handler) {
    throw new Error('Unknown action: ' + action);
  }
  var result = handler(data);
  if (result === undefined) result = {};
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handle GET requests. Returns 405 or simple health check.
 */
function doGet(e) {
  var result = { ok: true, message: 'Office Hours Planner API - use POST' };
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
