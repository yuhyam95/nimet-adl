import React, { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import Papa from 'papaparse';
import { ArrowLeft, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import styles from './AddStation.module.css';

const AddStation = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'manual' | 'bulk'>('manual');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Form state for manual addition
    const [formData, setFormData] = useState({
        station_id: '',
        station_name: '',
        latitude: '',
        longitude: '',
        provider: 'MANUAL',
        organization: '',
        wigos_id: '',
        country: 'Nigeria',
        model: '',
        location_type: ''
    });

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        setIsLoading(true);

        try {
            // Convert latitude and longitude to numbers if provided
            const payload = {
                ...formData,
                latitude: formData.latitude ? parseFloat(formData.latitude) : null,
                longitude: formData.longitude ? parseFloat(formData.longitude) : null,
            };

            const res = await axios.post('/api/stations', payload);
            
            if (res.data.success) {
                setMessage({ type: 'success', text: `Station ${formData.station_name || formData.station_id} added successfully.` });
                setTimeout(() => navigate('/stations'), 2000);
            }
        } catch (error: any) {
            setMessage({ 
                type: 'error', 
                text: error.response?.data?.error || 'Failed to add station. Please try again.' 
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setMessage(null);
        setIsLoading(true);

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                try {
                    const stations = results.data.map((row: any) => ({
                        ...row,
                        latitude: row.latitude ? parseFloat(row.latitude) : null,
                        longitude: row.longitude ? parseFloat(row.longitude) : null,
                    }));

                    if (stations.length === 0) {
                        throw new Error('No valid data found in CSV.');
                    }

                    const res = await axios.post('/api/stations/bulk', { stations });
                    
                    if (res.data.success) {
                        setMessage({ type: 'success', text: `Successfully imported ${res.data.count} stations.` });
                        setTimeout(() => navigate('/stations'), 2000);
                    }
                } catch (error: any) {
                    setMessage({ 
                        type: 'error', 
                        text: error.response?.data?.error || error.message || 'Failed to import stations from CSV.' 
                    });
                    setIsLoading(false);
                }
            },
            error: (error) => {
                setMessage({ type: 'error', text: `CSV Parsing Error: ${error.message}` });
                setIsLoading(false);
            }
        });
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <Link to="/stations" className={styles.backBtn}>
                        <ArrowLeft size={16} /> Back to Data Loggers
                    </Link>
                    <h2>Add New Station</h2>
                </div>
            </div>

            <div className={styles.tabs}>
                <button 
                    className={`${styles.tab} ${activeTab === 'manual' ? styles.active : ''}`}
                    onClick={() => { setActiveTab('manual'); setMessage(null); }}
                >
                    Manual Entry
                </button>
                <button 
                    className={`${styles.tab} ${activeTab === 'bulk' ? styles.active : ''}`}
                    onClick={() => { setActiveTab('bulk'); setMessage(null); }}
                >
                    Bulk Import (CSV)
                </button>
            </div>

            {message && (
                <div className={`${styles.alert} ${styles[message.type]}`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                        <span>{message.text}</span>
                    </div>
                </div>
            )}

            <div className={styles.formCard}>
                {activeTab === 'manual' ? (
                    <form onSubmit={handleManualSubmit}>
                        <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                                <label className={styles.label} htmlFor="station_id">Station ID (Required)</label>
                                <input 
                                    type="text" 
                                    id="station_id" 
                                    name="station_id" 
                                    className={styles.input} 
                                    required 
                                    value={formData.station_id}
                                    onChange={handleInputChange}
                                    placeholder="e.g., NMT-001"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label} htmlFor="station_name">Station Name</label>
                                <input 
                                    type="text" 
                                    id="station_name" 
                                    name="station_name" 
                                    className={styles.input} 
                                    value={formData.station_name}
                                    onChange={handleInputChange}
                                    placeholder="e.g., Abuja Central"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label} htmlFor="latitude">Latitude</label>
                                <input 
                                    type="number" 
                                    step="any"
                                    id="latitude" 
                                    name="latitude" 
                                    className={styles.input} 
                                    value={formData.latitude}
                                    onChange={handleInputChange}
                                    placeholder="e.g., 9.0765"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label} htmlFor="longitude">Longitude</label>
                                <input 
                                    type="number" 
                                    step="any"
                                    id="longitude" 
                                    name="longitude" 
                                    className={styles.input} 
                                    value={formData.longitude}
                                    onChange={handleInputChange}
                                    placeholder="e.g., 7.3986"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label} htmlFor="provider">Provider</label>
                                <input 
                                    type="text" 
                                    id="provider" 
                                    name="provider" 
                                    className={styles.input} 
                                    value={formData.provider}
                                    onChange={handleInputChange}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label} htmlFor="wigos_id">WIGOS ID</label>
                                <input 
                                    type="text" 
                                    id="wigos_id" 
                                    name="wigos_id" 
                                    className={styles.input} 
                                    value={formData.wigos_id}
                                    onChange={handleInputChange}
                                    placeholder="e.g., 0-566-0-ABJ"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label} htmlFor="organization">Organization</label>
                                <input 
                                    type="text" 
                                    id="organization" 
                                    name="organization" 
                                    className={styles.input} 
                                    value={formData.organization}
                                    onChange={handleInputChange}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label} htmlFor="country">Country</label>
                                <input 
                                    type="text" 
                                    id="country" 
                                    name="country" 
                                    className={styles.input} 
                                    value={formData.country}
                                    onChange={handleInputChange}
                                />
                            </div>
                        </div>

                        <div className={styles.actions}>
                            <Link to="/stations" className={styles.cancelBtn}>Cancel</Link>
                            <button type="submit" className={styles.submitBtn} disabled={isLoading || !formData.station_id}>
                                {isLoading ? 'Adding...' : 'Add Station'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div>
                        <input 
                            type="file" 
                            accept=".csv" 
                            className={styles.fileInput} 
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                        />
                        <div className={styles.fileDropZone} onClick={triggerFileInput}>
                            <Upload size={48} color="var(--primary)" />
                            <h3>Upload CSV File</h3>
                            <p>Click here to select a CSV file containing station data.</p>
                            <p style={{ fontSize: '0.85rem', marginTop: '8px' }}>
                                The CSV must contain a <strong>station_id</strong> column. Other valid columns include 
                                station_name, latitude, longitude, provider, wigos_id, etc.
                            </p>
                        </div>
                        {isLoading && (
                            <div style={{ textAlign: 'center', marginTop: '16px', color: 'var(--text-muted)' }}>
                                Processing CSV... Please wait.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AddStation;
