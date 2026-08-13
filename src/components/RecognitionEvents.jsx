import React, { useState } from 'react';
import { useGait } from '../contexts/GaitContext';
import './RecognitionEvents.css';

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
        return <span className="decision-badge known">KNOWN</span>;
      case 'UNCERTAIN':
        return <span className="decision-badge uncertain">UNCERTAIN</span>;
      default:
        return <span className="decision-badge unknown">UNKNOWN</span>;
    }
  };

  return (
    <div className="recon-events-widget">
      <div className="recon-events-header">
        <div className="recon-events-title">
          <h3>📡 Real-Time Recognition Stream</h3>
          <span className="recon-count-tag">{events.length} Events</span>
        </div>

        <div className="recon-filter-group">
          {['ALL', 'KNOWN', 'UNCERTAIN', 'UNKNOWN'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`recon-filter-btn ${filter === f ? 'active' : ''}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filteredEvents.length === 0 ? (
        <div className="recon-empty-state">No recognition events matching filter.</div>
      ) : (
        <div className="recon-events-list">
          {filteredEvents.map((evt) => (
            <div key={evt.event_id} className="recon-event-card">
              <div className="recon-event-left">
                {getDecisionBadge(evt.decision)}
                <div>
                  <div className="recon-identity">{evt.identity}</div>
                  <div className="recon-meta">
                    Cam: {evt.camera_id} | Track: #{evt.track_id} | Branch: {evt.recognition_branch}
                  </div>
                </div>
              </div>

              <div className="recon-event-right">
                <div className="recon-conf">
                  {(evt.confidence * 100).toFixed(1)}% Match
                </div>
                <div className="recon-time">
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
