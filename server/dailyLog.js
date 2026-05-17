const db = require('./db');

const selectLogByDate = db.prepare(`
  SELECT *
  FROM daily_log
  WHERE log_date = ?
  LIMIT 1
`);
const insertLog = db.prepare(`
  INSERT INTO daily_log (log_date, approvals_count, video_ids_approved)
  VALUES (?, 0, '[]')
`);
const updateLog = db.prepare(`
  UPDATE daily_log
  SET approvals_count = ?, video_ids_approved = ?
  WHERE id = ?
`);

function getTodayString() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function parseVideoIds(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function getTodayLog() {
  const today = getTodayString();
  let log = selectLogByDate.get(today);

  if (!log) {
    const result = insertLog.run(today);
    log = selectLogByDate.get(today) || { id: result.lastInsertRowid, log_date: today };
  }

  return log;
}

function incrementApprovals(videoId) {
  const log = getTodayLog();
  const existingVideoIds = parseVideoIds(log.video_ids_approved);
  const nextVideoIds = existingVideoIds.includes(videoId)
    ? existingVideoIds
    : [...existingVideoIds, videoId];
  const nextCount = Number(log.approvals_count || 0) + 1;

  updateLog.run(nextCount, JSON.stringify(nextVideoIds), log.id);

  return selectLogByDate.get(log.log_date);
}

function getTodayApprovalCount() {
  const log = getTodayLog();
  return Number(log.approvals_count || 0);
}

module.exports = {
  getTodayApprovalCount,
  getTodayLog,
  incrementApprovals
};
