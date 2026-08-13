import React from 'react';
import { useGait } from '../contexts/GaitContext';

export const GaitSystemStatus = () => {
  const { health, status, metrics, isConnected, loading, error } = useGait();

  if (loading && !health) {
    return <div className="p-3 bg-gray-800 text-gray-400 rounded-lg text-sm">Loading ARGUS Gait Status...</div>;
  }

  if (error) {
    return (
      <div className="p-3 bg-red-900/40 border border-red-700 text-red-300 rounded-lg text-sm flex items-center justify-between">
        <span>⚠️ Gait Engine Offline: {error}</span>
        <span className="px-2 py-0.5 bg-red-800 rounded text-xs">OFFLINE</span>
      </div>
    );
  }

  const isHealthy = health?.status === 'healthy';

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-white shadow-lg">
      <div className="flex items-center justify-between border-b border-gray-700 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${isHealthy ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <h3 className="font-semibold text-lg">ARGUS Gait Engine</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${isConnected ? 'bg-blue-900/60 text-blue-300 border border-blue-600' : 'bg-gray-700 text-gray-400'}`}>
            {isConnected ? '⚡ WS Live' : 'Polling'}
          </span>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${isHealthy ? 'bg-green-900/60 text-green-300 border border-green-600' : 'bg-red-900/60 text-red-300'}`}>
            {isHealthy ? 'HEALTHY' : 'DEGRADED'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-750">
          <div className="text-gray-400 text-xs uppercase font-medium">Device</div>
          <div className="text-base font-bold text-cyan-400">{status?.device?.toUpperCase() || 'CPU'}</div>
        </div>

        <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-750">
          <div className="text-gray-400 text-xs uppercase font-medium">Identities</div>
          <div className="text-base font-bold text-green-400">{metrics?.people || 0}</div>
        </div>

        <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-750">
          <div className="text-gray-400 text-xs uppercase font-medium">Embeddings</div>
          <div className="text-base font-bold text-amber-400">{metrics?.embeddings || 0}</div>
        </div>

        <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-750">
          <div className="text-gray-400 text-xs uppercase font-medium">Active Cameras</div>
          <div className="text-base font-bold text-purple-400">{status?.active_cameras || 0}</div>
        </div>
      </div>
    </div>
  );
};

export default GaitSystemStatus;
