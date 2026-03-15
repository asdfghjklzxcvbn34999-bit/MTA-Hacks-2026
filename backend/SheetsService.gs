/**
 * SheetsService.gs - Abstraction over SpreadsheetApp for Office Hours Planner backend.
 * Requires Script Property: SPREADSHEET_ID (the workbook ID)
 */

var SHEET_NAMES = [
  'People',
  'Classes',
  'Roster',
  'Polls',
  'PollResponses',
  'OfficeHoursConfigs',
  'Slots',
  'Bookings',
  'Announcements',
  'PollResults'
];

/**
 * Get the spreadsheet by ID from Script Properties.
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error('SPREADSHEET_ID script property is not set. Set it in Project Settings > Script Properties.');
  }
  return SpreadsheetApp.openById(id);
}

/**
 * Get a sheet by name. Creates the sheet if it does not exist.
 * @param {string} name - Sheet name
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getSheet(name) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

/**
 * Get all data rows from a sheet (skips header row).
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {string[][]}
 */
function getAllRows(sheet) {
  try {
    var range = sheet.getDataRange();
    if (!range) return [];
    var data = range.getValues();
    if (!data || data.length < 2) return [];
    return data.slice(1);
  } catch (err) {
    return [];
  }
}

/**
 * Get header row (first row) from a sheet.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {string[]}
 */
function getHeaders(sheet) {
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 1) return [];
  return data[0];
}

/**
 * Append a row to a sheet.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string[]} values
 */
function appendRow(sheet, values) {
  sheet.appendRow(values);
}

/**
 * Find row index (1-based, data row) where column matches value.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} colIndex - 1-based column index
 * @param {string} value
 * @returns {number} 1-based row index, or -1 if not found
 */
function findRow(sheet, colIndex, value) {
  var data = sheet.getDataRange().getValues();
  var normalized = (value || '').toString().toLowerCase().trim();
  for (var i = 1; i < data.length; i++) {
    var cell = (data[i][colIndex - 1] || '').toString().toLowerCase().trim();
    if (cell === normalized) return i + 1;
  }
  return -1;
}

/**
 * Update a row by 1-based row index.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowIndex
 * @param {string[]} values
 */
function updateRow(sheet, rowIndex, values) {
  var range = sheet.getRange(rowIndex, 1, rowIndex, values.length);
  range.setValues([values]);
}

/**
 * Delete a row by 1-based row index.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowIndex
 */
function deleteRow(sheet, rowIndex) {
  sheet.deleteRow(rowIndex);
}

/**
 * Ensure sheet has header row. If sheet is empty, writes headers.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string[]} headers
 */
function ensureHeaders(sheet, headers) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    sheet.appendRow(headers);
  }
}
