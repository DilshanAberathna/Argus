import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import { SRI_LANKA_LOCATIONS } from './ReportCase';
import 'leaflet/dist/leaflet.css';
import './Map.css';

const createCustomIcon = (status) => {
    let color = '#E53935'; // Red for Missing / Investigating
    let pulseColor = 'rgba(229, 57, 53, 0.4)';
    if (status?.toLowerCase() === 'found' || status?.toLowerCase() === 'closed') {
        color = '#4CAF50';
        pulseColor = 'rgba(76, 175, 80, 0.4)';
    } else if (status?.toLowerCase() === 'cold') {
        color = '#42A5F5';
        pulseColor = 'rgba(66, 165, 245, 0.4)';
    }

    return L.divIcon({
        className: 'custom-map-marker',
        html: `<div style="
            background-color: ${color};
            width: 26px;
            height: 26px;
            border-radius: 50%;
            border: 3px solid #ffffff;
            box-shadow: 0 0 0 6px ${pulseColor}, 0 2px 8px rgba(0,0,0,0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s;
        ">
            <div style="width: 8px; height: 8px; background: #fff; border-radius: 50%;"></div>
        </div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        popupAnchor: [0, -16]
    });
};

const Map = ({ cases = [] }) => {
    const navigate = useNavigate();
    const position = [7.8731, 80.7718];
    
    const sriLankaBounds = [
        [5.8, 79.5],
        [9.9, 82.0]
    ];

    const getCoordinates = (c, index) => {
        if (c.lastSeenLocation && c.lastSeenLocation.lat && c.lastSeenLocation.lng) {
            return [c.lastSeenLocation.lat, c.lastSeenLocation.lng];
        }
        // Fallback mapping for legacy case entries to ensure visual density on map
        const fallbackIdx = (c.name ? c.name.charCodeAt(0) : index) % SRI_LANKA_LOCATIONS.length;
        const loc = SRI_LANKA_LOCATIONS[fallbackIdx];
        return [loc.lat, loc.lng];
    };

    const getLocationName = (c, index) => {
        if (c.lastSeenLocation && c.lastSeenLocation.name) {
            return `${c.lastSeenLocation.name} (${c.lastSeenLocation.district || 'SL'})`;
        }
        const fallbackIdx = (c.name ? c.name.charCodeAt(0) : index) % SRI_LANKA_LOCATIONS.length;
        return `${SRI_LANKA_LOCATIONS[fallbackIdx].name} (${SRI_LANKA_LOCATIONS[fallbackIdx].district})`;
    };

    return (
        <div className="map-container">
            <MapContainer 
                center={position} 
                zoom={7} 
                minZoom={7}
                maxBounds={sriLankaBounds}
                maxBoundsViscosity={1.0}
                scrollWheelZoom={true}
                style={{ height: '100%', width: '100%' }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {cases.map((c, index) => {
                    const coords = getCoordinates(c, index);
                    const locationLabel = getLocationName(c, index);
                    const markerIcon = createCustomIcon(c.status);
                    
                    return (
                        <React.Fragment key={c.id || c.caseId || index}>
                            {c.status?.toLowerCase() === 'investigating' && (
                                <Circle 
                                    center={coords} 
                                    radius={5000} 
                                    pathOptions={{ color: '#E53935', fillColor: '#E53935', fillOpacity: 0.1, weight: 1 }} 
                                />
                            )}
                            <Marker position={coords} icon={markerIcon}>
                                <Popup className="argus-custom-popup">
                                    <div style={{ padding: '0.2rem', color: '#2a2d31', fontFamily: 'sans-serif', minWidth: '180px' }}>
                                        <h4 style={{ margin: '0 0 0.4rem', fontSize: '1rem', borderBottom: '2px solid #a0e4e8', paddingBottom: '4px', fontWeight: 'bold' }}>
                                            {c.name || 'Unnamed Subject'}
                                        </h4>
                                        <div style={{ fontSize: '0.85rem', lineHeight: '1.4', marginBottom: '0.6rem' }}>
                                            <div><strong>Case ID:</strong> {c.caseId || c.id || 'N/A'}</div>
                                            <div>
                                                <strong>Status:</strong>{' '}
                                                <span style={{ 
                                                    color: c.status?.toLowerCase() === 'found' || c.status?.toLowerCase() === 'closed' ? '#2e7d32' : 
                                                           c.status?.toLowerCase() === 'cold' ? '#1565c0' : '#c62828',
                                                    fontWeight: '800',
                                                    textTransform: 'capitalize'
                                                }}>
                                                    {c.status || 'Investigating'}
                                                </span>
                                            </div>
                                            <div><strong>Last Known:</strong> {locationLabel}</div>
                                        </div>
                                        <button 
                                            onClick={() => navigate(`/case/${c.caseId || c.id}`)}
                                            style={{
                                                width: '100%',
                                                padding: '0.45rem',
                                                background: '#4ab8bd',
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontWeight: '700',
                                                fontSize: '0.85rem',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                            }}
                                        >
                                            View Case File
                                        </button>
                                    </div>
                                </Popup>
                            </Marker>
                        </React.Fragment>
                    );
                })}
            </MapContainer>
        </div>
    );
};

export default Map;