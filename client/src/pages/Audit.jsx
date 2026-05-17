import { Fragment, useEffect, useState } from 'react';
import axios from 'axios';

const problemLabels = {
  low_ctr: 'Low CTR',
  poor_discoverability: 'Poor Discoverability',
  dated_language: 'Dated Language',
  weak_keywords: 'Weak Keywords',
  good_as_is: 'Good As Is'
};

const evergreenLabels = {
  high: 'High',
  medium: 'Medium',
  low: 'Low'
};

const statusLabels = {
  not_scored: 'Not Scored',
  pending: 'Pending',
  applied: 'Applied',
  reverted: 'Reverted'
};

const sortableColumns = {
  title: 'Title',
  published: 'Published',
  age: 'Age',
  views: 'Views',
  performance: 'Performance',
  score: 'Score',
  primary_problem: 'Primary Problem',
  evergreen_potential: 'Evergreen',
  audit_status: 'Status',
  actions: 'Actions'
};

function formatPublishedDate(value) {
  if (!value) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value));
}

function formatDuration(seconds) {
  const totalSeconds = Number(seconds || 0);

  if (!totalSeconds) {
    return '0:00';
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function formatAge(value) {
  if (!value) {
    return 'Unknown';
  }

  const publishedDate = new Date(value);
  const ageInYears = Math.max(
    0,
    Math.floor((Date.now() - publishedDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25))
  );

  if (ageInYears === 0) {
    return 'Under 1 year';
  }

  return `${ageInYears} year${ageInYears === 1 ? '' : 's'}`;
}

function getScoreClass(score) {
  if (score >= 8) {
    return 'bg-red-500 text-white';
  }

  if (score >= 5) {
    return 'bg-yellow-500 text-white';
  }

  return 'bg-green-500 text-white';
}

function isUnscored(video) {
  return (
    video.audit_score == null ||
    Number(video.audit_score) === 0 ||
    video.primary_problem == null ||
    video.primary_problem === 'not_scored'
  );
}

function getEvergreenClass(value) {
  if (value === 'high') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (value === 'medium') {
    return 'bg-amber-100 text-amber-700';
  }

  return 'bg-slate-100 text-slate-700';
}

function formatViews(value) {
  if (value == null) {
    return '—';
  }

  return new Intl.NumberFormat('en-US').format(Number(value));
}

function parseBreakdown(value) {
  try {
    return JSON.parse(value || '{}');
  } catch (error) {
    return {};
  }
}

function getVideoAgeMs(value) {
  if (!value) {
    return 0;
  }

  return Date.now() - new Date(value).getTime();
}

function getAgeInDays(value) {
  if (!value) {
    return 1;
  }

  return Math.max(1, Math.floor(getVideoAgeMs(value) / (1000 * 60 * 60 * 24)));
}

function getViewsPerDay(video) {
  if (video.view_count == null) {
    return null;
  }

  return Number(video.view_count) / getAgeInDays(video.published_at);
}

function getMedian(values) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function getPerformanceData(video, medianViewsPerDay) {
  const viewsPerDay = getViewsPerDay(video);

  if (viewsPerDay == null || medianViewsPerDay == null) {
    return { label: '—', className: 'text-gray-400', sortValue: -1 };
  }

  if (viewsPerDay >= medianViewsPerDay * 2) {
    return {
      label: 'Strong',
      className: 'bg-emerald-100 text-emerald-700',
      sortValue: 3
    };
  }

  if (viewsPerDay >= medianViewsPerDay * 0.5) {
    return {
      label: 'Average',
      className: 'bg-yellow-100 text-yellow-700',
      sortValue: 2
    };
  }

  return {
    label: 'Weak',
    className: 'bg-red-100 text-red-700',
    sortValue: 1
  };
}

function getSortValue(video, column, medianViewsPerDay) {
  switch (column) {
    case 'title':
      return video.title_current || '';
    case 'published':
      return video.published_at || '';
    case 'age':
      return getVideoAgeMs(video.published_at);
    case 'views':
      return video.view_count == null ? -1 : Number(video.view_count);
    case 'performance':
      return getPerformanceData(video, medianViewsPerDay).sortValue;
    case 'score':
      return isUnscored(video) ? -1 : Number(video.audit_score || 0);
    case 'primary_problem':
      return problemLabels[video.primary_problem] || 'Not Scored';
    case 'evergreen_potential':
      return evergreenLabels[video.evergreen_potential] || 'Low';
    case 'audit_status':
      return statusLabels[video.audit_status] || 'Pending';
    case 'actions':
      return '';
    default:
      return '';
  }
}

function compareVideos(a, b, column, direction, medianViewsPerDay) {
  if (column === 'actions') {
    return 0;
  }

  const left = getSortValue(a, column, medianViewsPerDay);
  const right = getSortValue(b, column, medianViewsPerDay);

  if (typeof left === 'number' && typeof right === 'number') {
    return direction === 'asc' ? left - right : right - left;
  }

  const comparison = String(left).localeCompare(String(right), undefined, {
    sensitivity: 'base'
  });

  return direction === 'asc' ? comparison : -comparison;
}

function Audit() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [expandedVideoId, setExpandedVideoId] = useState(null);
  const [scoringVideoId, setScoringVideoId] = useState(null);
  const [sortColumn, setSortColumn] = useState('score');
  const [sortDirection, setSortDirection] = useState('desc');
  const [contentFilter, setContentFilter] = useState('all');

  async function loadAudit() {
    try {
      setLoading(true);
      setMessage('');

      const response = await axios.get('/api/videos/audit');
      setVideos(response.data);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to load audit.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAudit();
  }, []);

  function handleSort(column) {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      return;
    }

    setSortColumn(column);
    setSortDirection(column === 'title' ? 'asc' : 'desc');
  }

  function getSortIndicator(column) {
    if (sortColumn !== column) {
      return '';
    }

    return sortDirection === 'asc' ? '↑' : '↓';
  }

  function renderSpinner() {
    return (
      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/50 border-t-white" />
    );
  }

  async function handleScoreVideo(event, youtubeId) {
    event.stopPropagation();

    try {
      setScoringVideoId(youtubeId);
      setMessage('');

      const response = await axios.post(`/api/videos/${youtubeId}/score`);
      const updatedVideo = response.data;

      setVideos((currentVideos) =>
        currentVideos.map((video) =>
          video.youtube_id === youtubeId ? { ...video, ...updatedVideo } : video
        )
      );
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to score video.');
    } finally {
      setScoringVideoId(null);
    }
  }

  const visibleVideos = videos
    .filter((video) => {
      if (contentFilter === 'shorts') {
        return Number(video.duration_seconds || 0) < 180;
      }

      if (contentFilter === 'long_form') {
        return Number(video.duration_seconds || 0) >= 180;
      }

      return true;
    });
  const medianViewsPerDay = getMedian(
    visibleVideos
      .map((video) => getViewsPerDay(video))
      .filter((value) => value != null)
  );
  const sortedVideos = [...visibleVideos].sort((left, right) =>
    compareVideos(left, right, sortColumn, sortDirection, medianViewsPerDay)
  );

  if (loading) {
    return <h1 className="text-3xl font-semibold text-gray-900">Loading Audit...</h1>;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Audit</h1>
          <p className="mt-2 text-sm text-gray-500">Videos are sorted by audit score descending.</p>
        </div>
        <button
          onClick={loadAudit}
          className="rounded bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
        >
          Refresh Audit
        </button>
      </div>

      {message ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setContentFilter('all')}
          className={`rounded px-4 py-2 text-sm font-medium transition ${
            contentFilter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setContentFilter('long_form')}
          className={`rounded px-4 py-2 text-sm font-medium transition ${
            contentFilter === 'long_form'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'
          }`}
        >
          Long Form
        </button>
        <button
          onClick={() => setContentFilter('shorts')}
          className={`rounded px-4 py-2 text-sm font-medium transition ${
            contentFilter === 'shorts'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'
          }`}
        >
          Shorts
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full table-fixed divide-y divide-gray-200">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 sm:px-3">Thumbnail</th>
              {Object.entries(sortableColumns).map(([column, label]) => (
                <th key={column} className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 sm:px-3">
                  {column === 'actions' ? (
                    <span>{label}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSort(column)}
                      className="inline-flex items-center gap-1 text-left hover:text-gray-900"
                    >
                      <span>{label}</span>
                      <span className="text-xs">{getSortIndicator(column)}</span>
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedVideos.map((video, index) => {
              const isExpanded = expandedVideoId === video.id;
              const breakdown = parseBreakdown(video.audit_score_breakdown);
              const score = Number(video.audit_score || 0);
              const unscored = isUnscored(video);
              const performance = getPerformanceData(video, medianViewsPerDay);
              const rowClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';

              return (
                <Fragment key={video.id}>
                  <tr
                    className={`${rowClass} cursor-pointer transition hover:bg-blue-50`}
                    onClick={() =>
                      setExpandedVideoId(isExpanded ? null : video.id)
                    }
                  >
                    <td className="px-2 py-2 align-top sm:px-3">
                      <div className="relative w-[120px] overflow-hidden rounded-md">
                        <img
                          src={`https://img.youtube.com/vi/${video.youtube_id}/default.jpg`}
                          alt={video.title_current || 'Video thumbnail'}
                          width="120"
                          height="90"
                          className="rounded-md object-cover"
                        />
                        <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium leading-none text-white">
                          {formatDuration(video.duration_seconds)}
                        </span>
                      </div>
                    </td>
                    <td className="w-full max-w-0 px-2 py-2 align-top text-sm font-medium text-gray-900 sm:px-3">
                      <div className="truncate">{video.title_current}</div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 align-top text-sm text-gray-600 sm:px-3">{formatPublishedDate(video.published_at)}</td>
                    <td className="whitespace-nowrap px-2 py-2 align-top text-sm text-gray-600 sm:px-3">{formatAge(video.published_at)}</td>
                    <td className="whitespace-nowrap px-2 py-2 align-top text-sm text-gray-600 sm:px-3">{formatViews(video.view_count)}</td>
                    <td className="whitespace-nowrap px-2 py-2 align-top sm:px-3">
                      {performance.label === '—' ? (
                        <span className="text-sm text-gray-400">—</span>
                      ) : (
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${performance.className}`}>
                          {performance.label}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 align-top sm:px-3">
                      {unscored ? (
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                          N/A
                        </span>
                      ) : (
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getScoreClass(score)}`}>
                          {video.audit_score}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 align-top text-sm text-gray-700 sm:px-3">
                      <div className="max-w-[10rem] truncate">
                        {problemLabels[video.primary_problem] || 'Not Scored'}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 align-top sm:px-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getEvergreenClass(video.evergreen_potential)}`}>
                        {evergreenLabels[video.evergreen_potential] || 'Low'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 align-top text-sm text-gray-600 sm:px-3">{statusLabels[video.audit_status] || 'Pending'}</td>
                    <td className="whitespace-nowrap px-2 py-2 align-top sm:px-3">
                      <button
                        type="button"
                        onClick={(event) => handleScoreVideo(event, video.youtube_id)}
                        disabled={scoringVideoId === video.youtube_id}
                        className="inline-flex min-w-[80px] items-center justify-center gap-2 rounded bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-slate-900 disabled:cursor-wait disabled:bg-slate-500"
                      >
                        {scoringVideoId === video.youtube_id ? renderSpinner() : null}
                        <span>{video.audit_score ? 'Rescore' : 'Score'}</span>
                      </button>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr key={`${video.id}-expanded`} className="bg-gray-50">
                      <td colSpan="11" className="px-3 py-3">
                        <div className="space-y-4 rounded-lg bg-gray-50 p-4">
                          <div>
                            <strong className="text-sm text-gray-900">Score Breakdown</strong>
                            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                              <div className="rounded-lg bg-white p-4 ring-1 ring-gray-200">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Base Score</p>
                                <p className="mt-2 text-2xl font-semibold text-gray-900">{breakdown.base_score ?? '0'}</p>
                              </div>
                              <div className="rounded-lg bg-white p-4 ring-1 ring-gray-200">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Age Bonus</p>
                                <p className="mt-2 text-2xl font-semibold text-gray-900">{breakdown.age_bonus ?? '0'}</p>
                              </div>
                              <div className="rounded-lg bg-white p-4 ring-1 ring-gray-200">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Final Score</p>
                                <p className="mt-2 text-2xl font-semibold text-gray-900">{breakdown.final_score ?? '0'}</p>
                              </div>
                              <div className="rounded-lg bg-white p-4 ring-1 ring-gray-200">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Internal Score</p>
                                <p className="mt-2 text-2xl font-semibold text-gray-900">{breakdown.internal_score ?? '0'}</p>
                              </div>
                              <div className="rounded-lg bg-white p-4 ring-1 ring-gray-200">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">CTR Assessment</p>
                                <p className="mt-2 text-sm text-gray-700">{breakdown.ctr_assessment || 'Not available'}</p>
                              </div>
                              <div className="rounded-lg bg-white p-4 ring-1 ring-gray-200">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Keyword Quality</p>
                                <p className="mt-2 text-sm text-gray-700">{breakdown.keyword_quality || 'Not available'}</p>
                              </div>
                              <div className="rounded-lg bg-white p-4 ring-1 ring-gray-200">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Title Clarity</p>
                                <p className="mt-2 text-sm text-gray-700">{breakdown.title_clarity || 'Not available'}</p>
                              </div>
                              <div className="rounded-lg bg-white p-4 ring-1 ring-gray-200">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Evergreen Topic</p>
                                <p className="mt-2 text-sm text-gray-700">{breakdown.evergreen_topic || 'Not available'}</p>
                              </div>
                              <div className="rounded-lg bg-white p-4 ring-1 ring-gray-200">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Content Type</p>
                                <p className="mt-2 text-sm text-gray-700">{breakdown.content_type || 'Unknown'}</p>
                              </div>
                              <div className="rounded-lg bg-white p-4 ring-1 ring-gray-200">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Era</p>
                                <p className="mt-2 text-sm text-gray-700">{breakdown.era || 'Unknown'}</p>
                              </div>
                              <div className="rounded-lg bg-white p-4 ring-1 ring-gray-200 md:col-span-2 xl:col-span-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Relative Performance</p>
                                <p className="mt-2 text-sm text-gray-700">
                                  {breakdown.relative_performance_note || 'Not available'}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div>
                            <strong className="text-sm text-gray-900">Reason</strong>
                            <blockquote className="mt-2 rounded-r-lg border-l-4 border-blue-400 bg-white px-4 py-3 text-sm italic text-gray-700 ring-1 ring-gray-200">
                              {video.audit_score_reason || 'Scoring failed'}
                            </blockquote>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                window.alert('Batch flow is not implemented yet.');
                              }}
                              className="rounded bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
                            >
                              Add to Batch
                            </button>
                            <button
                              type="button"
                              onClick={(event) => handleScoreVideo(event, video.youtube_id)}
                              disabled={scoringVideoId === video.youtube_id}
                              className="inline-flex items-center justify-center gap-2 rounded bg-slate-800 px-4 py-2 text-white transition hover:bg-slate-900 disabled:cursor-wait disabled:bg-slate-500"
                            >
                              {scoringVideoId === video.youtube_id ? renderSpinner() : null}
                              <span>{video.audit_score ? 'Rescore' : 'Score'}</span>
                            </button>
                          </div>
                          <p className="text-sm italic text-gray-500">
                            Performance scoring will improve in Phase 4 when watch time and CTR data is available from YouTube Analytics.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default Audit;
