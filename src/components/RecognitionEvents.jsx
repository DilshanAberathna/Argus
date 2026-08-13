import React, { useState } from 'react';
import { useGait } from '../contexts/GaitContext';

export const RecognitionEvents = () => {
  const { events } = useGait();
  const [filter, setFilter] = useState('ALL');

  const filteredEvents = events.filter((evt) => {
    if (filter === 'ALL') return true;
    return evt.decision === filter;
  });

  const getDecisionBadge = (decision) => {
    switch (decision) {
      case 'KNOWN':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-900/80 text-green-300 border border-green-700">KNOWN</span>;
      case 'UNCERTAIN':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-900/80 text-yellow-300 border border-yellow-700">UNCERTAIN</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-900/80 text-red-300 border border-red-700">UNKNOWN</span>;
    }
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-white shadow-lg">
      <div className="flex items-center justify-between border-b border-gray-700 pb-3 mb-3">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <span>📡 Real-Time Recognition Stream</span>
          <span className="text-xs bg-gray-700 px-2 py-0.5 rounded-full text-gray-300">{events.length} Events</span>
        </h3>

        <div className="flex gap-1 text-xs bg-gray-900 p-1 rounded-lg">
          {['ALL', 'KNOWN', 'UNCERTAIN', 'UNKNOWN'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filter === f ? 'bg-blue-600 text-white font-medium' : 'text-gray-400 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filteredEvents.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm">No recognition events matching filter.</div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {filteredEvents.map((evt) => (
            <div key={evt.event_id} className="bg-gray-900/70 p-3 rounded-lg border border-gray-750 flex items-center justify-between text-sm hover:border-gray-600 transition-all">
              <div className="flex items-center gap-3">
                {getDecisionBadge(evt.decision)}
                <div>
                  <div className="font-semibold text-gray-200">{evt.identity}</div>
                  <div className="text-xs text-gray-400">
                    Cam: <span className="text-gray-300 font-mono">{evt.camera_id}</span> | Track: #{evt.track_id} | Branch: {evt.recognition_branch}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs font-mono text-cyan-400 font-medium">
                  {(evt.confidence * 100).toFixed(1)}% Conf
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(evt.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RecognitionEvents;
