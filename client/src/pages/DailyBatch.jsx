import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

function getStatusClass(status) {
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

function getVideoOptimizationState(videoId, optimizations) {
  const matchingOptimizations = optimizations.filter(
    (optimization) => optimization.video_id === videoId
  );

  if (
    matchingOptimizations.some(
      (optimization) =>
        optimization.status === 'pending' || optimization.status === 'approved'
    )
  ) {
    return {
      blocked: true,
      message: 'This video already has a pending optimization.'
    };
  }

  if (matchingOptimizations.some((optimization) => optimization.status === 'applied')) {
    return {
      blocked: true,
      message:
        'This video already has an active optimization. Revert it first before generating new options.'
    };
  }

  return { blocked: false, message: '' };
}

function DailyBatch() {
  const [optimizations, setOptimizations] = useState([]);
  const [allOptimizations, setAllOptimizations] = useState([]);
  const [approvalsCount, setApprovalsCount] = useState(0);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [generateLoading, setGenerateLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [selectedOptions, setSelectedOptions] = useState({});
  const [drafts, setDrafts] = useState({});
  const [busyOptimizationId, setBusyOptimizationId] = useState(null);
  const [busyAction, setBusyAction] = useState('');
  const [resultPanels, setResultPanels] = useState({});

  async function loadPage() {
    try {
      setLoading(true);
      setMessage('');

      const [batchResponse, videosResponse, allOptimizationsResponse] = await Promise.all([
        axios.get('/api/optimizations/batch/today'),
        axios.get('/api/videos'),
        axios.get('/api/optimizations')
      ]);

      setOptimizations(batchResponse.data.optimizations || []);
      setApprovalsCount(batchResponse.data.approvalsCount || 0);
      setVideos(videosResponse.data || []);
      setAllOptimizations(allOptimizationsResponse.data || []);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to load daily batch.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, []);

  const filteredVideos = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return videos;
    }

    return videos.filter((video) =>
      String(video.title_current || '').toLowerCase().includes(query)
    );
  }, [searchQuery, videos]);

  const selectedVideoOptimizationState = useMemo(() => {
    if (!selectedVideoId) {
      return { blocked: false, message: '' };
    }

    return getVideoOptimizationState(Number(selectedVideoId), allOptimizations);
  }, [allOptimizations, selectedVideoId]);

  function getDraftForOptimization(optimizationId) {
    return drafts[optimizationId] || { chosen_title: '', chosen_description: '' };
  }

  function handleChooseOption(optimizationId, optionIndex, option) {
    setSelectedOptions((current) => ({ ...current, [optimizationId]: optionIndex }));
    setDrafts((current) => ({
      ...current,
      [optimizationId]: {
        chosen_title: option.title,
        chosen_description:
          optimizations.find((item) => item.id === optimizationId)?.video.description_current || ''
      }
    }));
  }

  function updateDraft(optimizationId, field, value) {
    setDrafts((current) => ({
      ...current,
      [optimizationId]: {
        ...(current[optimizationId] || { chosen_title: '', chosen_description: '' }),
        [field]: value
      }
    }));
  }

  function replaceOptimization(updatedOptimization) {
    setOptimizations((current) =>
      current.map((optimization) =>
        optimization.id === updatedOptimization.id ? updatedOptimization : optimization
      )
    );
  }

  async function handleGenerate() {
    if (!selectedVideoId) {
      setMessage('Choose a video first.');
      return;
    }

    if (selectedVideoOptimizationState.blocked) {
      return;
    }

    try {
      setGenerateLoading(true);
      setMessage('');

      const response = await axios.post(`/api/optimizations/generate/${selectedVideoId}`);
      setOptimizations((current) => [response.data, ...current]);
      setAllOptimizations((current) => [response.data, ...current]);
      setSearchQuery('');
      setSelectedVideoId('');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to generate options.');
    } finally {
      setGenerateLoading(false);
    }
  }

  async function handleApprove(optimizationId) {
    const draft = getDraftForOptimization(optimizationId);

    if (!draft.chosen_title.trim() || !draft.chosen_description.trim()) {
      setMessage('Choose an option and confirm the title and description first.');
      return;
    }

    try {
      setBusyOptimizationId(optimizationId);
      setBusyAction('approve');
      setMessage('');

      const response = await axios.patch(`/api/optimizations/${optimizationId}/approve`, draft);
      replaceOptimization(response.data);
      setAllOptimizations((current) =>
        current.map((optimization) =>
          optimization.id === response.data.id ? response.data : optimization
        )
      );
      setApprovalsCount((count) => count + 1);
      setResultPanels((current) => ({
        ...current,
        [optimizationId]: {
          type: 'success',
          content: 'Optimization approved. Baseline snapshot captured.'
        }
      }));
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to approve optimization.');
    } finally {
      setBusyOptimizationId(null);
      setBusyAction('');
    }
  }

  async function handleSkip(optimizationId) {
    try {
      setBusyOptimizationId(optimizationId);
      setBusyAction('skip');
      setMessage('');

      const response = await axios.patch(`/api/optimizations/${optimizationId}/skip`);
      replaceOptimization(response.data);
      setAllOptimizations((current) =>
        current.map((optimization) =>
          optimization.id === response.data.id ? response.data : optimization
        )
      );
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to skip optimization.');
    } finally {
      setBusyOptimizationId(null);
      setBusyAction('');
    }
  }

  async function handleApply(optimizationId, dryRun) {
    try {
      setBusyOptimizationId(optimizationId);
      setBusyAction(dryRun ? 'dryRun' : 'apply');
      setMessage('');

      const response = await axios.post(`/api/optimizations/${optimizationId}/apply`, {
        dryRun
      });

      if (dryRun) {
        setResultPanels((current) => ({
          ...current,
          [optimizationId]: {
            type: 'dryRun',
            content: response.data
          }
        }));
      } else {
        setOptimizations((current) =>
          current.map((optimization) =>
            optimization.id === optimizationId
              ? {
                  ...optimization,
                  status: 'applied',
                  applied_at: new Date().toISOString()
                }
              : optimization
          )
        );
        setAllOptimizations((current) =>
          current.map((optimization) =>
            optimization.id === optimizationId
              ? {
                  ...optimization,
                  status: 'applied',
                  applied_at: new Date().toISOString()
                }
              : optimization
          )
        );
        setResultPanels((current) => ({
          ...current,
          [optimizationId]: {
            type: 'success',
            content: 'Changes applied to YouTube successfully.'
          }
        }));
      }
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to apply optimization.');
    } finally {
      setBusyOptimizationId(null);
      setBusyAction('');
    }
  }

  if (loading) {
    return <h1 className="text-3xl font-semibold text-gray-900">Loading Daily Batch...</h1>;
  }

  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Daily Batch</h1>
          <p className="mt-2 text-sm text-gray-500">
            Generate options, approve the winners, and use dry run before any live apply.
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <p className="text-sm font-medium text-gray-600">Today&apos;s approval count</p>
          <p className="mt-2 text-4xl font-semibold text-gray-900">{approvalsCount}</p>

          {approvalsCount >= 5 ? (
            <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              You&apos;ve approved {approvalsCount} optimizations today. Applying many at once
              can cause temporary ranking dips as YouTube re-indexes simultaneously. Proceed with
              awareness.
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="flex-1 space-y-2">
              <label className="block text-sm font-medium text-gray-700">Search videos</label>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by current title"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-0 focus:border-blue-500"
              />
            </div>
            <div className="flex-1 space-y-2">
              <label className="block text-sm font-medium text-gray-700">Choose a video</label>
              <select
                value={selectedVideoId}
                onChange={(event) => setSelectedVideoId(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500"
              >
                <option value="">Select a video</option>
                {filteredVideos.map((video) => (
                  <option key={video.id} value={video.id}>
                    {video.title_current}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generateLoading || selectedVideoOptimizationState.blocked}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
            >
              {generateLoading ? 'Claude is analyzing your video...' : 'Generate Options'}
            </button>
          </div>
          {selectedVideoOptimizationState.message ? (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              {selectedVideoOptimizationState.message}
            </p>
          ) : null}
        </div>
      </div>

      {message ? (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {message}
        </div>
      ) : null}

      <div className="space-y-6">
        {optimizations.length === 0 ? (
          <div className="rounded-2xl bg-white px-6 py-12 text-center shadow-sm ring-1 ring-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">No batch items yet</h2>
            <p className="mt-2 text-sm text-gray-500">
              Generate options for a video to start today&apos;s batch.
            </p>
          </div>
        ) : null}

        {optimizations.map((optimization) => {
          const draft = getDraftForOptimization(optimization.id);
          const resultPanel = resultPanels[optimization.id];
          const isBusy = busyOptimizationId === optimization.id;

          return (
            <article
              key={optimization.id}
              className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200"
            >
              <div className="flex flex-col gap-4 border-b border-gray-200 pb-5 lg:flex-row lg:items-start">
                <img
                  src={`https://img.youtube.com/vi/${optimization.video.youtube_id}/mqdefault.jpg`}
                  alt={optimization.video.title_current}
                  className="h-28 w-full rounded-xl object-cover lg:w-48"
                />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-semibold text-gray-900">
                      {optimization.video.title_current}
                    </h2>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(optimization.status)}`}
                    >
                      {optimization.status}
                    </span>
                  </div>
                  {optimization.chosen_title ? (
                    <p className="mt-3 text-sm text-gray-600">
                      Chosen title: <span className="font-medium text-gray-900">{optimization.chosen_title}</span>
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 grid gap-4 xl:grid-cols-3">
                {optimization.options.map((option, index) => {
                  const isSelected = selectedOptions[optimization.id] === index;

                  return (
                    <div
                      key={`${optimization.id}-${index}`}
                      className={`rounded-2xl border p-4 ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 bg-gray-50/70'
                      } flex h-full flex-col`}
                    >
                      <h3 className="text-lg font-semibold text-gray-900">{option.title}</h3>
                      <p className="mt-4 flex-1 text-sm leading-6 text-gray-600">
                        {option.reasoning}
                      </p>
                      <button
                        onClick={() => handleChooseOption(optimization.id, index, option)}
                        className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-blue-700"
                      >
                        Choose This
                      </button>
                    </div>
                  );
                })}
              </div>

              {(selectedOptions[optimization.id] != null || optimization.status !== 'pending') && (
                <div className="mt-6 space-y-4 rounded-2xl bg-gray-50 p-5 ring-1 ring-gray-200">
                  <div className="grid gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Chosen title</label>
                      <input
                        value={draft.chosen_title || optimization.chosen_title || ''}
                        onChange={(event) =>
                          updateDraft(optimization.id, 'chosen_title', event.target.value)
                        }
                        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {optimization.status === 'pending' ? (
                      <>
                        <button
                          onClick={() => handleApprove(optimization.id)}
                          disabled={isBusy}
                          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-wait disabled:bg-emerald-400"
                        >
                          {isBusy && busyAction === 'approve' ? 'Approving...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleSkip(optimization.id)}
                          disabled={isBusy}
                          className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-300 disabled:cursor-wait disabled:bg-slate-100"
                        >
                          {isBusy && busyAction === 'skip' ? 'Skipping...' : 'Skip'}
                        </button>
                      </>
                    ) : null}

                    {optimization.status === 'approved' ? (
                      <>
                        <button
                          onClick={() => handleApply(optimization.id, true)}
                          disabled={isBusy}
                          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-black disabled:cursor-wait disabled:bg-slate-500"
                        >
                          {isBusy && busyAction === 'dryRun' ? 'Running Dry Run...' : 'Dry Run'}
                        </button>
                        <button
                          onClick={() => handleApply(optimization.id, false)}
                          disabled={isBusy}
                          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-400"
                        >
                          {isBusy && busyAction === 'apply'
                            ? 'Applying to YouTube...'
                            : 'Apply to YouTube'}
                        </button>
                      </>
                    ) : null}
                  </div>

                  {resultPanel ? (
                    <div
                      className={`rounded-xl px-4 py-3 text-sm ${
                        resultPanel.type === 'success'
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                          : 'bg-slate-900 text-white'
                      }`}
                    >
                      {resultPanel.type === 'dryRun' ? (
                        <div className="space-y-2">
                          <p className="font-semibold">Dry run preview</p>
                          <p>YouTube ID: {resultPanel.content.wouldUpdate.youtubeId}</p>
                          <p>Title: {resultPanel.content.wouldUpdate.title}</p>
                          <p>Description: {resultPanel.content.wouldUpdate.description}</p>
                        </div>
                      ) : (
                        resultPanel.content
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default DailyBatch;
