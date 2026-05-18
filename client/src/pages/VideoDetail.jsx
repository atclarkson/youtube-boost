import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { PACIFIC_TIME_ZONE, parseAppDate } from '../lib/time.js';

const breakdownLabels = {
  base_score: 'Base Score',
  age_bonus: 'Age Bonus',
  final_score: 'Final Score',
  internal_score: 'Internal Score',
  ctr_assessment: 'CTR Assessment',
  keyword_quality: 'Keyword Quality',
  title_clarity: 'Title Clarity',
  evergreen_topic: 'Evergreen Topic',
  content_type: 'Content Type',
  era: 'Era',
  relative_performance_note: 'Relative Performance'
};

function parseBreakdown(value) {
  try {
    return JSON.parse(value || '{}');
  } catch (error) {
    return {};
  }
}

function parseExplanation(value) {
  try {
    if (!value) {
      return null;
    }

    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch (error) {
    return null;
  }
}

function formatDate(value) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TIME_ZONE,
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(parseAppDate(value));
}

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(parseAppDate(value));
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(Number(value || 0));
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Math.round(Number(seconds || 0)));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function getScoreClass(score) {
  if (score >= 8) {
    return 'bg-red-500 text-white';
  }

  if (score >= 5) {
    return 'bg-yellow-500 text-white';
  }

  return 'bg-slate-300 text-slate-700';
}

