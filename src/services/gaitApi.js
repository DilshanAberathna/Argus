/**
 * ARGUS Gait Backend API Client & WebSocket Service
 * Interacts with FastAPI Gait Recognition Backend (v1 API)
 */

const API_BASE = import.meta.env.VITE_GAIT_API_URL || 'http://localhost:8000';

async function request(endpoint, options = {}) {
  const url = `${API_BASE}/api/v1${endpoint}`;
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || `HTTP Error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`[gaitApi] Request failed for ${endpoint}:`, error);
    throw error;
  }
}

export const gaitApi = {
  getHealth: () => request('/health'),
  getStatus: () => request('/status'),
  getMetrics: () => request('/metrics'),
  getEvents: () => request('/events'),
  getCameras: () => request('/cameras'),

  identifyImage: async (file, cameraId = 'upload-image') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('camera_id', cameraId);
    return request('/identify/image', {
      method: 'POST',
      body: formData,
    });
  },

  analyzeVideo: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request('/analyze/video', {
      method: 'POST',
      body: formData,
    });
  },

  startCamera: async (cameraId, source, location = 'Surveillance Zone') => {
    return request('/cameras/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ camera_id: cameraId, source, location }),
    });
  },

  stopCamera: async (cameraId) => {
    return request('/cameras/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ camera_id: cameraId }),
    });
  },

  enrollSubject: async (personId, files) => {
    const formData = new FormData();
    formData.append('person_id', personId);
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    return request('/enroll', {
      method: 'POST',
      body: formData,
    });
  },

  createWebSocket: (onEvent, onError, onClose) => {
    const wsUrl = API_BASE.replace(/^http/, 'ws') + '/api/v1/ws/recognition';
    let socket = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    let isExplicitClosed = false;

    const connect = () => {
      try {
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          reconnectAttempts = 0;
          console.log('[gaitApi] WebSocket connected to ARGUS Engine.');
        };

        socket.onmessage = (evt) => {
          try {
            const data = JSON.parse(evt.data);
            if (onEvent) onEvent(data);
          } catch (err) {
            console.error('[gaitApi] Failed to parse WS message:', err);
          }
        };

        socket.onerror = (err) => {
          if (onError) onError(err);
        };

        socket.onclose = () => {
          if (onClose) onClose();
          if (!isExplicitClosed && reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
            console.warn(`[gaitApi] WS closed. Reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`);
            setTimeout(connect, delay);
          }
        };
      } catch (err) {
        if (onError) onError(err);
      }
    };

    connect();

    return {
      close: () => {
        isExplicitClosed = true;
        if (socket) socket.close();
      },
    };
  },
};
