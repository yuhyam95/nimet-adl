import React from 'react';
import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, Plus, Trash2, Save, X, Info } from 'lucide-react';
import styles from './MappingManager.module.css';

interface Mapping {
    id: number;
    provider: string;
    external_key: string;
    internal_field: string;
    conversion_formula: string | null;
}

const MappingManager = () => {
    const queryClient = useQueryClient();
    const [selectedProvider, setSelectedProvider] = React.useState('TAHMO');
    const [isAdding, setIsAdding] = React.useState(false);
    const [newMapping, setNewMapping] = React.useState({
        external_key: '',
        internal_field: '',
        conversion_formula: ''
    });

    const { data: mappings, isLoading } = useQuery({
        queryKey: ['mappings', selectedProvider],
        queryFn: async () => {
            const res = await axios.get(`/api/mappings/${selectedProvider}`);
            return res.data.success ? res.data.data : [];
        }
    });

    const addMutation = useMutation({
        mutationFn: async (mapping: any) => {
            return axios.post('/api/mappings', {
                ...mapping,
                provider: selectedProvider
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['mappings'] });
            setIsAdding(false);
            setNewMapping({ external_key: '', internal_field: '', conversion_formula: '' });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: number) => {
            return axios.delete(`/api/mappings/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['mappings'] });
        }
    });

    const handleDelete = (id: number) => {
        if (window.confirm('Are you sure you want to delete this mapping?')) {
            deleteMutation.mutate(id);
        }
    };

    const handleAdd = () => {
        if (!newMapping.external_key || !newMapping.internal_field) {
            alert('Please fill in both the provider key and the internal field.');
            return;
        }
        addMutation.mutate(newMapping);
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.tabs}>
                    <button 
                        className={selectedProvider === 'TAHMO' ? styles.activeTab : styles.tab}
                        onClick={() => setSelectedProvider('TAHMO')}
                    >
                        TAHMO Mappings
                    </button>
                    <button 
                        className={selectedProvider === 'CLIMDES' ? styles.activeTab : styles.tab}
                        onClick={() => setSelectedProvider('CLIMDES')}
                    >
                        CLIMDES Mappings
                    </button>
                </div>
                
                <button className={styles.addBtn} onClick={() => setIsAdding(true)}>
                    <Plus size={16} /> Add New
                </button>
            </div>

            <div className={styles.content}>
                {isLoading ? (
                    <div className={styles.loading}>Loading mappings...</div>
                ) : (
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Provider Key</th>
                                <th>Internal DB Field</th>
                                <th>Conversion Formula</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isAdding && (
                                <tr className={styles.addingRow}>
                                    <td>
                                        <input 
                                            placeholder="e.g. te"
                                            value={newMapping.external_key}
                                            onChange={e => setNewMapping({...newMapping, external_key: e.target.value})}
                                        />
                                    </td>
                                    <td>
                                        <input 
                                            placeholder="e.g. airTemperature"
                                            value={newMapping.internal_field}
                                            onChange={e => setNewMapping({...newMapping, internal_field: e.target.value})}
                                        />
                                    </td>
                                    <td>
                                        <input 
                                            placeholder="e.g. x / 1000"
                                            value={newMapping.conversion_formula}
                                            onChange={e => setNewMapping({...newMapping, conversion_formula: e.target.value})}
                                        />
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button className={styles.saveBtn} onClick={handleAdd}>
                                            <Save size={14} />
                                        </button>
                                        <button className={styles.cancelBtn} onClick={() => setIsAdding(false)}>
                                            <X size={14} />
                                        </button>
                                    </td>
                                </tr>
                            )}
                            {mappings?.map((mapping: Mapping) => (
                                <tr key={mapping.id}>
                                    <td><code className={styles.code}>{mapping.external_key}</code></td>
                                    <td><span className={styles.field}>{mapping.internal_field}</span></td>
                                    <td>{mapping.conversion_formula || <span className={styles.none}>None</span>}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button className={styles.deleteBtn} onClick={() => handleDelete(mapping.id)}>
                                            <Trash2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {mappings?.length === 0 && !isAdding && (
                                <tr>
                                    <td colSpan={4} className={styles.empty}>No mappings configured for this provider.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
            
            <div className={styles.footer}>
                <Info size={16} />
                <p>Internal DB fields should match the column names in the <code>weather_readings</code> table.</p>
            </div>
        </div>
    );
};

export default MappingManager;