function getOptimizationStatusClass(status) {
  switch (status) {
    case 'approved':
      return 'bg-blue-100 text-blue-700';
    case 'applied':
      return 'bg-emerald-100 text-emerald-700';
    case 'reverted':
      return 'bg-orange-100 text-orange-700';
    case 'skipped':
      return 'bg-slate-100 text-slate-600';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function getHundredScoreClass(score) {
  if (Number(score || 0) >= 70) {
    return 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200';
  }

  if (Number(score || 0) >= 40) {
    return 'bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200';
  }

  return 'bg-red-100 text-red-700 ring-1 ring-red-200';
}

function getAgeComponent(publishedAt) {
  if (!publishedAt) {
    return 5;
  }

  const publishedDate = new Date(publishedAt);
  const ageInDays = Math.max(1, (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60 * 24));
  const ageInYears = ageInDays / 365.25;

  if (ageInYears >= 3) {
    return 25;
  }

  if (ageInYears >= 2) {
    return 20;
  }

  if (ageInYears >= 1) {
    return 15;
  }

  if (ageInDays >= 183) {
    return 10;
  }

  return 5;
}

function getClaudeComponent(video) {
  const keywordScore = Number(video.keyword_score || 0);
  const clarityScore = Number(video.clarity_score || 0);
  const evergreenScore = Number(video.evergreen_score || 0);

  return ((keywordScore * 0.45 + clarityScore * 0.35 + evergreenScore * 0.2) / 100) * 30;
}

function getFixabilityComponent(snapshot) {
  const avgViewPercentage = snapshot ? Number(snapshot.avg_view_percentage) : null;

  if (avgViewPercentage == null || Number.isNaN(avgViewPercentage)) {
    return 5;
  }

  if (avgViewPercentage >= 35) {
    return 10;
  }

  if (avgViewPercentage >= 25) {
    return 7;
  }

  if (avgViewPercentage >= 15) {
    return 4;
  }

  return 1;
}

function normalizeOptimization(optimization, video) {
  if (optimization.video) {
    return optimization;
  }

  return {
    ...optimization,
    video: {
      id: video.id,
      youtube_id: video.youtube_id,
      title_current: video.title_current,
      description_current: video.description_current,
      title_original: video.title_original,
      description_original: video.description_original
    }
  };
}

function getDaysRemaining(appliedAt) {
  if (!appliedAt) {
    return null;
  }

  const msSinceApplied = Date.now() - parseAppDate(appliedAt).getTime();
  const daysSinceApplied = Math.max(0, Math.floor(msSinceApplied / (1000 * 60 * 60 * 24)));

  return Math.max(0, 30 - daysSinceApplied);
}

function renderMetricCard(label, value) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function VideoDetail() {
  const { youtubeId } = useParams();
  const [detail, setDetail] = useState(null);
  const [retentionData, setRetentionData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retentionLoading, setRetentionLoading] = useState(true);
  const [retentionTimedOut, setRetentionTimedOut] = useState(false);
  const [message, setMessage] = useState('');
  const [scoring, setScoring] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);
  const [togglingHidden, setTogglingHidden] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [busyOptimizationId, setBusyOptimizationId] = useState(null);
  const [busyAction, setBusyAction] = useState('');
  const [drafts, setDrafts] = useState({});
  const [selectedOptions, setSelectedOptions] = useState({});
  const [expandedHistoryIds, setExpandedHistoryIds] = useState({});
  const [explainingScore, setExplainingScore] = useState(false);

  async function loadDetail() {
    const response = await axios.get(`/api/videos/${youtubeId}/detail`);
    const normalized = {
      ...response.data,
      optimizations: (response.data.optimizations || []).map((optimization) =>
        normalizeOptimization(optimization, response.data.video)
      )
    };

    setDetail(normalized);
  }

  async function loadRetention() {
    setRetentionLoading(true);
    setRetentionTimedOut(false);

    try {
      console.log('Retention fetch started', { youtubeId });
      const response = await axios.get(`/api/videos/${youtubeId}/retention`);
      setRetentionData(response.data || []);
      console.log('Retention fetch completed', {
        youtubeId,
        rows: Array.isArray(response.data) ? response.data.length : 0
      });
    } catch (error) {
      console.log('Retention fetch failed', {
        youtubeId,
        error: error.response?.data?.error || error.message
      });
      throw error;
    } finally {
      setRetentionLoading(false);
    }
  }

  async function loadPage() {
    try {
      setLoading(true);
      setMessage('');
      setDetail(null);
      setRetentionData([]);
      await loadDetail();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to load video detail.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, [youtubeId]);

  useEffect(() => {
    if (!detail?.video?.youtube_id || detail.video.youtube_id !== youtubeId) {
      return undefined;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      setRetentionTimedOut(true);
      setRetentionLoading(false);
    }, 25000);

    (async () => {
      try {
        await loadRetention();
      } catch (error) {
        if (!cancelled) {
          setRetentionTimedOut(true);
        }
      } finally {
        window.clearTimeout(timeoutId);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [detail?.video?.youtube_id, youtubeId]);

  const video = detail?.video;
  const optimizations = detail?.optimizations || [];
  const breakdown = useMemo(
    () => parseBreakdown(video?.audit_score_breakdown),
    [video?.audit_score_breakdown]
  );
  const latestAppliedOptimization = useMemo(
    () => optimizations.find((optimization) => optimization.status === 'applied') || null,
    [optimizations]
  );
  const activeComposerOptimization = useMemo(
    () =>
      optimizations.find(
        (optimization) =>
          optimization.status === 'pending' || optimization.status === 'approved'
      ) || null,
    [optimizations]
  );
  const lifetimeAnalytics = detail?.lifetime_analytics || null;
  const monitoringSnapshot = detail?.monitoring_snapshot || null;
  const explanation = parseExplanation(video?.score_explanation);
  const geoChartData = useMemo(
    () => [
      { country: 'US', views: monitoringSnapshot?.views_us || 0 },
      { country: 'GB', views: monitoringSnapshot?.views_gb || 0 },
      { country: 'CA', views: monitoringSnapshot?.views_ca || 0 },
      { country: 'AU', views: monitoringSnapshot?.views_au || 0 },
      { country: 'NZ', views: monitoringSnapshot?.views_nz || 0 }
    ],
    [monitoringSnapshot]
  );
  const retentionChartData = useMemo(
    () =>
      retentionData.map((point) => ({
        ratio: Math.round(Number(point.ratio || 0) * 100),
        audienceWatchRatio:
          Math.round(Number(point.audienceWatchRatio || 0) * 100 * 10) / 10,
        relativeRetentionPerformance:
          Math.round(Number(point.relativeRetentionPerformance || 0) * 100 * 10) / 10
      })),
    [retentionData]
  );
  const v2Components = useMemo(() => {
    if (!video || Number(video.scoring_version) !== 2) {
      return null;
    }

    const ageComponent = getAgeComponent(video.published_at);
    const claudeComponent = getClaudeComponent(video);
    const fixabilityComponent = getFixabilityComponent(monitoringSnapshot);
    const totalPoints = Number(video.audit_score || 0) * 10;
    const performanceGapComponent = Math.max(
      0,
      Math.min(35, totalPoints - ageComponent - claudeComponent - fixabilityComponent)
    );

    return {
      ageComponent,
      performanceGapComponent,
      claudeComponent,
      fixabilityComponent
    };
  }, [video, monitoringSnapshot]);

  function getDraftForOptimization(optimization) {
    return (
      drafts[optimization.id] || {
        chosen_title: optimization.chosen_title || '',
        chosen_description:
          optimization.chosen_description || optimization.video?.description_current || ''
      }
    );
  }

  function updateDraft(optimizationId, field, value) {
    setDrafts((current) => ({
      ...current,
      [optimizationId]: {
        ...(current[optimizationId] || {}),
        [field]: value
      }
    }));
  }

  function handleChooseOption(optimization, optionIndex, option) {
    setSelectedOptions((current) => ({ ...current, [optimization.id]: optionIndex }));
    setDrafts((current) => ({
      ...current,
      [optimization.id]: {
        chosen_title: option.title,
        chosen_description: optimization.video?.description_current || ''
      }
    }));
  }

  function replaceOptimization(updatedOptimization) {
    setDetail((current) => {
      if (!current) {
        return current;
      }

      const normalized = normalizeOptimization(updatedOptimization, current.video);

      return {
        ...current,
        optimizations: current.optimizations.map((optimization) =>
          optimization.id === normalized.id ? normalized : optimization
        )
      };
    });
  }

  async function handleRescore(version = 'v1') {
    try {
      setScoring(true);
      setMessage('');
      await axios.post(`/api/videos/${youtubeId}/${version === 'v2' ? 'score-v2' : 'score'}`);
      await loadDetail();
      setMessage(`Video rescored successfully${version === 'v2' ? ' with v2' : ''}.`);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to rescore video.');
    } finally {
      setScoring(false);
    }
  }

  async function handleExplainScore() {
    try {
      setExplainingScore(true);
      setMessage('');
      const response = await axios.post(`/api/videos/${youtubeId}/explain`);

      setDetail((current) =>
        current
          ? {
              ...current,
              video: {
                ...current.video,
                score_explanation: JSON.stringify(response.data)
              }
            }
          : current
      );
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to explain score.');
    } finally {
      setExplainingScore(false);
    }
  }

  async function handleSnapshot() {
    if (!video) {
      return;
    }

    try {
      setSnapshotting(true);
      setMessage('');
      await axios.post(`/api/monitoring/${video.id}/snapshot`);
      await loadDetail();
      setMessage('Snapshot captured successfully.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to take snapshot.');
    } finally {
      setSnapshotting(false);
    }
  }

  async function handleGenerateOptions() {
    try {
      setGenerating(true);
      setMessage('');
      const response = await axios.post(`/api/optimizations/generate/${youtubeId}`);
      const normalized = normalizeOptimization(response.data, video);

      setDetail((current) => ({
        ...current,
        optimizations: [normalized, ...(current?.optimizations || [])]
      }));
      setExpandedHistoryIds((current) => ({ ...current, [normalized.id]: true }));
      setMessage('New options generated.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to generate options.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleApprove(optimization) {
    const draft = getDraftForOptimization(optimization);

    if (!draft.chosen_title.trim()) {
      setMessage('Choose an option and confirm the title first.');
      return;
    }

    try {
      setBusyOptimizationId(optimization.id);
      setBusyAction('approve');
      setMessage('');

      const response = await axios.patch(`/api/optimizations/${optimization.id}/approve`, {
        chosen_title: draft.chosen_title,
        chosen_description: optimization.video?.description_current || ''
      });

      replaceOptimization(response.data);
      await loadDetail();
      setMessage('Optimization approved.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to approve optimization.');
    } finally {
      setBusyOptimizationId(null);
      setBusyAction('');
    }
  }

  async function handleApply(optimization, dryRun) {
    try {
      setBusyOptimizationId(optimization.id);
      setBusyAction(dryRun ? 'dryRun' : 'apply');
      setMessage('');

      const response = await axios.post(`/api/optimizations/${optimization.id}/apply`, {
        dryRun
      });

      if (dryRun) {
        setMessage(
          `Dry run: would update ${response.data.wouldUpdate.youtubeId} to "${response.data.wouldUpdate.title}".`
        );
      } else {
        await loadDetail();
        setMessage('Changes applied to YouTube successfully.');
      }
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to apply optimization.');
    } finally {
      setBusyOptimizationId(null);
      setBusyAction('');
    }
  }

  async function handleRevert(optimizationId) {
    const confirmed = window.confirm(
      'This will revert the title back to the original on YouTube. Continue?'
    );

    if (!confirmed) {
      return;
    }

    try {
      setBusyOptimizationId(optimizationId);
      setBusyAction('revert');
      setMessage('');
      await axios.post(`/api/optimizations/${optimizationId}/revert`);
      await loadDetail();
      setMessage('Optimization reverted.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to revert optimization.');
    } finally {
      setBusyOptimizationId(null);
      setBusyAction('');
    }
  }

  async function handleToggleHidden() {
    if (!video) {
      return;
    }

    try {
      setTogglingHidden(true);
      setMessage('');
      await axios.patch(
        `/api/videos/${youtubeId}/${Number(video.hidden) === 1 ? 'unhide' : 'hide'}`
      );
      await loadDetail();
      setMessage(Number(video.hidden) === 1 ? 'Video unhidden.' : 'Video hidden.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to update hidden state.');
    } finally {
      setTogglingHidden(false);
    }
  }

  if (loading) {
    return <section className="px-8 py-6 text-3xl font-semibold text-gray-900">Loading video...</section>;
  }

  if (!detail || !video) {
    return (
      <section className="px-8 py-6">
        <div className="rounded-2xl bg-red-50 p-6 text-red-700 ring-1 ring-red-200">
          {message || 'Video not found.'}
        </div>
      </section>
    );
  }

  const isLongForm = Number(video.duration_seconds || 0) >= 180;
  const era = String(video.published_at || '').slice(0, 4) || 'Unknown';
  const currentMonitoringDaysRemaining = latestAppliedOptimization
    ? getDaysRemaining(latestAppliedOptimization.applied_at)
    : null;

  return (
    <section className="w-full px-8 py-6">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/audit"
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Back to Audit
          </Link>
          <div className="flex flex-wrap gap-3">
            {detail.next_video ? (
              <Link
                to={`/video/${detail.next_video.youtube_id}`}
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                <div className="font-semibold text-gray-900">← Higher Score</div>
                <div className="mt-1 max-w-56 truncate">{detail.next_video.title_current}</div>
              </Link>
            ) : null}
            {detail.prev_video ? (
              <Link
                to={`/video/${detail.prev_video.youtube_id}`}
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-right text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                <div className="font-semibold text-gray-900">Lower Score →</div>
                <div className="mt-1 max-w-56 truncate">{detail.prev_video.title_current}</div>
              </Link>
            ) : null}
          </div>
        </div>

        {message ? (
          <div className="rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-700 ring-1 ring-blue-200">
            {message}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <div className="flex flex-col gap-6 lg:flex-row">
              <img
                src={`https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`}
                alt={video.title_current}
                className="h-52 w-full rounded-2xl object-cover lg:w-[360px]"
              />
              <div className="min-w-0 flex-1">
                <h1 className="text-3xl font-semibold text-gray-900">{video.title_current}</h1>
                {video.title_original && video.title_original !== video.title_current ? (
                  <p className="mt-3 text-sm text-gray-500">Original: {video.title_original}</p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase text-slate-700">
                    {video.privacy_status || 'unknown'}
                  </span>
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                    {isLongForm ? 'Long Form' : 'Short'}
                  </span>
                  <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
                    {era}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${getScoreClass(
                      Number(video.audit_score || 0)
                    )}`}
                  >
                    Audit Score {Number(video.audit_score || 0).toFixed(1)}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      Number(video.scoring_version) === 2
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {Number(video.scoring_version) === 2 ? 'v2' : 'v1 (legacy)'}
                  </span>
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <a
                    href={`https://studio.youtube.com/video/${youtubeId}/edit`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-black"
                  >
                    Open in YouTube Studio
                  </a>
                  <a
                    href={`https://youtube.com/watch?v=${youtubeId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
                  >
                    Open on YouTube
                  </a>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {renderMetricCard('Published', formatDate(video.published_at))}
                  {renderMetricCard('Views', formatNumber(video.view_count))}
                  {renderMetricCard('Hidden', Number(video.hidden) === 1 ? 'Yes' : 'No')}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Actions</h2>
            <div className="mt-5 space-y-4">
              <button
                type="button"
                onClick={handleGenerateOptions}
                disabled={generating}
                className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-400"
              >
                {generating ? 'Generating Options...' : 'Generate New Options'}
              </button>
              <button
                type="button"
                onClick={handleToggleHidden}
                disabled={togglingHidden}
                className="w-full rounded-lg bg-slate-200 px-4 py-3 text-sm font-medium text-slate-800 transition hover:bg-slate-300 disabled:cursor-wait disabled:bg-slate-100"
              >
                {togglingHidden
                  ? 'Updating...'
                  : Number(video.hidden) === 1
                    ? 'Unhide Video'
                    : 'Hide Video'}
              </button>
              {currentMonitoringDaysRemaining != null ? (
                <div className="rounded-2xl bg-emerald-50 px-4 py-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
                  Currently being monitored. {currentMonitoringDaysRemaining} day
                  {currentMonitoringDaysRemaining === 1 ? '' : 's'} remaining.
                </div>
              ) : null}
            </div>

            {activeComposerOptimization ? (
              <div className="mt-6 border-t border-gray-200 pt-6">
                <h3 className="text-lg font-semibold text-gray-900">Latest Option Set</h3>
                <div className="mt-4 grid gap-4 xl:grid-cols-3">
                  {activeComposerOptimization.options.map((option, index) => {
                    const isSelected = selectedOptions[activeComposerOptimization.id] === index;

                    return (
                      <div
                        key={`${activeComposerOptimization.id}-${index}`}
                        className={`flex h-full flex-col rounded-2xl border p-4 ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 bg-gray-50/70'
                        }`}
                      >
                        <h4 className="text-base font-semibold text-gray-900">{option.title}</h4>
                        <p className="mt-4 flex-1 text-sm leading-6 text-gray-600">
                          {option.reasoning}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            handleChooseOption(activeComposerOptimization, index, option)
                          }
                          className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-blue-700"
                        >
                          Choose This
                        </button>
                      </div>
                    );
                  })}
                </div>

                {(selectedOptions[activeComposerOptimization.id] != null ||
                  activeComposerOptimization.status !== 'pending') && (
                  <div className="mt-5 rounded-2xl bg-gray-50 p-5 ring-1 ring-gray-200">
                    <label className="block text-sm font-medium text-gray-700">Chosen title</label>
                    <input
                      value={getDraftForOptimization(activeComposerOptimization).chosen_title}
                      onChange={(event) =>
                        updateDraft(
                          activeComposerOptimization.id,
                          'chosen_title',
                          event.target.value
                        )
                      }
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500"
                    />

                    <div className="mt-4 flex flex-wrap gap-3">
                      {activeComposerOptimization.status === 'pending' ? (
                        <button
                          type="button"
                          onClick={() => handleApprove(activeComposerOptimization)}
                          disabled={busyOptimizationId === activeComposerOptimization.id}
                          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-wait disabled:bg-emerald-400"
                        >
                          {busyOptimizationId === activeComposerOptimization.id &&
                          busyAction === 'approve'
                            ? 'Approving...'
                            : 'Approve'}
                        </button>
                      ) : null}

                      {activeComposerOptimization.status === 'approved' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleApply(activeComposerOptimization, true)}
                            disabled={busyOptimizationId === activeComposerOptimization.id}
                            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-black disabled:cursor-wait disabled:bg-slate-500"
                          >
                            {busyOptimizationId === activeComposerOptimization.id &&
                            busyAction === 'dryRun'
                              ? 'Running Dry Run...'
                              : 'Dry Run'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApply(activeComposerOptimization, false)}
                            disabled={busyOptimizationId === activeComposerOptimization.id}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-400"
                          >
                            {busyOptimizationId === activeComposerOptimization.id &&
                            busyAction === 'apply'
                              ? 'Applying to YouTube...'
                              : 'Apply to YouTube'}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-gray-900">Audit</h2>
              <div className="flex flex-wrap gap-2">
                {Number(video.scoring_version) !== 2 ? (
                  <button
                    type="button"
                    onClick={() => handleRescore('v1')}
                    disabled={scoring}
                    className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-400"
                  >
                    {scoring ? 'Rescoring...' : 'Rescore (v1)'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRescore('v2')}
                    disabled={scoring}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-400"
                  >
                    {scoring ? 'Rescoring...' : 'Rescore (v2)'}
                  </button>
                )}
                {Number(video.scoring_version) !== 2 ? (
                  <button
                    type="button"
                    onClick={() => handleRescore('v2')}
                    disabled={scoring}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-400"
                  >
                    {scoring ? 'Upgrading...' : 'Upgrade to v2'}
                  </button>
                ) : null}
              </div>
            </div>
            {Number(video.scoring_version) === 2 ? (
              <div className="mt-5 space-y-5">
                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    { label: 'Keyword Score', value: video.keyword_score },
                    { label: 'Clarity Score', value: video.clarity_score },
                    { label: 'Evergreen Score', value: video.evergreen_score }
                  ].map((item) => (
                    <div
                      key={item.label}
                      className={`rounded-xl px-4 py-3 ${getHundredScoreClass(item.value)}`}
                    >
                      <div className="text-xs font-semibold uppercase tracking-wide">
                        {item.label}
                      </div>
                      <div className="mt-2 text-2xl font-semibold">
                        {Math.round(Number(item.value || 0))}/100
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: 'Age Component', value: v2Components?.ageComponent, max: 25 },
                    {
                      label: 'Performance Gap',
                      value: v2Components?.performanceGapComponent,
                      max: 35
                    },
                    { label: 'Claude Component', value: v2Components?.claudeComponent, max: 30 },
                    { label: 'Fixability', value: v2Components?.fixabilityComponent, max: 10 }
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                    >
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {item.label}
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-gray-900">
                        {typeof item.value === 'number' ? item.value.toFixed(1) : '—'}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">of {item.max}</div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                    {video.primary_problem || 'Unknown'}
                  </span>
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                    {isLongForm ? 'Long Form' : 'Short'}
                  </span>
                  <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
                    {era}
                  </span>
                </div>

                {explanation ? (
                  <div className="space-y-4 rounded-2xl bg-gray-50 p-5 ring-1 ring-gray-200">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-gray-700">Score explanation</div>
                      <button
                        type="button"
                        onClick={handleExplainScore}
                        disabled={explainingScore}
                        className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-gray-200 transition hover:bg-gray-50 disabled:cursor-wait disabled:bg-gray-100"
                      >
                        {explainingScore ? 'Getting explanation...' : 'Re-explain'}
                      </button>
                    </div>
                    <blockquote className="rounded-2xl border-l-4 border-blue-500 bg-blue-50 px-4 py-4 text-sm leading-6 text-blue-900">
                      {explanation.audit_score_reason}
                    </blockquote>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl bg-white p-4 ring-1 ring-gray-200">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Keyword Quality
                        </div>
                        <p className="mt-2 text-sm text-gray-700">
                          {explanation.keyword_quality_notes || '—'}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white p-4 ring-1 ring-gray-200">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Title Clarity
                        </div>
                        <p className="mt-2 text-sm text-gray-700">
                          {explanation.title_clarity_notes || '—'}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white p-4 ring-1 ring-gray-200">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Evergreen Potential
                        </div>
                        <p className="mt-2 text-sm text-gray-700">
                          {explanation.evergreen_notes || '—'}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white p-4 ring-1 ring-gray-200">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          CTR Assessment
                        </div>
                        <p className="mt-2 text-sm text-gray-700">
                          {explanation.ctr_assessment || '—'}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm italic text-gray-500">
                      {explanation.relative_performance_note || '—'}
                    </p>
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      onClick={handleExplainScore}
                      disabled={explainingScore}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-black disabled:cursor-wait disabled:bg-slate-500"
                    >
                      {explainingScore ? 'Getting explanation...' : 'Explain Score'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {Object.entries(breakdownLabels).map(([key, label]) => (
                    <div key={key} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {label}
                      </div>
                      <div className="mt-2 text-sm font-medium text-gray-900">
                        {breakdown[key] != null && breakdown[key] !== ''
                          ? String(breakdown[key])
                          : '—'}
                      </div>
                    </div>
                  ))}
                </div>
                <blockquote className="mt-5 rounded-2xl border-l-4 border-blue-500 bg-blue-50 px-4 py-4 text-sm leading-6 text-blue-900">
                  {video.audit_score_reason || 'No audit reason available.'}
                </blockquote>
              </>
            )}
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-gray-900">Latest Snapshot</h2>
              <button
                type="button"
                onClick={handleSnapshot}
                disabled={snapshotting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-400"
              >
                {snapshotting ? 'Taking Snapshot...' : 'Take Snapshot Now'}
              </button>
            </div>

            {monitoringSnapshot ? (
              <div className="mt-5 space-y-5">
                <div className="text-sm text-gray-500">
                  Captured on {formatDate(monitoringSnapshot.snapshot_date)}
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {renderMetricCard('Views', formatNumber(monitoringSnapshot.views))}
                  {renderMetricCard(
                    'Watch Time Minutes',
                    formatNumber(monitoringSnapshot.watch_time_minutes)
                  )}
                  {renderMetricCard('Avg View %', formatPercent(monitoringSnapshot.avg_view_percentage))}
                  {renderMetricCard('Search Views', formatNumber(monitoringSnapshot.search_views))}
                  {renderMetricCard(
                    'Subscribers Gained',
                    formatNumber(monitoringSnapshot.subscribers_gained)
                  )}
                  {renderMetricCard(
                    'Estimated Revenue',
                    formatCurrency(monitoringSnapshot.estimated_revenue)
                  )}
                  {renderMetricCard('CPM', formatCurrency(monitoringSnapshot.cpm))}
                  {renderMetricCard(
                    'Monetized Playbacks',
                    formatNumber(monitoringSnapshot.monetized_playbacks)
                  )}
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">Geo Breakdown</h3>
                  <div className="mt-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={geoChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="country" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="views" fill="#2563eb" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl bg-gray-50 px-4 py-5 text-sm text-gray-600 ring-1 ring-gray-200">
                No monitoring snapshot yet.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Audience Retention</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {renderMetricCard(
              'Average View Duration',
              lifetimeAnalytics ? formatDuration(lifetimeAnalytics.avg_view_duration) : '—'
            )}
            {renderMetricCard(
              'Average View %',
              lifetimeAnalytics ? formatPercent(lifetimeAnalytics.avg_view_percentage) : '—'
            )}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-5 text-sm text-gray-600">
            <div className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-blue-600" />
              <span>Audience Watch Ratio</span>
            </div>
            <div className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-orange-500" />
              <span>Relative Retention Performance</span>
            </div>
          </div>
          {retentionLoading ? (
            <div className="mt-5 animate-pulse space-y-4">
              <div className="h-4 w-40 rounded bg-gray-200" />
              <div className="h-96 rounded-2xl bg-gray-100" />
            </div>
          ) : retentionTimedOut ? (
            <p className="mt-4 text-sm text-gray-500">
              Retention data unavailable — try again later
            </p>
          ) : retentionChartData.length > 0 ? (
            <div className="mt-5 h-96">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={retentionChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="ratio"
                    tickFormatter={(value) => `${Math.round(value)}%`}
                    label={{ value: 'Elapsed Video Time', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis
                    tickFormatter={(value) => `${value}%`}
                    domain={[0, 110]}
                  />
                  <Tooltip formatter={(value) => [`${value}%`]} />
                  <Line
                    type="monotone"
                    dataKey="audienceWatchRatio"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={false}
                    name="Audience Watch Ratio"
                  />
                  <Line
                    type="monotone"
                    dataKey="relativeRetentionPerformance"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={false}
                    name="Relative Retention Performance"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-500">Retention data not available</p>
          )}
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Optimization History</h2>
          <div className="mt-5 space-y-4">
            {optimizations.length === 0 ? (
              <div className="rounded-2xl bg-gray-50 px-4 py-5 text-sm text-gray-600 ring-1 ring-gray-200">
                No optimizations yet.
              </div>
            ) : null}

            {optimizations.map((optimization) => {
              const isExpanded = Boolean(expandedHistoryIds[optimization.id]);

              return (
                <div
                  key={optimization.id}
                  className="rounded-2xl border border-gray-200 bg-gray-50/70"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedHistoryIds((current) => ({
                        ...current,
                        [optimization.id]: !current[optimization.id]
                      }))
                    }
                    className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${getOptimizationStatusClass(
                            optimization.status
                          )}`}
                        >
                          {optimization.status}
                        </span>
                        <span className="truncate text-base font-semibold text-gray-900">
                          {optimization.chosen_title || 'No title chosen yet'}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-gray-500">
                        Created {formatDateTime(optimization.created_at)}
                        {optimization.applied_at
                          ? ` • Applied ${formatDateTime(optimization.applied_at)}`
                          : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {optimization.status === 'applied' ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRevert(optimization.id);
                          }}
                          disabled={busyOptimizationId === optimization.id}
                          className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-700 disabled:cursor-wait disabled:bg-orange-400"
                        >
                          {busyOptimizationId === optimization.id && busyAction === 'revert'
                            ? 'Reverting...'
                            : 'Revert'}
                        </button>
                      ) : null}
                      <span className="text-sm font-medium text-gray-500">
                        {isExpanded ? 'Hide options' : 'Show options'}
                      </span>
                    </div>
                  </button>

                  {isExpanded ? (
                    <div className="border-t border-gray-200 px-5 py-5">
                      <div className="grid gap-4 xl:grid-cols-3">
                        {optimization.options.map((option, index) => (
                          <div
                            key={`${optimization.id}-history-${index}`}
                            className="rounded-2xl border border-gray-200 bg-white p-4"
                          >
                            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Option {index + 1}
                            </div>
                            <div className="mt-2 text-base font-semibold text-gray-900">
                              {option.title}
                            </div>
                            <p className="mt-3 text-sm leading-6 text-gray-600">
                              {option.reasoning}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export default VideoDetail;
