import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { gaitApi } from '../services/gaitApi';

const GaitContext = createContext(null);

export const GaitProvider = ({ children }) => {
  const [health, setHealth] = useState(null);
  const [status, setStatus] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [events, setEvents] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchState = useCallback(async () => {
    try {
      setLoading(true);
      const [healthRes, statusRes, metricsRes, eventsRes, camsRes] = await Promise.allSettled([
        gaitApi.getHealth(),
        gaitApi.getStatus(),
        gaitApi.getMetrics(),
        gaitApi.getEvents(),
        gaitApi.getCameras(),
      ]);

      if (healthRes.status === 'fulfilled') setHealth(healthRes.value);
      if (statusRes.status === 'fulfilled') setStatus(statusRes.value);
      if (metricsRes.status === 'fulfilled') setMetrics(metricsRes.value);
      if (eventsRes.status === 'fulfilled') setEvents(eventsRes.value);
      if (camsRes.status === 'fulfilled') setCameras(camsRes.value);

      setError(null);
    } catch (err) {
      console.error('[GaitContext] Error fetching gait status:', err);
      setError('Unable to connect to ARGUS Gait Engine');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 15000);

    const ws = gaitApi.createWebSocket(
      (newEvent) => {
        setIsConnected(true);
        setEvents((prev) => [newEvent, ...prev.slice(0, 99)]);
      },
      () => setIsConnected(false),
      () => setIsConnected(false)
    );

    return () => {
      clearInterval(interval);
      ws.close();
    };
  }, [fetchState]);

  const identifyImage = async (file, cameraId) => {
    const event = await gaitApi.identifyImage(file, cameraId);
    setEvents((prev) => [event, ...prev.slice(0, 99)]);
    fetchState();
    return event;
  };

  const analyzeVideo = async (file) => {
    const newEvents = await gaitApi.analyzeVideo(file);
    if (Array.isArray(newEvents)) {
      setEvents((prev) => [...newEvents, ...prev].slice(0, 100));
    }
    fetchState();
    return newEvents;
  };

  const startCamera = async (cameraId, source, location) => {
    const res = await gaitApi.startCamera(cameraId, source, location);
    fetchState();
    return res;
  };

  const stopCamera = async (cameraId) => {
    const res = await gaitApi.stopCamera(cameraId);
    fetchState();
    return res;
  };

  const enrollSubject = async (personId, files) => {
    const res = await gaitApi.enrollSubject(personId, files);
    fetchState();
    return res;
  };

  const value = {
    health,
    status,
    metrics,
    events,
    cameras,
    isConnected,
    loading,
    error,
    refreshState: fetchState,
    identifyImage,
    analyzeVideo,
    startCamera,
    stopCamera,
    enrollSubject,
  };

  return <GaitContext.Provider value={value}>{children}</GaitContext.Provider>;
};

export const useGait = () => {
  const context = useContext(GaitContext);
  if (!context) {
    throw new Error('useGait must be used within a GaitProvider');
  }
  return context;
};
