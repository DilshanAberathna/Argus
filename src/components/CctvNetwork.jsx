import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    ArrowLeft, Video, Radio, Plus, MapPin, Wifi, 
    Cpu, Eye, X, Bell, User as UserIcon 
} from 'lucide-react';
import { SURVEILLANCE_ZONES, CCTV_CAMERAS as INITIAL_CAMERAS } from '../utils/cctvService';
import { getDeviceGPS } from '../utils/geoService';
import logo from '../assets/logo.png';
import Notifications from './Notifications';
import UserProfileModal from './UserProfileModal';
import { useAuth } from '../contexts/AuthContext';
import { useGait } from '../contexts/GaitContext';
import './CctvNetwork.css';
import './History.css';

const loadInitialCameras = () => {
    const storedCustom = localStorage.getItem('argus_custom_cctv_nodes');
    let parsedCustom = [];
    if (storedCustom) {
        try {
            parsedCustom = JSON.parse(storedCustom);
        } catch (err) {
            console.error("Error parsing custom CCTV nodes:", err);
        }
    }
    return [...INITIAL_CAMERAS, ...parsedCustom];
};

const CctvNetwork = ({ isAdmin = false }) => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const { events, cameras: activeGaitCameras, startCamera, stopCamera } = useGait();

    const [showNotifications, setShowNotifications] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const [activeZoneId, setActiveZoneId] = useState(SURVEILLANCE_ZONES[0]?.id || 'Z01');
    const [allCameras, setAllCameras] = useState(loadInitialCameras);
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedCamStream, setSelectedCamStream] = useState(null);
    const [isDetectingGPS, setIsDetectingGPS] = useState(false);

    const createInitialCamState = () => ({
        id: `CCTV-${Math.floor(100 + Math.random() * 900)}`,
        name: '',
        lat: '',
        lng: '',
        resolution: '4K IR PTZ Stream & AI Face Recognition',
        ip: `192.168.${Math.floor(10 + Math.random() * 80)}.${Math.floor(10 + Math.random() * 240)}`,
        status: 'ONLINE'
    });

    const [newCam, setNewCam] = useState(createInitialCamState);

    const activeZone = SURVEILLANCE_ZONES.find(z => z.id === activeZoneId) || SURVEILLANCE_ZONES[0];
    const currentZoneCameras = allCameras.filter(c => c.zoneId === activeZoneId || (!c.zoneId && activeZoneId === 'Z01'));

    const handleAutoDetectGPS = async () => {
        setIsDetectingGPS(true);
        const locationData = await getDeviceGPS();
        setIsDetectingGPS(false);

        if (locationData && locationData.lat && locationData.lng) {
            setNewCam(prev => ({
                ...prev,
                lat: locationData.lat.toFixed(6),
                lng: locationData.lng.toFixed(6)
            }));
        } else {
            alert("Could not detect precise device GPS location. Please enter manually.");
        }
    };

    const handleAddCameraSubmit = (e) => {
        e.preventDefault();
        if (!newCam.name || !newCam.lat || !newCam.lng) {
            alert("Please complete landmark name and GPS coordinates.");
            return;
        }

        const cameraNode = {
            id: newCam.id,
            name: newCam.name,
            zoneId: activeZoneId,
            status: newCam.status,
            resolution: newCam.resolution,
            lat: parseFloat(newCam.lat),
            lng: parseFloat(newCam.lng),
            ip: newCam.ip,
            isCustom: true
        };

        const existingCustomStr = localStorage.getItem('argus_custom_cctv_nodes');
        let existingCustom = [];
        if (existingCustomStr) {
            try { existingCustom = JSON.parse(existingCustomStr); } catch (err) { console.error(err); }
        }
        const updatedCustom = [cameraNode, ...existingCustom];
        localStorage.setItem('argus_custom_cctv_nodes', JSON.stringify(updatedCustom));

        setAllCameras(prev => [cameraNode, ...prev]);
        setShowAddModal(false);
        setNewCam(createInitialCamState());
        alert(`Node ${cameraNode.id} deployed to ${activeZone.name}`);
    };

    const isGaitWorkerActive = (camId) => {
        return activeGaitCameras.some(c => c.camera_id === camId && c.status === 'ACTIVE');
    };

    const toggleGaitWorker = async (cam) => {
        if (isGaitWorkerActive(cam.id)) {
            await stopCamera(cam.id);
        } else {
            await startCamera(cam.id, cam.ip || '0', cam.name);
        }
    };

    const streamEvents = selectedCamStream
        ? events.filter(e => e.camera_id === selectedCamStream.id || e.camera_id === 'upload-image')
        : [];

    return (
        <div className="cctv-page-container">
            <header className="command-header">
                <div className="header-brand-group">
                    <button className="icon-btn back-btn" onClick={() => navigate(isAdmin ? '/admin/dashboard' : '/dashboard')} title="Return to Dashboard">
                        <ArrowLeft size={20} />
                    </button>
                    <img src={logo} alt="ARGUS Logo" className="header-logo" />
                    <div className="brand-titles">
                        <span className="system-code">ARGUS-V0.1 // SURVEILLANCE GRID</span>
                        <h1 className="header-title">CCTV SENTINEL NETWORK & ZONES</h1>
                    </div>
                </div>

                <div className="header-controls-group">
                    <div className="notification-wrapper">
                        <button className="icon-btn notification-btn" onClick={() => setShowNotifications(!showNotifications)}>
                            <Bell size={18} />
                        </button>
                        {showNotifications && <Notifications onClose={() => setShowNotifications(false)} />}
                    </div>

                    <div className="user-profile-widget" onClick={() => setShowProfile(true)}>
                        <div className="avatar-circle">
                            <UserIcon size={16} />
                        </div>
                        <div className="user-text-info">
                            <span className="user-name">{currentUser?.displayName || currentUser?.email || 'Operator'}</span>
                            <span className="user-role">{isAdmin ? 'ADMINISTRATOR' : 'INVESTIGATOR'}</span>
                        </div>
                    </div>
                </div>
            </header>

            {showProfile && (
                <UserProfileModal 
                    user={currentUser} 
                    role={isAdmin ? 'admin' : 'investigator'} 
                    onClose={() => setShowProfile(false)}
                    onLogout={() => navigate('/')} 
                />
            )}

            <main className="cctv-workspace">
                <aside className="cctv-sidebar-zones">
                    <div className="zones-sidebar-header">
                        <h3>SURVEILLANCE SECTORS</h3>
                        <span>{SURVEILLANCE_ZONES.length} Active Zones</span>
                    </div>

                    <div className="zones-list-group">
                        {SURVEILLANCE_ZONES.map((zone) => {
                            const zoneCams = allCameras.filter(c => c.zoneId === zone.id || (!c.zoneId && zone.id === 'Z01'));
                            const onlineCount = zoneCams.filter(c => c.status === 'ONLINE').length;
                            const isActive = activeZoneId === zone.id;

                            return (
                                <div 
                                    key={zone.id} 
                                    className={`zone-item-card ${isActive ? 'active' : ''}`}
                                    onClick={() => setActiveZoneId(zone.id)}
                                >
                                    <div className="zone-card-top">
                                        <span className="zone-id-badge">{zone.id}</span>
                                        <span className="zone-status-pill">
                                            <Wifi size={12} /> {onlineCount}/{zoneCams.length} Online
                                        </span>
                                    </div>
                                    <h4 className="zone-name-title">{zone.name}</h4>
                                    <p className="zone-desc-text">{zone.description}</p>
                                </div>
                            );
                        })}
                    </div>
                </aside>

                <section className="cctv-main-content">
                    <div className="cctv-zone-header-banner">
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <h2>{activeZone.name} ({activeZone.id})</h2>
                                <span className="grid-status-live">
                                    <Radio size={14} className="activity-spin" /> SENTINEL GRID ACTIVE
                                </span>
                            </div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>
                                {activeZone.description} | Installed Sentinel Nodes: <strong>{currentZoneCameras.length}</strong>
                            </p>
                        </div>

                        {isAdmin && (
                            <button className="btn-add-cctv-node" onClick={() => setShowAddModal(true)}>
                                <Plus size={16} /> Deploy New CCTV Node
                            </button>
                        )}
                    </div>

                    <div className="cctv-grid-nodes">
                        {currentZoneCameras.map((cam) => {
                            const isGaitActive = isGaitWorkerActive(cam.id);
                            return (
                                <div key={cam.id} className="cctv-node-card">
                                    <div className="node-card-header">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Video size={16} color={cam.status === 'ONLINE' ? '#00E5FF' : '#FF5252'} />
                                            <span className="node-id-tag">{cam.id}</span>
                                            {cam.isCustom && <span className="custom-badge-cctv">CUSTOM</span>}
                                        </div>
                                        <span className={`node-status-badge ${cam.status.toLowerCase()}`}>
                                            {cam.status}
                                        </span>
                                    </div>

                                    <div className="node-card-body">
                                        <h4 className="node-title">{cam.name}</h4>
                                        <div className="node-meta-row">
                                            <span><MapPin size={12} /> {cam.lat.toFixed(4)}, {cam.lng.toFixed(4)}</span>
                                            <span><Wifi size={12} /> {cam.ip}</span>
                                        </div>
                                        <div className="node-capability-tag">{cam.resolution}</div>
                                    </div>

                                    <div className="node-card-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button className="btn-view-stream flex-1" onClick={() => setSelectedCamStream(cam)}>
                                            <Eye size={14} /> Live Stream
                                        </button>
                                        <button 
                                            className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
                                                isGaitActive ? 'bg-green-800 hover:bg-green-700 text-green-200' : 'bg-purple-900/80 hover:bg-purple-800 text-purple-200'
                                            }`}
                                            onClick={() => toggleGaitWorker(cam)}
                                        >
                                            {isGaitActive ? '🟢 Gait AI Active' : '▶️ Start Gait Worker'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            </main>

            {/* Modal: Live Camera Stream Overlay */}
            {selectedCamStream && (
                <div className="cctv-modal-overlay">
                    <div className="cctv-modal-card" style={{ maxWidth: '640px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                            <h3 style={{ margin: 0 }}>Sentinel Stream: {selectedCamStream.id}</h3>
                            <button onClick={() => setSelectedCamStream(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>
                                <X size={24} />
                            </button>
                        </div>
                        
                        <div style={{ padding: '1rem 0' }}>
                            <div className="simulated-feed-box" style={{ height: '260px', marginBottom: '1rem', border: '2px solid #00E5FF' }}>
                                <div className="feed-watermark">
                                    <span style={{ color: '#FF5252' }}>🔴 LIVE ENCRYPTED PROTOCOL STREAM</span>
                                    <span>ARGUS 2D GEI BIOMETRIC RECON</span>
                                </div>
                                <div style={{ alignSelf: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                    <Cpu size={36} color="#00E5FF" />
                                    <span style={{ color: '#00E5FF', fontWeight: '800', fontSize: '0.9rem' }}>
                                        ARGUS GAIT RECONGNITION WORKER {isGaitWorkerActive(selectedCamStream.id) ? 'ONLINE' : 'STANDBY'}
                                    </span>
                                </div>
                            </div>

                            {streamEvents.length > 0 && (
                                <div className="bg-gray-900 p-3 rounded-lg border border-gray-700 max-h-40 overflow-y-auto mb-3">
                                    <div className="text-xs font-bold text-gray-400 mb-2 uppercase">Live Detection Stream</div>
                                    {streamEvents.map(evt => (
                                        <div key={evt.event_id} className="text-xs flex justify-between py-1 border-b border-gray-800">
                                            <span className="font-semibold text-green-400">{evt.identity} ({evt.decision})</span>
                                            <span className="font-mono text-cyan-400">{(evt.confidence * 100).toFixed(1)}% Match</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div style={{ fontSize: '0.9rem', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
                                <div><strong>Landmark Installation:</strong> {selectedCamStream.name}</div>
                                <div><strong>Assigned Sector:</strong> {activeZone.name}</div>
                                <div><strong>Hardware Endpoint:</strong> <code>{selectedCamStream.ip}</code></div>
                            </div>
                        </div>

                        <div className="modal-actions-cctv">
                            <button className="btn-submit-cctv" onClick={() => setSelectedCamStream(null)}>
                                Close Stream Window
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Deploy New Custom CCTV Node */}
            {showAddModal && (
                <div className="cctv-modal-overlay">
                    <form className="cctv-modal-card" onSubmit={handleAddCameraSubmit}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                            <h3 style={{ margin: 0, border: 'none', padding: 0 }}>Deploy Custom CCTV Node ({activeZone.id})</h3>
                            <button type="button" onClick={() => setShowAddModal(false)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>
                                <X size={22} />
                            </button>
                        </div>
                        
                        <div className="form-group-cctv">
                            <label>Node Reference Identifier</label>
                            <input type="text" value={newCam.id} disabled style={{ opacity: 0.7 }} />
                        </div>

                        <div className="form-group-cctv">
                            <label>Camera Landmark / Location Name</label>
                            <input 
                                type="text" 
                                placeholder="e.g. Town Hall Intersection Gate 4"
                                value={newCam.name}
                                onChange={(e) => setNewCam({...newCam, name: e.target.value})}
                                required 
                            />
                        </div>

                        <div className="form-group-cctv">
                            <div className="gps-detect-row">
                                <label>GPS Installation Coordinates</label>
                                <button type="button" className="btn-auto-gps" onClick={handleAutoDetectGPS} disabled={isDetectingGPS}>
                                    <MapPin size={14} />
                                    <span>{isDetectingGPS ? 'Detecting GPS...' : 'Auto-Detect Current GPS'}</span>
                                </button>
                            </div>
                            <div className="coords-row-cctv">
                                <input 
                                    type="number" 
                                    step="0.000001"
                                    placeholder="Latitude (e.g. 6.9271)"
                                    value={newCam.lat}
                                    onChange={(e) => setNewCam({...newCam, lat: e.target.value})}
                                    required
                                />
                                <input 
                                    type="number" 
                                    step="0.000001"
                                    placeholder="Longitude (e.g. 79.8612)"
                                    value={newCam.lng}
                                    onChange={(e) => setNewCam({...newCam, lng: e.target.value})}
                                    required
                                />
                            </div>
                        </div>

                        <div className="form-group-cctv">
                            <label>Stream & Recognition Capabilities</label>
                            <select 
                                value={newCam.resolution}
                                onChange={(e) => setNewCam({...newCam, resolution: e.target.value})}
                            >
                                <option value="4K IR PTZ Stream & AI Face Recognition">4K IR PTZ Stream & AI Face Recognition</option>
                                <option value="1080p LPR (License Plate) & Facial Analytics">1080p LPR (License Plate) & Facial Analytics</option>
                                <option value="Thermal Infrared & Biometric Motion Tracking">Thermal Infrared & Biometric Motion Tracking</option>
                            </select>
                        </div>

                        <div className="form-group-cctv">
                            <label>Assigned IP Endpoint</label>
                            <input 
                                type="text" 
                                value={newCam.ip} 
                                onChange={(e) => setNewCam({...newCam, ip: e.target.value})} 
                            />
                        </div>

                        <div className="modal-actions-cctv">
                            <button type="button" className="btn-cancel-cctv" onClick={() => setShowAddModal(false)}>
                                Cancel
                            </button>
                            <button type="submit" className="btn-submit-cctv">
                                Confirm Node Deployment
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default CctvNetwork;
