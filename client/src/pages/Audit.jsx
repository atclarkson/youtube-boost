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

function formatPublishedDate(value) {
  if (!value) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric'
  }).format(new Date(value));
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

function getEvergreenClass(value) {
  if (value === 'high') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (value === 'medium') {
    return 'bg-amber-100 text-amber-700';
  }

  return 'bg-slate-100 text-slate-700';
}

function parseBreakdown(value) {
  try {
    return JSON.parse(value || '{}');
  } catch (error) {
    return {};
  }
}

function Audit() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [expandedVideoId, setExpandedVideoId] = useState(null);

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

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Thumbnail</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Title</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Published</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Age</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Score</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Primary Problem</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Evergreen</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((video, index) => {
              const isExpanded = expandedVideoId === video.id;
              const breakdown = parseBreakdown(video.audit_score_breakdown);
              const score = Number(video.audit_score || 0);
              const rowClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';

              return (
                <Fragment key={video.id}>
                  <tr
                    className={`${rowClass} cursor-pointer transition hover:bg-blue-50`}
                    onClick={() =>
                      setExpandedVideoId(isExpanded ? null : video.id)
                    }
                  >
                    <td className="px-4 py-4 align-top">
                      <img
                        src={`https://img.youtube.com/vi/${video.youtube_id}/default.jpg`}
                        alt={video.title_current || 'Video thumbnail'}
                        width="120"
                        height="90"
                        className="rounded-md object-cover"
                      />
                    </td>
                    <td className="px-4 py-4 align-top text-sm font-medium text-gray-900">
                      {video.title_current}
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-gray-600">{formatPublishedDate(video.published_at)}</td>
                    <td className="px-4 py-4 align-top text-sm text-gray-600">{formatAge(video.published_at)}</td>
                    <td className="px-4 py-4 align-top">
                      <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${getScoreClass(score)}`}>
                        {video.audit_score ?? '0'}
                      </span>
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-gray-700">
                      {problemLabels[video.primary_problem] || 'Not Scored'}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${getEvergreenClass(video.evergreen_potential)}`}>
                        {evergreenLabels[video.evergreen_potential] || 'Low'}
                      </span>
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-gray-600">{statusLabels[video.audit_status] || 'Pending'}</td>
                  </tr>
                  {isExpanded ? (
                    <tr key={`${video.id}-expanded`} className="bg-gray-50">
                      <td colSpan="8" className="px-4 py-4">
                        <div className="space-y-4 rounded-lg bg-gray-50 p-4">
                          <div>
                            <strong className="text-sm text-gray-900">Score Breakdown</strong>
                            <pre className="mt-2 overflow-x-auto rounded-md bg-white p-4 text-sm text-gray-700 ring-1 ring-gray-200">
                              {JSON.stringify(breakdown, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <strong className="text-sm text-gray-900">Reason</strong>
                            <p className="mt-2 text-sm text-gray-700">
                              {video.audit_score_reason || 'Scoring failed'}
                            </p>
                          </div>
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
