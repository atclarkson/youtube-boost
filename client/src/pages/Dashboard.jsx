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
      setMessage('');

      const response = await axios.get('/api/videos/sync');
      setMessage(`Synced ${response.data.synced} videos.`);
      await loadDashboard();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to sync videos.');
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return <h1>Loading Dashboard...</h1>;
  }

  return (
    <div>
      <h1>Dashboard</h1>

      {!authenticated ? (
        <button onClick={() => window.location.assign('/api/auth/login')}>
          Connect YouTube Account
        </button>
      ) : (
        <div>
          <p>Channel connected.</p>
          <button onClick={handleSync} disabled={syncing}>
            {syncing ? 'Syncing...' : 'Sync Videos'}
          </button>
          <p>Total videos synced: {totalVideos}</p>
        </div>
      )}

      {message ? <p>{message}</p> : null}
    </div>
  );
}

export default Dashboard;
