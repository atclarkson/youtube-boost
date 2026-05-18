import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

function formatSubscriberCount(value) {
  if (value == null) {
    return '— subscribers';
  }

  return `${new Intl.NumberFormat('en-US').format(Number(value))} subscribers`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

function formatDate(value) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value));
}

function truncateTitle(title) {
  return title || 'Untitled video';
}

function getScoreBadgeClass(score) {
  if (score >= 8) {
    return 'bg-red-500 text-white';
  }

  if (score >= 5) {
    return 'bg-yellow-500 text-white';
  }

  if (!score) {
    return 'bg-slate-200 text-slate-700';
  }

  return 'bg-green-500 text-white';
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'applied':
      return 'bg-emerald-100 text-emerald-700';
    case 'approved':
      return 'bg-blue-100 text-blue-700';
    case 'reverted':
      return 'bg-orange-100 text-orange-700';
    case 'skipped':
      return 'bg-slate-200 text-slate-600';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function getScoringLabel(version) {
  return Number(version) === 2 ? 'Scoring v2' : 'Scoring';
}

function getAgeInDays(publishedAt) {
  return Math.max(
    1,
    (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function getViewsPerDay(video) {
  const ageInDays = getAgeInDays(video.published_at);

  if (!ageInDays || ageInDays <= 0) {
    return 0;
  }

  return (Number(video.view_count || 0) / ageInDays);
}

function ConfirmationModal({
  open,
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
  confirming
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-gray-600">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-300 disabled:cursor-wait disabled:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-400"
          >
            {confirming ? 'Starting...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncCount, setSyncCount] = useState(0);
  const [syncResult, setSyncResult] = useState(null);
  const [channelInfo, setChannelInfo] = useState({
    name: null,
    thumbnail: null,
    subscriberCount: null
  });
  const [totalVideos, setTotalVideos] = useState(0);
  const [unscoredCount, setUnscoredCount] = useState(0);
  const [message, setMessage] = useState('');
  const [auditVideos, setAuditVideos] = useState([]);
  const [monitoringSummary, setMonitoringSummary] = useState([]);
  const [optimizations, setOptimizations] = useState([]);
  const [batchActionMessages, setBatchActionMessages] = useState({});
  const [generatingBatchVideoId, setGeneratingBatchVideoId] = useState(null);
  const [scoringNowVideoId, setScoringNowVideoId] = useState(null);
  const [modalState, setModalState] = useState({
    open: false,
    type: '',
    title: '',
    message: '',
    total: 0
  });
  const [confirmingAction, setConfirmingAction] = useState(false);
  const [scoringStatus, setScoringStatus] = useState({
    inProgress: false,
    current: 0,
    total: 0,
    currentTitle: '',
    version: null,
    failedCount: 0,
    failedVideos: []
  });
  const [scoringSummary, setScoringSummary] = useState(null);
  const [showFailedVideos, setShowFailedVideos] = useState(false);
  const [retryingVideoId, setRetryingVideoId] = useState(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [lastScoringVersion, setLastScoringVersion] = useState(null);

  const syncPollRef = useRef(null);
  const scoringPollRef = useRef(null);
  const scoringSessionRef = useRef(null);

  async function loadCounts() {
    const [countResponse, unscoredResponse] = await Promise.all([
      axios.get('/api/videos/count'),
      axios.get('/api/videos/unscored-count')
    ]);

    setTotalVideos(countResponse.data.count || 0);
    setUnscoredCount(unscoredResponse.data.count || 0);
  }

  async function loadMetrics() {
    const [auditResponse, monitoringResponse, optimizationsResponse] = await Promise.all([
      axios.get('/api/videos/audit'),
      axios.get('/api/monitoring/summary'),
      axios.get('/api/optimizations')
    ]);

    setAuditVideos(auditResponse.data || []);
    setMonitoringSummary(monitoringResponse.data || []);
    setOptimizations(optimizationsResponse.data || []);
  }

  async function loadDashboard() {
    try {
      setLoading(true);
      setMessage('');

      const authResponse = await axios.get('/api/auth/status');
      const nextAuthenticated = authResponse.data.authenticated;

      setAuthenticated(nextAuthenticated);

      if (nextAuthenticated) {
        const channelResponse = await axios.get('/api/auth/channel');
        setChannelInfo(channelResponse.data);
        await Promise.all([loadCounts(), loadMetrics()]);
      } else {
        setChannelInfo({
          name: null,
          thumbnail: null,
          subscriberCount: null
        });
        setTotalVideos(0);
        setUnscoredCount(0);
        setAuditVideos([]);
        setMonitoringSummary([]);
        setOptimizations([]);
      }
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();

    return () => {
      if (syncPollRef.current) {
        window.clearInterval(syncPollRef.current);
      }

      if (scoringPollRef.current) {
        window.clearInterval(scoringPollRef.current);
      }
    };
  }, []);

  async function pollScoringStatus() {
    try {
      const response = await axios.get('/api/videos/scoring-status');
      const nextStatus = response.data;

      setScoringStatus(nextStatus);

      if (!nextStatus.inProgress && scoringSessionRef.current) {
        const { total } = scoringSessionRef.current;
        setScoringSummary({
          scored: Math.max(0, total - Number(nextStatus.failedCount || 0)),
          failed: Number(nextStatus.failedCount || 0)
        });
        scoringSessionRef.current = null;

        if (scoringPollRef.current) {
          window.clearInterval(scoringPollRef.current);
          scoringPollRef.current = null;
        }

        await loadCounts();
        await loadMetrics();
      }
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to fetch scoring progress.');

      if (scoringPollRef.current) {
        window.clearInterval(scoringPollRef.current);
        scoringPollRef.current = null;
      }
    }
  }

  function startScoringPolling(total, version = 1) {
    scoringSessionRef.current = { total, version };
    setLastScoringVersion(version);
    setScoringSummary(null);
    setShowFailedVideos(false);
    setScoringStatus({
      inProgress: true,
      current: 0,
      total,
      currentTitle: '',
      version,
      failedCount: 0,
      failedVideos: []
    });

    if (scoringPollRef.current) {
      window.clearInterval(scoringPollRef.current);
    }

    pollScoringStatus();
    scoringPollRef.current = window.setInterval(pollScoringStatus, 2000);
  }

  async function handleSync() {
    try {
      setSyncing(true);
      setMessage('');
      setSyncResult(null);

      const pollCount = async () => {
        try {
          const response = await axios.get('/api/videos/count');
          setSyncCount(response.data.count || 0);
        } catch (error) {
          // Ignore transient polling errors during sync.
        }
      };

      await pollCount();
      syncPollRef.current = window.setInterval(pollCount, 1000);

      const response = await axios.get('/api/videos/sync');

      if (syncPollRef.current) {
        window.clearInterval(syncPollRef.current);
        syncPollRef.current = null;
      }

      setSyncResult(response.data.synced || 0);
      await loadCounts();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to sync videos.');
    } finally {
      if (syncPollRef.current) {
        window.clearInterval(syncPollRef.current);
        syncPollRef.current = null;
      }

      setSyncing(false);
    }
  }

  function openScoreModal(type) {
    if (type === 'unscored') {
      setModalState({
        open: true,
        type,
        title: 'Score Unscored Videos',
        message: `This will score ${unscoredCount} unscored videos using Claude AI. This may take a long time. Continue?`,
        total: unscoredCount
      });
      return;
    }

    if (type === 'unscored-v2') {
      setModalState({
        open: true,
        type,
        title: 'Score Unscored Videos (v2)',
        message: `This will score ${unscoredCount} unscored videos using the new v2 formula. This may take a long time. Continue?`,
        total: unscoredCount
      });
      return;
    }

    if (type === 'all-v2') {
      setModalState({
        open: true,
        type,
        title: 'Score All Videos (v2)',
        message:
          'This will rescore all videos using the new v2 formula. Existing v2 scores will be overwritten. This may take a long time. Continue?',
        total: totalVideos
      });
      return;
    }

    setModalState({
      open: true,
      type,
      title: 'Score All Videos',
      message:
        'This will rescore ALL videos using Claude AI. This will overwrite existing scores and may take a very long time. Are you sure?',
      total: totalVideos
    });
  }

  function closeModal() {
    setModalState({
      open: false,
      type: '',
      title: '',
      message: '',
      total: 0
    });
    setConfirmingAction(false);
  }

  async function handleConfirmScoreAction() {
    const endpointMap = {
      unscored: '/api/videos/score-unscored',
      all: '/api/videos/score-all',
      'unscored-v2': '/api/videos/score-unscored-v2',
      'all-v2': '/api/videos/score-all-v2'
    };
    const version = modalState.type.includes('v2') ? 2 : 1;
    const endpoint = endpointMap[modalState.type];

    try {
      setConfirmingAction(true);
      setMessage('');

      const response = await axios.post(endpoint);
      closeModal();
      startScoringPolling(response.data.total || modalState.total || 0, version);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to start scoring.');
      setConfirmingAction(false);
    }
  }

  async function handleRetryFailedVideo(youtubeId) {
    try {
      setRetryingVideoId(youtubeId);
      setMessage('');

      await axios.post(`/api/videos/${youtubeId}/score`);
      setScoringStatus((current) => {
        const failedVideos = current.failedVideos.filter(
          (video) => video.youtube_id !== youtubeId
        );

        return {
          ...current,
          failedCount: failedVideos.length,
          failedVideos
        };
      });
      setScoringSummary((current) =>
        current
          ? {
              scored: current.scored + 1,
              failed: Math.max(0, current.failed - 1)
            }
          : current
      );
      await loadCounts();
      await loadMetrics();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to retry scoring video.');
    } finally {
      setRetryingVideoId(null);
    }
  }

  async function handleDisconnect() {
    try {
      setDisconnecting(true);
      setMessage('');
      await axios.get('/api/auth/logout');
      await loadDashboard();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to disconnect channel.');
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleGenerateBatch(video) {
    try {
      setGeneratingBatchVideoId(video.youtube_id);
      setBatchActionMessages((current) => ({
        ...current,
        [video.youtube_id]: null
      }));

      await axios.post(`/api/optimizations/generate/${video.youtube_id}`);
      await loadMetrics();
      setBatchActionMessages((current) => ({
        ...current,
        [video.youtube_id]: {
          type: 'success',
          text: 'Generated! View in Daily Batch'
        }
      }));
    } catch (error) {
      setBatchActionMessages((current) => ({
        ...current,
        [video.youtube_id]: {
          type: 'error',
          text: error.response?.data?.error || 'Failed to generate options.'
        }
      }));
    } finally {
      setGeneratingBatchVideoId(null);
    }
  }

  async function handleScoreNow(video) {
    try {
      setScoringNowVideoId(video.youtube_id);
      setMessage('');

      const response = await axios.post(`/api/videos/${video.youtube_id}/score`);
      const updatedVideo = response.data;

      setAuditVideos((current) =>
        current.map((item) =>
          item.youtube_id === video.youtube_id ? { ...item, ...updatedVideo } : item
        )
      );
      await loadCounts();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to score video.');
    } finally {
      setScoringNowVideoId(null);
    }
  }

  if (loading) {
    return <h1 className="text-3xl font-semibold text-gray-900">Loading Dashboard...</h1>;
  }

  const progressTotal = scoringStatus.total || scoringSessionRef.current?.total || 0;
  const progressPercent =
    progressTotal > 0 ? Math.min(100, (scoringStatus.current / progressTotal) * 100) : 0;
  const appliedOptimizationsCount = optimizations.filter(
    (optimization) => optimization.status === 'applied'
  ).length;
  const avgAuditScoreValues = auditVideos
    .map((video) => Number(video.audit_score || 0))
    .filter((score) => score > 0);
  const avgAuditScore =
    avgAuditScoreValues.length > 0
      ? (
          avgAuditScoreValues.reduce((sum, score) => sum + score, 0) /
          avgAuditScoreValues.length
        ).toFixed(1)
      : '—';
  const publicAuditVideos = auditVideos.filter(
    (video) =>
      video.privacy_status === 'public' &&
      Number(video.hidden || 0) !== 1 &&
      Number(video.duration_seconds || 0) >= 180
  );
  const topOptimizationCandidates = [...publicAuditVideos]
    .filter((video) => video.audit_status !== 'applied')
    .sort((left, right) => Number(right.audit_score || 0) - Number(left.audit_score || 0))
    .slice(0, 5);
  const unscoredVideos = [...auditVideos]
    .filter((video) => video.audit_score == null || Number(video.audit_score) === 0)
    .sort((left, right) => new Date(left.published_at || 0) - new Date(right.published_at || 0))
    .slice(0, 5);
  const topCandidateIds = new Set(topOptimizationCandidates.map((video) => video.youtube_id));
  const topVideosByViews = [...publicAuditVideos]
    .sort((left, right) => Number(right.view_count || 0) - Number(left.view_count || 0))
    .slice(0, 5);
  const videosWithViewData = publicAuditVideos.filter(
    (video) => video.view_count != null && Number(video.view_count) > 0
  );
  const weakestPerformers = [...publicAuditVideos]
    .filter(
      (video) =>
        Number(video.duration_seconds || 0) >= 180 &&
        video.view_count != null &&
        Number(video.view_count) > 0
    )
    .sort((left, right) => getViewsPerDay(left) - getViewsPerDay(right))
    .slice(0, 5);
  const monitoringVideos = [...monitoringSummary]
    .sort((left, right) => new Date(right.applied_at || 0) - new Date(left.applied_at || 0))
    .slice(0, 5);
  const needsAttentionVideos = [...auditVideos]
    .filter((video) => {
      if (Number(video.audit_score || 0) <= 7) {
        return false;
      }

      if (video.audit_status === 'applied') {
        return false;
      }

      if (topCandidateIds.has(video.youtube_id)) {
        return false;
      }

      return (
        video.privacy_status === 'public' &&
        !optimizations.some((optimization) => optimization.video_id === video.id)
      );
    })
    .sort((left, right) => Number(right.audit_score || 0) - Number(left.audit_score || 0))
    .slice(0, 5);
  const recentActivity = optimizations.slice(0, 5);
  const weakestPerformerDebugRows = publicAuditVideos
    .filter((video) => Number(video.duration_seconds || 0) >= 180)
    .slice(0, 10)
    .map((video) => ({
      youtube_id: video.youtube_id,
      title_current: video.title_current,
      view_count: Number(video.view_count || 0),
      published_at: video.published_at,
      age_in_days: getAgeInDays(video.published_at),
      views_per_day: getViewsPerDay(video)
    }));

  console.log('Weakest Performers Debug', weakestPerformerDebugRows);

  return (
    <>
      <ConfirmationModal
        open={modalState.open}
        title={modalState.title}
        message={modalState.message}
        confirmLabel="Confirm"
        onCancel={closeModal}
        onConfirm={handleConfirmScoreAction}
        confirming={confirmingAction}
      />

      <div className="w-full px-8 py-6">
        <div className="w-full rounded-2xl bg-white p-8 shadow-lg ring-1 ring-gray-200">
          {!authenticated ? (
            <div className="space-y-4 text-gray-700">
              <h1 className="text-3xl font-semibold text-gray-900">Dashboard</h1>
              <button
                onClick={() => window.location.assign('/api/auth/login')}
                className="rounded bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
              >
                Connect YouTube Account
              </button>
            </div>
          ) : (
            <div className="space-y-6 text-gray-700">
              <div className="flex flex-col gap-4 border-b border-gray-200 pb-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                  {channelInfo.thumbnail ? (
                    <img
                      src={channelInfo.thumbnail}
                      alt={channelInfo.name || 'Channel profile'}
                      className="h-16 w-16 rounded-full object-cover ring-1 ring-gray-200"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-gray-200" />
                  )}
                  <div>
                    <h1 className="text-3xl font-semibold text-gray-900">
                      {channelInfo.name || 'Dashboard'}
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                      {formatSubscriberCount(channelInfo.subscriberCount)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <p className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">
                    Channel connected
                  </p>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="text-sm font-medium text-gray-500 underline transition hover:text-gray-800 disabled:cursor-wait disabled:text-gray-400"
                  >
                    {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Total Videos
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {formatNumber(totalVideos)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Optimizations Applied
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {formatNumber(appliedOptimizationsCount)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Currently Monitoring
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {formatNumber(monitoringSummary.length)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Avg Audit Score
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{avgAuditScore}</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-5">
                <button
                  onClick={handleSync}
                  disabled={syncing || scoringStatus.inProgress}
                  className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
                >
                  {syncing
                    ? `Syncing... (${new Intl.NumberFormat('en-US').format(syncCount)} synced so far)`
                    : 'Sync Videos'}
                </button>

                <button
                  onClick={() => openScoreModal('unscored')}
                  disabled={unscoredCount === 0 || syncing || scoringStatus.inProgress}
                  className="rounded-lg bg-slate-800 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {`Score Unscored (${unscoredCount})`}
                </button>

                <button
                  onClick={() => openScoreModal('all')}
                  disabled={syncing || scoringStatus.inProgress}
                  className="rounded-lg bg-slate-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  Score All Videos
                </button>

                <button
                  onClick={() => openScoreModal('unscored-v2')}
                  disabled={unscoredCount === 0 || syncing || scoringStatus.inProgress}
                  className="rounded-lg bg-indigo-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-indigo-300"
                >
                  {`Score Unscored (v2) (${unscoredCount})`}
                </button>

                <button
                  onClick={() => openScoreModal('all-v2')}
                  disabled={syncing || scoringStatus.inProgress}
                  className="rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
                >
                  Score All (v2)
                </button>
              </div>

              <div className="space-y-2 text-sm text-gray-600">
                {syncResult != null ? (
                  <p className="rounded-lg bg-emerald-50 px-4 py-3 text-emerald-700 ring-1 ring-emerald-200">
                    Synced {new Intl.NumberFormat('en-US').format(syncResult)} videos ✓
                  </p>
                ) : null}
              </div>

              {scoringStatus.inProgress ? (
                <div className="space-y-3 rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between gap-4 text-sm font-medium text-slate-700">
                    <span>
                      {getScoringLabel(scoringStatus.version)} {scoringStatus.current} of {progressTotal}:{' '}
                      {scoringStatus.currentTitle || 'Preparing...'}
                    </span>
                    <span>{progressPercent.toFixed(0)}%</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              ) : null}

              {scoringSummary ? (
                <div className="space-y-3 rounded-2xl bg-blue-50 p-5 ring-1 ring-blue-200">
                  <p className="text-sm font-medium text-blue-800">
                    {getScoringLabel(lastScoringVersion)} complete. {scoringSummary.scored} scored, {scoringSummary.failed} failed.
                  </p>

                  {scoringStatus.failedCount > 0 ? (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => setShowFailedVideos((current) => !current)}
                        className="text-sm font-medium text-blue-700 underline"
                      >
                        {showFailedVideos ? 'Hide Failed Videos' : 'View Failed Videos'}
                      </button>

                      {showFailedVideos ? (
                        <div className="space-y-3">
                          {scoringStatus.failedVideos.map((video) => (
                            <div
                              key={video.youtube_id}
                              className="rounded-xl bg-white px-4 py-3 ring-1 ring-blue-100"
                            >
                              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div className="min-w-0">
                                  <Link
                                    to={`/video/${video.youtube_id}`}
                                    className="block truncate text-sm font-medium text-gray-900 no-underline hover:underline"
                                  >
                                    {video.title_current}
                                  </Link>
                                  <p className="mt-1 text-sm text-red-700">{video.error}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRetryFailedVideo(video.youtube_id)}
                                  disabled={retryingVideoId === video.youtube_id}
                                  className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-400"
                                >
                                  {retryingVideoId === video.youtube_id ? 'Retrying...' : 'Retry'}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Top 5 Optimization Candidates</h2>
                  <div className="mt-4 space-y-3">
                    {topOptimizationCandidates.map((video) => {
                      const batchMessage = batchActionMessages[video.youtube_id];

                      return (
                        <div key={video.youtube_id} className="flex gap-3">
                          <img
                            src={`https://img.youtube.com/vi/${video.youtube_id}/default.jpg`}
                            alt={video.title_current}
                            className="h-14 w-20 rounded-md object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <Link
                                to={`/video/${video.youtube_id}`}
                                className="block truncate text-sm font-medium text-gray-900 no-underline hover:underline"
                              >
                                {truncateTitle(video.title_current)}
                              </Link>
                              <span
                                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${getScoreBadgeClass(
                                  Number(video.audit_score || 0)
                                )}`}
                              >
                                {video.audit_score || 'N/A'}
                              </span>
                            </div>
                            <div className="mt-2 flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => handleGenerateBatch(video)}
                                disabled={generatingBatchVideoId === video.youtube_id}
                                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-400"
                              >
                                {generatingBatchVideoId === video.youtube_id
                                  ? 'Generating...'
                                  : 'Add to Batch'}
                              </button>
                              {batchMessage ? (
                                batchMessage.type === 'success' ? (
                                  <p className="text-xs text-emerald-700">
                                    {batchMessage.text}{' '}
                                    <Link to="/batch" className="font-medium underline">
                                      Open
                                    </Link>
                                  </p>
                                ) : (
                                  <p className="text-xs text-red-700">{batchMessage.text}</p>
                                )
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {topOptimizationCandidates.length === 0 ? (
                      <p className="text-sm text-gray-500">No candidates available.</p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Currently Monitoring</h2>
                  <p className="mt-2 text-sm text-gray-500">
                    {monitoringSummary.length} actively monitored videos
                  </p>
                  <div className="mt-4 space-y-3">
                    {monitoringVideos.map((video) => (
                      <div key={video.id} className="flex items-center justify-between gap-3">
                        <Link
                          to={`/video/${video.youtube_id}`}
                          className="block truncate text-sm font-medium text-gray-900 no-underline hover:underline"
                        >
                          {truncateTitle(video.title_current)}
                        </Link>
                        <span className="shrink-0 text-xs text-gray-500">
                          {video.days_remaining} days remaining
                        </span>
                      </div>
                    ))}
                    {monitoringVideos.length === 0 ? (
                      <p className="text-sm text-gray-500">Nothing is being monitored yet.</p>
                    ) : null}
                  </div>
                  <div className="mt-4">
                    <Link to="/monitoring" className="text-sm font-medium text-blue-700 underline">
                      {`View all ${monitoringSummary.length} →`}
                    </Link>
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {unscoredVideos.length === 0 ? 'Top 5 Needs Attention' : 'Unscored Videos'}
                  </h2>
                  <div className="mt-4 space-y-3">
                    {unscoredVideos.length > 0
                      ? unscoredVideos.map((video) => (
                          <div key={video.youtube_id} className="flex gap-3">
                            <img
                              src={`https://img.youtube.com/vi/${video.youtube_id}/default.jpg`}
                              alt={video.title_current}
                              className="h-14 w-20 rounded-md object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <Link
                                to={`/video/${video.youtube_id}`}
                                className="block truncate text-sm font-medium text-gray-900 no-underline hover:underline"
                              >
                                {truncateTitle(video.title_current)}
                              </Link>
                              <p className="mt-1 text-xs text-gray-500">
                                Published {formatDate(video.published_at)}
                              </p>
                              <button
                                type="button"
                                onClick={() => handleScoreNow(video)}
                                disabled={scoringNowVideoId === video.youtube_id}
                                className="mt-2 rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-900 disabled:cursor-wait disabled:bg-slate-500"
                              >
                                {scoringNowVideoId === video.youtube_id ? 'Scoring...' : 'Score Now'}
                              </button>
                            </div>
                          </div>
                        ))
                      : needsAttentionVideos.map((video) => {
                          const batchMessage = batchActionMessages[video.youtube_id];

                          return (
                            <div key={video.youtube_id} className="flex gap-3">
                              <img
                                src={`https://img.youtube.com/vi/${video.youtube_id}/default.jpg`}
                                alt={video.title_current}
                                className="h-14 w-20 rounded-md object-cover"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <Link
                                    to={`/video/${video.youtube_id}`}
                                    className="block truncate text-sm font-medium text-gray-900 no-underline hover:underline"
                                  >
                                    {truncateTitle(video.title_current)}
                                  </Link>
                                  <span
                                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${getScoreBadgeClass(
                                      Number(video.audit_score || 0)
                                    )}`}
                                  >
                                    {video.audit_score || 'N/A'}
                                  </span>
                                </div>
                                <div className="mt-2 flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => handleGenerateBatch(video)}
                                    disabled={generatingBatchVideoId === video.youtube_id}
                                    className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-400"
                                  >
                                    {generatingBatchVideoId === video.youtube_id
                                      ? 'Generating...'
                                      : 'Add to Batch'}
                                  </button>
                                  {batchMessage ? (
                                    batchMessage.type === 'success' ? (
                                      <p className="text-xs text-emerald-700">
                                        {batchMessage.text}{' '}
                                        <Link to="/batch" className="font-medium underline">
                                          Open
                                        </Link>
                                      </p>
                                    ) : (
                                      <p className="text-xs text-red-700">{batchMessage.text}</p>
                                    )
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    {unscoredVideos.length === 0 && needsAttentionVideos.length === 0 ? (
                      <p className="text-sm text-gray-500">Nothing urgent needs attention right now.</p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
                  <div className="mt-4 space-y-3">
                    {recentActivity.map((optimization) => (
                      <div key={optimization.id} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            to={`/video/${optimization.video.youtube_id}`}
                            className="block truncate text-sm font-medium text-gray-900 no-underline hover:underline"
                          >
                            {truncateTitle(optimization.video.title_current)}
                          </Link>
                          <p className="mt-1 text-xs text-gray-500">
                            {formatDate(optimization.created_at)}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClass(
                            optimization.status
                          )}`}
                        >
                          {optimization.status}
                        </span>
                      </div>
                    ))}
                    {recentActivity.length === 0 ? (
                      <p className="text-sm text-gray-500">No recent optimization activity.</p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Top 5 by Views</h2>
                  <div className="mt-4 space-y-3">
                    {topVideosByViews.map((video) => (
                      <div key={video.youtube_id} className="flex gap-3">
                        <img
                          src={`https://img.youtube.com/vi/${video.youtube_id}/default.jpg`}
                          alt={video.title_current}
                          className="h-14 w-20 rounded-md object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/video/${video.youtube_id}`}
                            className="block truncate text-sm font-medium text-gray-900 no-underline hover:underline"
                          >
                            {truncateTitle(video.title_current)}
                          </Link>
                          <p className="mt-1 text-xs text-gray-500">
                            {formatNumber(video.view_count)} views
                          </p>
                        </div>
                      </div>
                    ))}
                    {topVideosByViews.length === 0 ? (
                      <p className="text-sm text-gray-500">No view data available yet.</p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Weakest Performers</h2>
                  <div className="mt-4 space-y-3">
                    {weakestPerformers.map((video) => {
                      const batchMessage = batchActionMessages[video.youtube_id];

                      return (
                        <div key={video.youtube_id} className="flex gap-3">
                          <img
                            src={`https://img.youtube.com/vi/${video.youtube_id}/default.jpg`}
                            alt={video.title_current}
                            className="h-14 w-20 rounded-md object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <Link
                                to={`/video/${video.youtube_id}`}
                                className="block truncate text-sm font-medium text-gray-900 no-underline hover:underline"
                              >
                                {truncateTitle(video.title_current)}
                              </Link>
                              <span
                                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${getScoreBadgeClass(
                                  Number(video.audit_score || 0)
                                )}`}
                              >
                                {video.audit_score || 'N/A'}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                              {(Math.round(getViewsPerDay(video) * 10) / 10).toFixed(1)} views/day
                            </p>
                            <div className="mt-2 flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => handleGenerateBatch(video)}
                                disabled={generatingBatchVideoId === video.youtube_id}
                                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-400"
                              >
                                {generatingBatchVideoId === video.youtube_id
                                  ? 'Generating...'
                                  : 'Add to Batch'}
                              </button>
                              {batchMessage ? (
                                batchMessage.type === 'success' ? (
                                  <p className="text-xs text-emerald-700">
                                    {batchMessage.text}{' '}
                                    <Link to="/batch" className="font-medium underline">
                                      Open
                                    </Link>
                                  </p>
                                ) : (
                                  <p className="text-xs text-red-700">{batchMessage.text}</p>
                                )
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {videosWithViewData.length === 0 ? (
                      <p className="text-sm text-gray-500">No view data available.</p>
                    ) : weakestPerformers.length === 0 ? (
                      <p className="text-sm text-gray-500">No long-form performance data available.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          )}

          {message ? (
            <p
              className={`mt-6 rounded-lg px-4 py-3 text-sm ${
                message.toLowerCase().includes('failed') || message.toLowerCase().includes('error')
                  ? 'bg-red-50 text-red-700'
                  : 'bg-blue-50 text-blue-700'
              }`}
            >
              {message}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}

export default Dashboard;
