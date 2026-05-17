import { useEffect, useState } from 'react';
import axios from 'axios';

function Dashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [totalVideos, setTotalVideos] = useState(0);
  const [message, setMessage] = useState('');

  async function loadDashboard() {
    try {
      setLoading(true);

      const authResponse = await axios.get('/api/auth/status');
      const nextAuthenticated = authResponse.data.authenticated;

      setAuthenticated(nextAuthenticated);

      if (nextAuthenticated) {
        const videosResponse = await axios.get('/api/videos');
        setTotalVideos(videosResponse.data.length);
      } else {
        setTotalVideos(0);
      }
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  async function handleSync() {
    try {
      setSyncing(true);
      setMessage('Syncing videos and running audit scoring. This will take a while.');

      const response = await axios.get('/api/videos/sync');
      setMessage(
        `Sync complete. Synced ${response.data.synced} videos and scored ${response.data.scored} videos.`
      );
      await loadDashboard();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to sync videos.');
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return <h1 className="text-3xl font-semibold text-gray-900">Loading Dashboard...</h1>;
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-lg ring-1 ring-gray-200">
        <h1 className="text-3xl font-semibold text-gray-900">Dashboard</h1>

        <div className="mt-6 space-y-4 text-gray-700">
          {!authenticated ? (
            <button
              onClick={() => window.location.assign('/api/auth/login')}
              className="rounded bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
            >
              Connect YouTube Account
            </button>
          ) : (
            <div className="space-y-4">
              <p className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">
                Channel connected
              </p>
              <div>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="rounded bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-400"
                >
                  {syncing ? 'Syncing + Scoring...' : 'Sync Videos'}
                </button>
              </div>
              <p className="text-sm text-gray-500">
                Scoring 385 videos will take a few minutes.
              </p>
              <p className="text-sm font-medium text-gray-700">
                Total videos synced: {totalVideos}
              </p>
            </div>
          )}

          {message ? (
            <p
              className={`rounded-lg px-4 py-3 text-sm ${
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
    </div>
  );
}

export default Dashboard;
