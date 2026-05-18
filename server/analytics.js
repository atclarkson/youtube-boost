const { google } = require('googleapis');

const { getClient } = require('./auth');
const { getPacificDateString } = require('./time');

const TRACKED_COUNTRIES = ['US', 'GB', 'CA', 'AU', 'NZ'];

async function createAnalyticsClient() {
  const auth = await getClient();

  return google.youtubeAnalytics({ version: 'v2', auth });
}

async function runQuery(params) {
  const analytics = await createAnalyticsClient();
  const response = await analytics.reports.query(params);

  return response.data.rows || [];
}

function formatDate(value) {
  return getPacificDateString(value);
}

function getTodayDate() {
  return formatDate(new Date());
}

async function getVideoAnalytics(youtubeId, startDate, endDate) {
  const rows = await runQuery({
    ids: 'channel==MINE',
    dimensions: 'video',
    filters: `video==${youtubeId}`,
    metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage',
    startDate,
    endDate
  });

  const row = rows[0] || [];

  return {
    views: Number(row[1] || 0),
    watch_time_minutes: Number(row[2] || 0),
    avg_view_duration: Number(row[3] || 0),
    avg_view_percentage: Number(row[4] || 0)
  };
}

async function getVideoGeoAnalytics(youtubeId, startDate, endDate) {
  const rows = await runQuery({
    ids: 'channel==MINE',
    dimensions: 'video,country',
    filters: `video==${youtubeId}`,
    metrics: 'views,estimatedMinutesWatched',
    startDate,
    endDate
  });

  const result = {
    views_us: 0,
    watch_time_us: 0,
    views_gb: 0,
    watch_time_gb: 0,
    views_ca: 0,
    watch_time_ca: 0,
    views_au: 0,
    watch_time_au: 0,
    views_nz: 0,
    watch_time_nz: 0
  };

  for (const row of rows) {
    const country = row[1];

    if (!TRACKED_COUNTRIES.includes(country)) {
      continue;
    }

    const views = Number(row[2] || 0);
    const watchTime = Number(row[3] || 0);
    const key = country.toLowerCase();

    result[`views_${key}`] = views;
    result[`watch_time_${key}`] = watchTime;
  }

  return result;
}

async function getVideoSearchAnalytics(youtubeId, startDate, endDate) {
  const rows = await runQuery({
    ids: 'channel==MINE',
    dimensions: 'video,insightTrafficSourceType',
    filters: `video==${youtubeId}`,
    metrics: 'views,estimatedMinutesWatched',
    startDate,
    endDate
  });

  const searchRow = rows.find((row) => row[1] === 'YT_SEARCH') || [];

  return {
    search_views: Number(searchRow[2] || 0),
    search_watch_time: Number(searchRow[3] || 0)
  };
}

async function getVideoLifetimeAnalytics(youtubeId, publishedAt) {
  return getVideoAnalytics(youtubeId, formatDate(publishedAt), getTodayDate());
}

async function getVideoLifetimeGeoAnalytics(youtubeId, publishedAt) {
  return getVideoGeoAnalytics(youtubeId, formatDate(publishedAt), getTodayDate());
}

async function getVideoLifetimeSearchAnalytics(youtubeId, publishedAt) {
  return getVideoSearchAnalytics(
    youtubeId,
    formatDate(publishedAt),
    getTodayDate()
  );
}

module.exports = {
  getVideoAnalytics,
  getVideoGeoAnalytics,
  getVideoSearchAnalytics,
  getVideoLifetimeAnalytics,
  getVideoLifetimeGeoAnalytics,
  getVideoLifetimeSearchAnalytics
};
