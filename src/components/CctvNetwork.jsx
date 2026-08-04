import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    ArrowLeft, Video, Radio, Plus, MapPin, Wifi, 
    Cpu, Eye, X, AlertTriangle, CheckCircle, Bell, User as UserIcon 
} from 'lucide-react';
import { SURVEILLANCE_ZONES, CCTV_CAMERAS as INITIAL_CAMERAS, triggerSimulatedDetection } from '../utils/cctvService';
import { getDeviceGPS } from '../utils/geoService';
import { db } from '../firebaseConfig';
import { collection, getDocs } from 'firebase/firestore';
import logo from '../assets/logo.png';
import Notifications from './Notifications';
import UserProfileModal from './UserProfileModal';
import { useAuth } from '../contexts/AuthContext';
import './CctvNetwork.css';
import './History.css';

const CctvNetwork = ({ isAdmin = false }) => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [showNotifications, setShowNotifications] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const [activeZoneId, setActiveZoneId] = useState(SURVEILLANCE_ZONES[0]?.id || 'Z01');
    const [allCameras, setAllCameras] = useState([]);
    const [casesList, setCasesList] = useState([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedCamStream, setSelectedCamStream] = useState(null);
    const [isDetectingGPS, setIsDetectingGPS] = useState(false);

    const [newCam, setNewCam] = useState({
        id: `CCTV-${Math.floor(100 + Math.random() * 900)}`,
        name: '',
        lat: '',
        lng: '',
        resolution: '4K IR PTZ Stream & AI Face Recognition',
        ip: `192.168.${Math.floor(10 + Math.random() * 80)}.${Math.floor(10 + Math.random() * 240)}`,
        status: 'ONLINE'
    });

    // Load cameras from initial config + localStorage for custom added nodes
    useEffect(() => {
        const storedCustom = localStorage.getItem('argus_custom_cctv_nodes');
        let parsedCustom = [];
        if (storedCustom) {
            try {
                parsedCustom = JSON.parse(storedCustom);
            } catch (e) {
                console.error("Error parsing custom CCTV nodes:", e);
            }
        }
        setAllCameras([...INITIAL_CAMERAS, ...parsedCustom]);
    }, []);

    // Fetch active cases from Firestore to feed realistic AI simulations
    useEffect(() => {
        const fetchCases = async () => {
            try {
                const snapshot = await getDocs(collection(db, 'victims'));
                const list = [];
                snapshot.forEach(doc => {
                    list.push({ id: doc.id, ...doc.data() });
                });
                setCasesList(list);
            } catch (error) {
                console.error("Error loading target cases:", error);
            }
        };
        fetchCases();
    }, []);

    const activeZone = SURVEILLANCE_ZONES.find(z => z.id === activeZoneId) || SURVEILLANCE_ZONES[0];
    const activeZoneCameras = allCameras.filter(cam => cam.zoneId === activeZoneId);

    const handleSimulateAlert = async (cam) => {
        try {
            const targetSubject = casesList.length > 0 
                ? casesList[Math.floor(Math.random() * casesList.length)] 
                : { id: 'DEMO-TARGET', name: 'Simulated Target Subject (Demo)' };

            await triggerSimulatedDetection(cam, targetSubject);
            alert(`🚨 AI SURVEILLANCE ALARM TRIGGERED!\n\nCamera Node: [${cam.id}] ${cam.name}\nTarget Matched: ${targetSubject.name || 'Subject'}\n\nLive GPS coordinates and pursuit path have been broadcasted to the main ARGUS surveillance map!`);
        } catch (err) {
            alert("Simulation Failed: " + err.message);
        }
    };

    const handleAutoDetectGPS = async () => {
        setIsDetectingGPS(true);
        try {
            const pos = await getDeviceGPS();
            setNewCam(prev => ({
                ...prev,
                lat: pos.lat.toFixed(6),
                lng: pos.lng.toFixed(6)
            }));
        } catch (err) {
            alert("Unable to acquire GPS coordinates: " + err.message);
        } finally {
            setIsDetectingGPS(false);
        }
    };

    const handleAddCameraSubmit = (e) => {
        e.preventDefault();
        if (!newCam.name || !newCam.lat || !newCam.lng) {
            alert("Please fill in camera landmark name and GPS coordinates.");
            return;
        }

        const newCamObj = {
            ...newCam,
            lat: parseFloat(newCam.lat),
            lng: parseFloat(newCam.lng),
            zoneId: activeZoneId
        };

        const updatedAll = [...allCameras, newCamObj];
        setAllCameras(updatedAll);

        // Store custom added cameras separately to localStorage
        const customOnly = updatedAll.filter(c => !INITIAL_CAMERAS.some(ic => ic.id === c.id));
        localStorage.setItem('argus_custom_cctv_nodes', JSON.stringify(customOnly));

        setShowAddModal(false);
        setNewCam({
            id: `CCTV-${Math.floor(100 + Math.random() * 900)}`,
            name: '',
            lat: '',
            lng: '',
            resolution: '4K IR PTZ Stream & AI Face Recognition',
            ip: `192.168.${Math.floor(10 + Math.random() * 80)}.${Math.floor(10 + Math.random() * 240)}`,
            status: 'ONLINE'
        });
    };

    return (
        <div className="cctv-network-container">
            <Notifications isOpen={showNotifications} onClose={() => setShowNotifications(false)} />
            <UserProfileModal isOpen={showProfile} onClose={() => setShowProfile(false)} />

            <header className="history-header">
                <div className="history-header-left">
                    <button className="history-back-btn" onClick={() => navigate(isAdmin ? '/admin/dashboard' : '/dashboard')}>
                        <ArrowLeft size={24} />
                    </button>
                    <img src={logo} alt="Argus Logo" className="history-logo" />
                    <span className="history-title-text">ARGUS</span>
                </div>
                <div className="history-header-right">
                    <div className="user-profile" onClick={() => setShowProfile(true)} style={{ cursor: 'pointer' }}>
                        <UserIcon size={22} fill="#d6e4ea" color="#d6e4ea" />
                        <span>{currentUser?.username || 'Operator'}</span>
                    </div>
                    <Bell
                        size={22}
                        className="notification-bell"
                        fill="#5ce1e6"
                        color="#5ce1e6"
                        onClick={() => setShowNotifications(true)}
                        style={{ cursor: 'pointer' }}
                    />
                </div>
            </header>

            <main className="cctv-body">
                <div className="cctv-header-banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid rgba(0,229,255,0.15)', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Video size={28} color="#00E5FF" />
                            <span>CCTV Zones</span>
                        </h1>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)' }}>
                            Geospatial AI camera sector management and automated pursuit alert telemetry
                        </p>
                    </div>
                    <div className="nav-stats-pills" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <div className="status-pill active">
                            <span className="status-dot"></span>
                            <span>AI Recognition Engine: 36 FPS [ONLINE]</span>
                        </div>
                        <div className="status-pill">
                            <Wifi size={14} color="#00E5FF" />
                            <span>Active Nodes: {allCameras.length}</span>
                        </div>
                        <div className="status-pill">
                            <Radio size={14} color="#5CE1E6" />
                            <span>Zones Configured: {SURVEILLANCE_ZONES.length}</span>
                        </div>
                    </div>
                </div>
                {/* Zone Sector Tabs */}
                <div className="zone-tabs-section">
                    <div className="tabs-list">
                        {SURVEILLANCE_ZONES.map((z) => {
                            const isSelected = z.id === activeZoneId;
                            const count = allCameras.filter(c => c.zoneId === z.id).length;
                            return (
                                <button
                                    key={z.id}
                                    type="button"
                                    className={`zone-tab-btn ${isSelected ? 'selected' : ''}`}
                                    onClick={() => setActiveZoneId(z.id)}
                                >
                                    <Radio size={16} color={isSelected ? '#00E5FF' : '#888'} />
                                    <span>{z.id}: {z.name.split('(')[0].trim()} ({count})</span>
                                </button>
                            );
                        })}
                    </div>
                    <button 
                        className="deploy-cam-btn"
                        onClick={() => setShowAddModal(true)}
                    >
                        <Plus size={18} />
                        <span>Deploy CCTV Node in {activeZone.id}</span>
                    </button>
                </div>

                {/* Active Zone Summary Card */}
                <div className="zone-summary-card">
                    <div className="zone-summary-left">
                        <h2>{activeZone.name}</h2>
                        <p>{activeZone.description || 'High-density commercial and transit junction equipped with real-time biometric video surveillance and automated alert broadcasting.'}</p>
                    </div>
                    <div className="zone-summary-right">
                        <div className="zone-metric-box">
                            <span className="metric-label">Sector Radius</span>
                            <span className="metric-value">{Math.round((activeZone.radius || 4000)/1000)} km</span>
                        </div>
                        <div className="zone-metric-box">
                            <span className="metric-label">Sector Center GPS</span>
                            <span className="metric-value" style={{ fontSize: '1rem', fontFamily: 'monospace' }}>
                                {activeZone.center[0].toFixed(4)}° N, {activeZone.center[1].toFixed(4)}° E
                            </span>
                        </div>
                        <div className="zone-metric-box">
                            <span className="metric-label">Operational Status</span>
                            <span className="metric-value" style={{ color: '#4CAF50' }}>ACTIVE</span>
                        </div>
                    </div>
                </div>

                {/* CCTV Cameras Grid */}
                <section className="cctv-grid-section">
                    <div className="cctv-grid-header">
                        <h3>Deployed Camera Nodes in {activeZone.name.split('(')[0]} ({activeZoneCameras.length})</h3>
                    </div>

                    <div className="cameras-grid">
                        {activeZoneCameras.length === 0 ? (
                            <div style={{ color: '#888', padding: '2rem 0' }}>
                                No surveillance nodes currently deployed in this sector. Use "Deploy CCTV Node" to add simulated hardware.
                            </div>
                        ) : (
                            activeZoneCameras.map((cam) => (
                                <div key={cam.id} className="cctv-camera-card">
                                    <div className="cam-card-header">
                                        <span className="cam-id-tag">{cam.id}</span>
                                        <span className="cam-status-indicator">
                                            <span className="status-dot"></span>
                                            {cam.status || 'ONLINE'}
                                        </span>
                                    </div>
                                    
                                    <div className="cam-card-body">
                                        <h4>{cam.name}</h4>
                                        
                                        {/* Simulated AI Video Interface */}
                                        <div className="simulated-feed-box">
                                            <div className="feed-watermark">
                                                <span>REC ⬤ [AI ENGINE ACTIVE]</span>
                                                <span>{new Date().toLocaleTimeString()}</span>
                                            </div>
                                            
                                            <div className="radar-target-box">
                                                <span>⚡ SCANNING FOR BIOMETRIC MATCHES...</span>
                                            </div>

                                            <div className="feed-telemetry">
                                                IP: {cam.ip || '192.168.1.100'} | FPS: 36 | YOLOv8-Vision
                                            </div>
                                        </div>

                                        <div className="cam-specs-list">
                                            <div className="spec-row">
                                                <span>Resolution / Stream</span>
                                                <span className="spec-val">{cam.resolution}</span>
                                            </div>
                                            <div className="spec-row">
                                                <span>Coordinates</span>
                                                <span className="spec-val" style={{ fontFamily: 'monospace' }}>
                                                    {cam.lat.toFixed(4)}°, {cam.lng.toFixed(4)}°
                                                </span>
                                            </div>
                                        </div>

                                        <div className="cam-card-actions">
                                            <button 
                                                className="trigger-alarm-btn"
                                                onClick={() => handleSimulateAlert(cam)}
                                            >
                                                <span>🚨 Simulate Recognition Alert Here</span>
                                            </button>
                                            
                                            <button 
                                                className="stream-details-btn"
                                                onClick={() => setSelectedCamStream(cam)}
                                            >
                                                👁️ View Live Node Telemetry & Stream
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </main>

            {/* Modal: View Focused Node Stream Telemetry */}
            {selectedCamStream && (
                <div className="cctv-modal-overlay">
                    <div className="cctv-modal-card" style={{ maxWidth: '640px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '0.8rem' }}>
                            <h3 style={{ margin: 0, border: 'none', padding: 0 }}>🎥 Node Stream Diagnostics: {selectedCamStream.id}</h3>
                            <button onClick={() => setSelectedCamStream(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>
                                <X size={24} />
                            </button>
                        </div>
                        
                        <div style={{ padding: '1rem 0' }}>
                            <div className="simulated-feed-box" style={{ height: '260px', marginBottom: '1rem', border: '2px solid #00E5FF' }}>
                                <div className="feed-watermark">
                                    <span style={{ color: '#FF5252' }}>⬤ LIVE ENCRYPTED PROTOCOL STREAM</span>
                                    <span>4K IR COLOR NIGHT-VISION</span>
                                </div>
                                <div style={{ alignSelf: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                    <Cpu size={36} color="#00E5FF" />
                                    <span style={{ color: '#00E5FF', fontWeight: '800', fontSize: '0.9rem' }}>
                                        AI COMPUTER VISION EMBEDDED CHIP ONLINE
                                    </span>
                                    <span style={{ color: '#CCC', fontSize: '0.78rem' }}>
                                        Continuous comparison against ARGUS active missing persons database
                                    </span>
                                </div>
                                <div className="feed-telemetry" style={{ background: 'rgba(0, 229, 255, 0.15)', color: '#FFF' }}>
                                    Bandwidth: 14.2 Mbps | Packet Loss: 0.0% | Encoding: H.265+ | Latency: 12ms
                                </div>
                            </div>

                            <div style={{ fontSize: '0.9rem', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
                                <div><strong>Landmark Installation:</strong> {selectedCamStream.name}</div>
                                <div><strong>Assigned Sector:</strong> {activeZone.name}</div>
                                <div><strong>Hardware IP Endpoint:</strong> <code>{selectedCamStream.ip}</code></div>
                                <div><strong>Exact GPS Placement:</strong> <code>{selectedCamStream.lat}, {selectedCamStream.lng}</code></div>
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
                                <option value="Ultra-HD Omni-Directional 360° AI Feed">Ultra-HD Omni-Directional 360° AI Feed</option>
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
                                🚀 Confirm Node Deployment
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default CctvNetwork;
