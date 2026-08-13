import React, { useState, useEffect } from 'react';
import { 
    User, Bell, Search, Video, Clock, Activity, 
    ShieldAlert, Eye, MapPin, ChevronRight, Radio 
} from 'lucide-react';
import logo from '../assets/logo.png';
import './Dashboard.css';
import { useNavigate } from 'react-router-dom';
import MapComponent from './Map';
import Notifications from './Notifications';
import UserProfileModal from './UserProfileModal';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebaseConfig';
import { collection, getDocs, onSnapshot, query } from 'firebase/firestore';
import GaitSystemStatus from './GaitSystemStatus';
import RecognitionEvents from './RecognitionEvents';

const CountUp = ({ end, duration }) => {
    const [count, setCount] = useState(0);

    useEffect(() => {
        let startTime = null;
        let animationFrame;
        const finalDuration = duration || Math.min(2000, Math.max(800, end * 250));

        const animate = (currentTime) => {
            if (!startTime) startTime = currentTime;
            const progress = currentTime - startTime;
            const percentage = Math.min(progress / finalDuration, 1);
            const easeOutCubic = 1 - Math.pow(1 - percentage, 3);
            const currentCount = Math.floor(end * easeOutCubic);

            setCount(currentCount);

            if (progress < finalDuration) {
                animationFrame = requestAnimationFrame(animate);
            } else {
                setCount(end);
            }
        };

        animationFrame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrame);
    }, [end, duration]);

    return (
        <span>{count.toString().padStart(2, '0')}</span>
    );
};

const Dashboard = () => {
    const navigate = useNavigate();
    const { currentUser, userRole, logout } = useAuth();

    const [cases, setCases] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [showNotifications, setShowNotifications] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);

    useEffect(() => {
        const fetchCases = async () => {
            try {
                const querySnapshot = await getDocs(collection(db, "cases"));
                const caseList = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setCases(caseList);
            } catch (error) {
                console.error("Error fetching cases: ", error);
            }
        };

        fetchCases();

        const q = query(collection(db, "detections"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setUnreadCount(snapshot.docs.length);
        }, (error) => {
            console.error("Error subscribing to detections: ", error);
        });

        return () => unsubscribe();
    }, []);

    const totalCases = cases.length;
    const missingCases = cases.filter(c => c.status === 'Missing').length;
    const investigatingCases = cases.filter(c => c.status === 'Investigating').length;
    const foundCases = cases.filter(c => c.status === 'Found' || c.status === 'Resolved').length;
    const coldCases = cases.filter(c => c.status === 'Cold').length;

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/');
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

    return (
        <div className="dashboard-container">
            <header className="command-header">
                <div className="header-brand-group">
                    <img src={logo} alt="ARGUS Logo" className="header-logo" />
                    <div className="brand-titles">
                        <span className="system-code">ARGUS-V0.1 // COMMAND</span>
                        <h1 className="header-title">MISSING PERSONS RECON SYSTEM</h1>
                    </div>
                </div>

                <div className="header-controls-group">
                    <div className="notification-wrapper flex items-center gap-2">
                        <button 
                            className="icon-btn notification-btn" 
                            onClick={() => setShowNotifications(!showNotifications)}
                            title="Notifications"
                        >
                            <Bell size={18} />
                            {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
                        </button>
                        {showNotifications && (
                            <Notifications onClose={() => setShowNotifications(false)} />
                        )}
                    </div>

                    <div className="user-profile-widget" onClick={() => setShowProfileModal(true)}>
                        <div className="avatar-circle">
                            <User size={16} />
                        </div>
                        <div className="user-text-info">
                            <span className="user-name">{currentUser?.displayName || currentUser?.email || 'Officer'}</span>
                            <span className="user-role">{userRole ? userRole.toUpperCase() : 'INVESTIGATOR'}</span>
                        </div>
                    </div>
                </div>
            </header>

            {showProfileModal && (
                <UserProfileModal 
                    user={currentUser} 
                    role={userRole} 
                    onClose={() => setShowProfileModal(false)} 
                    onLogout={handleLogout}
                />
            )}

            <main className="command-workspace">
                <section className="tactical-map-pane">
                    <div className="map-hud-ribbon">
                        <div className="hud-metric-pill total">
                            <span className="hud-label">TOTAL CASES</span>
                            <span className="hud-value white"><CountUp end={totalCases} /></span>
                        </div>
                        <div className="hud-metric-pill missing">
                            <span className="hud-label">MISSING</span>
                            <span className="hud-value red"><CountUp end={missingCases} /></span>
                        </div>
                        <div className="hud-metric-pill active-case">
                            <span className="hud-label">INVESTIGATING</span>
                            <span className="hud-value yellow"><CountUp end={investigatingCases} /></span>
                        </div>
                        <div className="hud-metric-pill found">
                            <span className="hud-label">RESOLVED / FOUND</span>
                            <span className="hud-value green"><CountUp end={foundCases} /></span>
                        </div>
                        <div className="hud-metric-pill cold">
                            <span className="hud-label">COLD CASES</span>
                            <span className="hud-value blue"><CountUp end={coldCases} /></span>
                        </div>
                    </div>

                    <div className="tactical-map-viewport">
                        <MapComponent cases={cases} />
                        <div className="zone-status-bar">
                            <div className="status-indicator">
                                <Radio className="pulsing-radio" size={16} />
                                <span>CCTV SURVEILLANCE GRID ACTIVE</span>
                            </div>
                            <span className="zone-ready-text">ARGUS Gait Engine Integrated</span>
                        </div>
                    </div>
                </section>

                <aside className="operations-dock flex flex-col gap-4">
                    <GaitSystemStatus />

                    <div className="quick-command-section">
                        <h3 className="dock-section-title">OPERATIONAL COMMANDS</h3>
                        <div className="command-cards-grid">
                            <div className="command-action-card primary" onClick={() => navigate('/report-case')}>
                                <div className="card-icon-wrapper red-glow">
                                    <Search size={22} color="#FF5252" />
                                </div>
                                <div className="card-text-wrapper">
                                    <h4>Find a Missing Person</h4>
                                    <p>Deploy active search profile & intelligence</p>
                                </div>
                                <ChevronRight size={18} className="chevron" />
                            </div>

                            <div className="command-action-card secondary" onClick={() => navigate('/cctv-network')}>
                                <div className="card-icon-wrapper cyan-glow">
                                    <Video size={22} color="#00E5FF" />
                                </div>
                                <div className="card-text-wrapper">
                                    <h4>CCTV Zones</h4>
                                    <p>Configure AI sentinel nodes & surveillance perimeters</p>
                                </div>
                                <ChevronRight size={18} className="chevron" />
                            </div>

                            <div className="command-action-card tertiary" onClick={() => navigate('/history')}>
                                <div className="card-icon-wrapper ice-glow">
                                    <Clock size={22} color="#42A5F5" />
                                </div>
                                <div className="card-text-wrapper">
                                    <h4>Investigation History</h4>
                                    <p>Access archived case logs & sighting trails</p>
                                </div>
                                <ChevronRight size={18} className="chevron" />
                            </div>
                        </div>
                    </div>

                    <RecognitionEvents />
                </aside>
            </main>
        </div>
    );
};

export default Dashboard;
