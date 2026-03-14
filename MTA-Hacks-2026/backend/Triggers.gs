/**
 * Triggers.gs - Daily time-driven trigger to process closed polls.
 * Run installDailyTrigger() once manually to register the trigger.
 */

/**
 * Install a daily time-driven trigger for processClosedPolls.
 * Run this once from the Apps Script editor (select installDailyTrigger and Run).
 */
function installDailyTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processClosedPolls') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('processClosedPolls')
    .timeBased()
    .everyDays(1)
    .create();
  Logger.log('Daily trigger for processClosedPolls installed.');
}

/**
 * Find polls that have closed (closesAtIso < now), compute top-two for each,
 * and write results to PollResults sheet if not already present.
 */
function processClosedPolls() {
  var now = new Date().toISOString();
  var sheet = getSheet('Polls');
  var rows = getAllRows(sheet);
  var closedPollIds = [];
  for (var i = 0; i < rows.length; i++) {
    var closesAt = (rows[i][7] || '').toString();
    if (closesAt && closesAt < now) {
      closedPollIds.push(rows[i][0]);
    }
  }

  var resultsSheet = getSheet('PollResults');
  ensureHeaders(resultsSheet, ['pollId', 'rank', 'summary', 'estimatedCoverage', 'computedAt']);
  var existingRows = getAllRows(resultsSheet);
  var existingByPoll = {};
  for (var e = 0; e < existingRows.length; e++) {
    var pid = (existingRows[e][0] || '').toString();
    existingByPoll[pid] = true;
  }

  for (var p = 0; p < closedPollIds.length; p++) {
    var pollId = closedPollIds[p];
    if (existingByPoll[pollId]) continue;

    var top = computeTopConfigsFromResponses(pollId);
    var computedAt = new Date().toISOString();
    for (var t = 0; t < top.length; t++) {
      appendRow(resultsSheet, [
        pollId,
        top[t].rank,
        top[t].summary,
        top[t].estimatedCoverage,
        computedAt
      ]);
    }
    existingByPoll[pollId] = true;
  }
}
