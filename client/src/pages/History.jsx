import { useEffect, useState } from 'react';
import axios from 'axios';
import { PACIFIC_TIME_ZONE, parseAppDate } from '../lib/time.js';

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

function formatAppliedDate(value) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(parseAppDate(value));
}

function History() {
  const [optimizations, setOptimizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function loadHistory() {
    try {
      setLoading(true);
      setMessage('');

      const response = await axios.get('/api/optimizations');
      setOptimizations(response.data || []);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to load optimization history.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHistory();
  }, []);

  async function handleRevert(optimizationId) {
    const confirmed = window.confirm('Revert this optimization on YouTube?');

    if (!confirmed) {
      return;
    }

    try {
      setBusyId(optimizationId);
      setMessage('');

      await axios.post(`/api/optimizations/${optimizationId}/revert`);
      await loadHistory();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to revert optimization.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <h1 className="text-3xl font-semibold text-gray-900">Loading History...</h1>;
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-gray-900">History</h1>
        <p className="mt-2 text-sm text-gray-500">
          Review optimization activity and revert applied changes when needed.
        </p>
      </div>

      {message ? (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {message}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Thumbnail
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Original Title
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  New Title
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Applied Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {optimizations.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-10 text-center text-sm text-gray-500">
                    No optimization history yet.
                  </td>
                </tr>
              ) : null}

              {optimizations.map((optimization, index) => (
                <tr key={optimization.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-4">
                    <img
                      src={`https://img.youtube.com/vi/${optimization.video.youtube_id}/default.jpg`}
                      alt={optimization.video.title_current}
                      className="h-16 w-28 rounded-lg object-cover"
                    />
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700">
                    {optimization.video.title_original || optimization.video.title_current}
                  </td>
                  <td className="px-4 py-4 text-sm font-medium text-gray-900">
                    {optimization.chosen_title || '—'}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(optimization.status)}`}
                    >
                      {optimization.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700">
                    {formatAppliedDate(optimization.applied_at)}
                  </td>
                  <td className="px-4 py-4">
                    {optimization.status === 'applied' ? (
                      <button
                        onClick={() => handleRevert(optimization.id)}
                        disabled={busyId === optimization.id}
                        className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-orange-700 disabled:cursor-wait disabled:bg-orange-400"
                      >
                        {busyId === optimization.id ? 'Reverting...' : 'Revert'}
                      </button>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default History;
