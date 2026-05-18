import { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { PACIFIC_TIME_ZONE, getPacificDateKey, parseAppDate } from '../lib/time.js';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

function formatShortDate(value) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TIME_ZONE,
    month: 'short',
    day: 'numeric'
  }).format(parseAppDate(value));
}

function buildGeoData(snapshot) {
  return [
    { country: 'US', views: snapshot?.views_us || 0 },
    { country: 'GB', views: snapshot?.views_gb || 0 },
    { country: 'CA', views: snapshot?.views_ca || 0 },
    { country: 'AU', views: snapshot?.views_au || 0 },
    { country: 'NZ', views: snapshot?.views_nz || 0 }
  ];
}

function formatToastClass(type) {
  if (type === 'success') {
    return 'bg-emerald-50 text-emerald-700';
  }

  return 'bg-red-50 text-red-700';
}

function formatOneDecimal(value) {
  return Number(value || 0).toFixed(1);
}

function Monitoring() {
  const [monitoredVideos, setMonitoredVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [expandedVideoId, setExpandedVideoId] = useState(null);
  const [detailsByVideoId, setDetailsByVideoId] = useState({});
  const [loadingDetailId, setLoadingDetailId] = useState(null);
  const [snapshottingVideoId, setSnapshottingVideoId] = useState(null);
  const [revertingVideoId, setRevertingVideoId] = useState(null);

  async function loadSummary() {
    try {
      setLoading(true);
      setMessage(null);

      const response = await axios.get('/api/monitoring/summary');
      setMonitoredVideos(response.data);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to load monitoring.'
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  async function loadDetail(videoId) {
    try {
      setLoadingDetailId(videoId);
      const response = await axios.get(`/api/monitoring/${videoId}`);

      setDetailsByVideoId((current) => ({
        ...current,
        [videoId]: response.data
      }));
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to load monitoring detail.'
      });
    } finally {
      setLoadingDetailId(null);
    }
  }

  async function handleToggle(videoId) {
    const nextExpanded = expandedVideoId === videoId ? null : videoId;
    setExpandedVideoId(nextExpanded);

    if (nextExpanded && !detailsByVideoId[videoId]) {
      await loadDetail(videoId);
    }
  }

  async function handleSnapshot(event, videoId) {
    event.stopPropagation();

    try {
      setSnapshottingVideoId(videoId);
      setMessage(null);

      await axios.post(`/api/monitoring/${videoId}/snapshot`);
      await Promise.all([loadSummary(), loadDetail(videoId)]);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to take snapshot.'
      });
    } finally {
      setSnapshottingVideoId(null);
    }
  }

  async function handleRevertAndRetry(event, video) {
    event.stopPropagation();

    const confirmed = window.confirm(
      'This will revert the title back to the original on YouTube and remove this optimization from monitoring. You can then generate new options. Continue?'
    );

    if (!confirmed) {
      return;
    }

    try {
      setRevertingVideoId(video.id);
      setMessage(null);

      await axios.post(`/api/optimizations/${video.optimization_id}/revert`);
      setMonitoredVideos((current) =>
        current.filter((item) => item.id !== video.id)
      );
      setDetailsByVideoId((current) => {
        const next = { ...current };
        delete next[video.id];
        return next;
      });
      if (expandedVideoId === video.id) {
        setExpandedVideoId(null);
      }
      setMessage({
        type: 'success',
        text: 'Optimization reverted and removed from monitoring.'
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to revert optimization.'
      });
    } finally {
      setRevertingVideoId(null);
    }
  }

  if (loading) {
    return <h1 className="text-3xl font-semibold text-gray-900">Loading Monitoring...</h1>;
  }

  if (monitoredVideos.length === 0) {
    return (
      <section className="rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-gray-200">
        <h1 className="text-3xl font-semibold text-gray-900">Monitoring</h1>
        <p className="mt-4 text-gray-600">
          No videos are being monitored yet. Once an optimization is applied, daily snapshots will show up here.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-gray-900">Monitoring</h1>
        <p className="mt-2 text-sm text-gray-500">
          Track post-optimization performance over the 30-day monitoring window.
        </p>
      </div>

      {message ? (
        <p className={`rounded-lg px-4 py-3 text-sm ${formatToastClass(message.type)}`}>
          {message.text}
        </p>
      ) : null}

      <div className="space-y-4">
        {monitoredVideos.map((video) => {
          const isExpanded = expandedVideoId === video.id;
          const detail = detailsByVideoId[video.id];
          const snapshots = detail?.snapshots || [];
          const chartData = snapshots.map((snapshot) => ({
            date: snapshot.snapshot_date,
            label: formatShortDate(snapshot.snapshot_date),
            views: snapshot.views || 0,
            watch_time_minutes: snapshot.watch_time_minutes || 0
          }));
          const latestSnapshot =
            snapshots[snapshots.length - 1] || video.latest_snapshot || null;
          const searchPercentage =
            latestSnapshot && latestSnapshot.views
              ? ((latestSnapshot.search_views || 0) / latestSnapshot.views) * 100
              : 0;

          return (
            <div
              key={video.id}
              className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200"
            >
              <button
                type="button"
                onClick={() => handleToggle(video.id)}
                className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-gray-50"
              >
                <img
                  src={`https://img.youtube.com/vi/${video.youtube_id}/default.jpg`}
                  alt={video.title_current || 'Video thumbnail'}
                  className="h-20 w-28 rounded-md object-cover"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/video/${video.youtube_id}`}
                    onClick={(event) => event.stopPropagation()}
                    className="block truncate text-lg font-semibold text-gray-900 no-underline hover:underline"
                  >
                    {video.title_current}
                  </Link>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
                    <span>Days since optimization: {video.days_since_optimization}</span>
                    <span>Days remaining: {video.days_remaining}</span>
                  </div>
                </div>
              </button>

              {isExpanded ? (
                <div className="border-t border-gray-200 bg-gray-50 px-5 py-5">
                  {loadingDetailId === video.id && !detail ? (
                    <p className="text-sm text-gray-500">Loading charts...</p>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-gray-600">
                          Applied on{' '}
                          {video.applied_at
                            ? new Intl.DateTimeFormat('en-US', {
                                timeZone: PACIFIC_TIME_ZONE,
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              }).format(parseAppDate(video.applied_at))
                            : '—'}
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={(event) => handleSnapshot(event, video.id)}
                            disabled={snapshottingVideoId === video.id}
                            className="rounded bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-400"
                          >
                            {snapshottingVideoId === video.id ? 'Taking Snapshot...' : 'Take Snapshot Now'}
                          </button>
                          <button
                            type="button"
                            onClick={(event) => handleRevertAndRetry(event, video)}
                            disabled={revertingVideoId === video.id}
                            className="rounded bg-orange-600 px-4 py-2 text-sm text-white transition hover:bg-orange-700 disabled:cursor-wait disabled:bg-orange-400"
                          >
                            {revertingVideoId === video.id ? 'Reverting...' : 'Revert & Retry'}
                          </button>
                        </div>
                      </div>

                      <div className="grid gap-6 xl:grid-cols-2">
                        <div className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
                          <h3 className="text-sm font-semibold text-gray-900">Views Over Time</h3>
                          <div className="mt-4 h-72">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" tickFormatter={formatShortDate} />
                                <YAxis />
                                <Tooltip />
                                {video.applied_at ? (
                                  <ReferenceLine
                                    x={getPacificDateKey(video.applied_at)}
                                    stroke="#2563eb"
                                    strokeDasharray="4 4"
                                    label="Applied"
                                  />
                                ) : null}
                                <Line
                                  type="monotone"
                                  dataKey="views"
                                  stroke="#2563eb"
                                  strokeWidth={2}
                                  dot={false}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        <div className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
                          <h3 className="text-sm font-semibold text-gray-900">Watch Time</h3>
                          <div className="mt-4 h-72">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" tickFormatter={formatShortDate} />
                                <YAxis />
                                <Tooltip />
                                {video.applied_at ? (
                                  <ReferenceLine
                                    x={getPacificDateKey(video.applied_at)}
                                    stroke="#0f766e"
                                    strokeDasharray="4 4"
                                    label="Applied"
                                  />
                                ) : null}
                                <Line
                                  type="monotone"
                                  dataKey="watch_time_minutes"
                                  stroke="#0f766e"
                                  strokeWidth={2}
                                  dot={false}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
                        <div className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
                          <h3 className="text-sm font-semibold text-gray-900">Geo Breakdown</h3>
                          <div className="mt-4 h-72">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={buildGeoData(latestSnapshot)}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="country" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="views" fill="#7c3aed" radius={[6, 6, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        <div className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
                          <h3 className="text-sm font-semibold text-gray-900">Search Share</h3>
                          <div className="mt-6">
                            <p className="text-4xl font-semibold text-gray-900">
                              {Number.isFinite(searchPercentage)
                                ? `${searchPercentage.toFixed(1)}%`
                                : '0.0%'}
                            </p>
                            <p className="mt-2 text-sm text-gray-600">
                              Search views vs total views from the latest snapshot.
                            </p>
                            <dl className="mt-6 space-y-3 text-sm text-gray-700">
                              <div className="flex justify-between gap-4">
                                <dt>Total views</dt>
                                <dd>{latestSnapshot?.views || 0}</dd>
                              </div>
                              <div className="flex justify-between gap-4">
                                <dt>Search views</dt>
                                <dd>{latestSnapshot?.search_views || 0}</dd>
                              </div>
                              <div className="flex justify-between gap-4">
                                <dt>Avg View %</dt>
                                <dd>{formatOneDecimal(latestSnapshot?.avg_view_percentage)}%</dd>
                              </div>
                            </dl>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default Monitoring;
