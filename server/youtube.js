const { google } = require('googleapis');
const { getClient } = require('./auth');

function parseDurationToSeconds(duration) {
  const match = duration.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

  if (!match) {
    return null;
  }

  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  const seconds = Number(match[4] || 0);

  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

async function getUploadsPlaylistId(youtube) {
  const response = await youtube.channels.list({
    part: ['contentDetails'],
    mine: true
  });

  const playlistId =
    response.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  if (!playlistId) {
    throw new Error('Could not find uploads playlist for the authenticated channel.');
  }

  return playlistId;
}

async function fetchPlaylistVideoIds(youtube, playlistId) {
  const videoIds = [];
  let nextPageToken;

  do {
    const response = await youtube.playlistItems.list({
      part: ['contentDetails'],
      playlistId,
      maxResults: 50,
      pageToken: nextPageToken
    });

    const items = response.data.items || [];

    for (const item of items) {
      if (item.contentDetails?.videoId) {
        videoIds.push(item.contentDetails.videoId);
      }
    }

    nextPageToken = response.data.nextPageToken;
  } while (nextPageToken);

  return videoIds;
}

async function fetchVideoDetails(youtube, videoIds) {
  const videos = [];

  for (let index = 0; index < videoIds.length; index += 50) {
    const batchIds = videoIds.slice(index, index + 50);
    const response = await youtube.videos.list({
      part: ['snippet', 'contentDetails', 'statistics'],
      id: batchIds
    });

    for (const item of response.data.items || []) {
      videos.push({
        id: item.id,
        title: item.snippet?.title || '',
        description: item.snippet?.description || '',
        publishedAt: item.snippet?.publishedAt || null,
        duration: parseDurationToSeconds(item.contentDetails?.duration || ''),
        categoryId: item.snippet?.categoryId || null,
        tags: item.snippet?.tags || [],
        statistics: {
          viewCount: item.statistics?.viewCount || '0',
          likeCount: item.statistics?.likeCount || '0'
        },
        contentDetails: item.contentDetails || null
      });
    }
  }

  return videos;
}

async function getAllVideos() {
  const auth = await getClient();
  const youtube = google.youtube({ version: 'v3', auth });
  const uploadsPlaylistId = await getUploadsPlaylistId(youtube);
  const videoIds = await fetchPlaylistVideoIds(youtube, uploadsPlaylistId);

  return fetchVideoDetails(youtube, videoIds);
}

async function updateVideo(youtubeId, title, description) {
  const auth = await getClient();
  const youtube = google.youtube({ version: 'v3', auth });

  try {
    const currentVideoResponse = await youtube.videos.list({
      part: ['snippet'],
      id: [youtubeId]
    });

    const currentVideo = currentVideoResponse.data.items?.[0];

    if (!currentVideo) {
      return { success: false, error: 'Video not found.' };
    }

    await youtube.videos.update({
      part: ['snippet'],
      requestBody: {
        id: youtubeId,
        snippet: {
          title,
          description,
          categoryId: currentVideo.snippet?.categoryId,
          tags: currentVideo.snippet?.tags || []
        }
      }
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to update YouTube video metadata:', error);
    return {
      success: false,
      error: error.message || 'Failed to update video.'
    };
  }
}

module.exports = {
  getAllVideos,
  updateVideo
};
