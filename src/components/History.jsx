import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, User as UserIcon, Search, Filter, RotateCcw, MoreHorizontal, ChevronDown, XCircle, Activity } from 'lucide-react';
import logo from '../assets/logo.png';
import Notifications from './Notifications';
import UserProfileModal from './UserProfileModal';
import { db } from '../firebaseConfig';
import { collection, getDocs } from 'firebase/firestore';
import { useGait } from '../contexts/GaitContext';
import './History.css';

const sortOptions = [
    { value: 'date-desc', label: 'Date (Newest)' },
    { value: 'date-asc', label: 'Date (Oldest)' },
    { value: 'name-asc', label: 'Name (A-Z)' },
    { value: 'name-desc', label: 'Name (Z-A)' },
];

const History = () => {
    const navigate = useNavigate();
    const { events: gaitEvents } = useGait();

    const [showNotifications, setShowNotifications] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState('date-desc');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [cases, setCases] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('cases');
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const fetchCases = async () => {
            try {
                const querySnapshot = await getDocs(collection(db, "cases"));
                const caseList = querySnapshot.docs.map(doc => {
                    const data = doc.data();
                    let createdDate = 0;
                    if (data.createdAt && data.createdAt.seconds) {
                        createdDate = data.createdAt.seconds;
                    } else if (data.createdDate) {
                        createdDate = new Date(data.createdDate).getTime();
                    }
                    return {
                        id: doc.id,
                        name: data.fullName || data.name || 'Unknown',
                        nic: data.nic || '',
                        status: data.status || 'Active',
                        createdDate
                    };
                });
                setCases(caseList);
            } catch (err) {
                console.error("Error fetching cases:", err);
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchCases();
    }, []);

    const handleBack = () => navigate('/dashboard');
    const handleClose = () => navigate('/dashboard');

    const getStatusClass = (status) => {
        switch(status.toLowerCase()) {
            case 'found':
            case 'resolved': return 'resolved';
            case 'investigating':
            case 'active': return 'active';
            case 'cold': return 'cold';
            case 'missing': return 'missing';
            default: return '';
        }
    };

    const filteredAndSortedCases = cases.filter(c => {
        const term = searchTerm.toLowerCase();
        return c.name.toLowerCase().includes(term) || 
               c.nic.toLowerCase().includes(term) || 
               c.id.toLowerCase().includes(term);
    }).sort((a, b) => {
        if (sortBy === 'date-desc') return b.createdDate - a.createdDate;
        if (sortBy === 'date-asc') return a.createdDate - b.createdDate;
        if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
        if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
        return 0;
    });

    const currentSortLabel = sortOptions.find(opt => opt.value === sortBy)?.label || 'Sort by';

    return (
        <div className="history-page">
            {showNotifications && <Notifications onClose={() => setShowNotifications(false)} />}
            {showProfile && <UserProfileModal onClose={() => setShowProfile(false)} />}
            
            <header className="history-header">
                <div className="history-header-left">
                    <button className="history-back-btn" onClick={handleBack}>
                        <ArrowLeft size={24} />
                    </button>
                    <img src={logo} alt="Argus Logo" className="history-logo" />
                    <span className="history-title-text">ARGUS HISTORY</span>
                </div>
                <div className="history-header-right">
                    <div className="user-profile" onClick={() => setShowProfile(true)} style={{ cursor: 'pointer' }}>
                        <UserIcon size={22} fill="#d6e4ea" color="#d6e4ea" />
                        <span>Officer</span>
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

            <div className="history-controls flex items-center justify-between">
                <div className="flex gap-2 bg-gray-900 p-1 rounded-lg">
                    <button
                        onClick={() => setActiveTab('cases')}
                        className={`px-4 py-1.5 rounded-md font-medium text-sm transition-colors ${
                            activeTab === 'cases' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        Case Records ({cases.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('gait')}
                        className={`px-4 py-1.5 rounded-md font-medium text-sm transition-colors flex items-center gap-1.5 ${
                            activeTab === 'gait' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        <Activity size={14} /> Gait Recognition Logs ({gaitEvents.length})
                    </button>
                </div>

                {activeTab === 'cases' && (
                    <div className="flex gap-3">
                        <div className="search-bar">
                            <Search size={20} color="#6b7280" />
                            <input 
                                type="text" 
                                placeholder="Search by Name, NIC, Case ID" 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="custom-dropdown-container" ref={dropdownRef}>
                            <div 
                                className={`custom-dropdown-trigger ${isDropdownOpen ? 'active' : ''}`}
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            >
                                <Filter size={20} />
                                <span>Sort by: {currentSortLabel}</span>
                                <ChevronDown size={20} className={`chevron-icon ${isDropdownOpen ? 'open' : ''}`} />
                            </div>
                            {isDropdownOpen && (
                                <div className="custom-dropdown-menu">
                                    {sortOptions.map(option => (
                                        <div 
                                            key={option.value}
                                            className={`custom-dropdown-item ${sortBy === option.value ? 'selected' : ''}`}
                                            onClick={() => {
                                                setSortBy(option.value);
                                                setIsDropdownOpen(false);
                                            }}
                                        >
                                            {option.label}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <main className="history-content">
                <div className="history-container">
                    <button className="history-close-btn" onClick={handleClose}>
                        <XCircle size={28} fill="#E53935" color="#ffffff" />
                    </button>
                    
                    <div className="history-container-header">
                        <RotateCcw size={24} color="#4ab8bd" />
                        <h2>{activeTab === 'cases' ? 'Case Records Archive' : 'Gait Recognition Telemetry Logs'}</h2>
                    </div>

                    {activeTab === 'gait' ? (
                        <div className="space-y-2 p-2">
                            {gaitEvents.length === 0 ? (
                                <div className="text-center p-8 text-gray-400">No recent gait recognition logs recorded.</div>
                            ) : (
                                gaitEvents.map((evt) => (
                                    <div key={evt.event_id} className="bg-gray-900/80 p-3 rounded-lg border border-gray-700 flex items-center justify-between text-sm">
                                        <div>
                                            <div className="font-bold text-cyan-300">{evt.identity} ({evt.decision})</div>
                                            <div className="text-xs text-gray-400">
                                                Event ID: <span className="font-mono text-gray-300">{evt.event_id}</span> | Camera: <span className="font-mono text-gray-300">{evt.camera_id}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs font-mono text-green-400 font-semibold">
                                                {(evt.confidence * 100).toFixed(1)}% Match
                                            </div>
                                            <div className="text-xs text-gray-500">{new Date(evt.timestamp).toLocaleString()}</div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        <div className="cases-list">
                            {isLoading ? (
                                <div className="history-loading-container">
                                    <div className="history-spinner"></div>
                                    <h3>Loading Case History...</h3>
                                </div>
                            ) : error ? (
                                <div className="history-error-container">
                                    <XCircle size={40} fill="#E53935" color="#ffffff" />
                                    <h3>Error Fetching Cases</h3>
                                    <p>{error}</p>
                                </div>
                            ) : filteredAndSortedCases.length === 0 ? (
                                <div className="history-empty-container">
                                    <Search size={40} color="#5ce1e6" />
                                    <h3>No Cases Found</h3>
                                </div>
                            ) : (
                                filteredAndSortedCases.map((c) => (
                                    <div 
                                        className="case-card" 
                                        key={c.id} 
                                        onClick={() => navigate(`/case/${c.id}`)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <div className="case-card-left">
                                            <div className="case-avatar">
                                                <UserIcon size={48} />
                                            </div>
                                            <div className="case-details">
                                                <span>Case id : {c.id}</span>
                                                <span>Case Name : {c.name}</span>
                                            </div>
                                        </div>
                                        <div className="case-card-right">
                                            <div className={`status-badge ${getStatusClass(c.status)}`}>
                                                <div className={`status-dot ${getStatusClass(c.status)}`}></div>
                                                <span className="status-text">{c.status}</span>
                                            </div>
                                            <button className="more-btn">
                                                <MoreHorizontal size={24} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default History;
