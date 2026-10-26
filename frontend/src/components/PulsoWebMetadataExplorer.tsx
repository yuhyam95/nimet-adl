import React from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';

interface PulsoWebMetadataExplorerProps {
    enabled: boolean;
}

interface Granularity {
    code: string | number;
    label?: string;
    description?: string;
}

interface Observation {
    code: string | number;
    label?: string;
    description?: string;
    unit?: string;
    stationsCount?: number;
}

interface PulsoStation {
    code: string | number;
    name?: string;
}

const PulsoWebMetadataExplorer = ({ enabled }: PulsoWebMetadataExplorerProps) => {
    const [granularity, setGranularity] = React.useState('');
    const [observationCode, setObservationCode] = React.useState('');

    const granularitiesQuery = useQuery({
        queryKey: ['pulsoweb', 'granularities'],
        enabled,
        queryFn: async () => {
            const response = await axios.get('/api/providers/pulsoweb/granularities');
            return response.data.data || [];
        }
    });

    React.useEffect(() => {
        const firstCode = granularitiesQuery.data?.[0]?.code;
        if (!granularity && firstCode !== undefined) setGranularity(String(firstCode));
    }, [granularitiesQuery.data, granularity]);

    const observationsQuery = useQuery({
        queryKey: ['pulsoweb', 'observations', granularity],
        enabled: enabled && Boolean(granularity),
        queryFn: async () => {
            const response = await axios.get(`/api/providers/pulsoweb/observations/${encodeURIComponent(granularity)}`);
            return response.data.data || [];
        }
    });

    const stationsQuery = useQuery({
        queryKey: ['pulsoweb', 'stations', observationCode],
        enabled: enabled && Boolean(observationCode),
        queryFn: async () => {
            const response = await axios.get(`/api/providers/pulsoweb/stations/${encodeURIComponent(observationCode)}`);
            return response.data.data || [];
        }
    });

    if (!enabled) {
        return <p style={{ color: '#6b7280' }}>Configure a PulsoWeb API token to browse station and observation metadata.</p>;
    }

    if (granularitiesQuery.isError) {
        return <p style={{ color: '#b91c1c' }}>Unable to load PulsoWeb metadata. Test the connection and verify the API token.</p>;
    }

    return (
        <div style={{ display: 'grid', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <label htmlFor="pulsoweb-granularity" style={{ fontWeight: 600 }}>Granularity</label>
                <select
                    id="pulsoweb-granularity"
                    value={granularity}
                    onChange={event => {
                        setGranularity(event.target.value);
                        setObservationCode('');
                    }}
                    style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                >
                    {(granularitiesQuery.data || []).map((item: Granularity) => (
                        <option key={String(item.code)} value={String(item.code)}>
                            {item.label || item.description || item.code} ({item.code})
                        </option>
                    ))}
                </select>
            </div>

            {observationsQuery.isLoading ? (
                <p>Loading PulsoWeb observations…</p>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                                <th style={{ padding: '10px' }}>Code</th>
                                <th style={{ padding: '10px' }}>Observation</th>
                                <th style={{ padding: '10px' }}>Unit</th>
                                <th style={{ padding: '10px' }}>Stations</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(observationsQuery.data || []).map((item: Observation) => (
                                <tr key={String(item.code)} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '10px' }}><code>{item.code}</code></td>
                                    <td style={{ padding: '10px' }}>{item.label || item.description || 'Unnamed observation'}</td>
                                    <td style={{ padding: '10px' }}>{item.unit || '—'}</td>
                                    <td style={{ padding: '10px' }}>
                                        <button
                                            type="button"
                                            onClick={() => setObservationCode(String(item.code))}
                                            style={{ border: 0, background: 'none', color: '#2563eb', cursor: 'pointer', padding: 0 }}
                                        >
                                            {item.stationsCount ?? 0} station(s)
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {observationCode && (
                <div style={{ padding: '14px', borderRadius: '8px', background: '#f8fafc' }}>
                    <strong>Stations reporting observation {observationCode}</strong>
                    {stationsQuery.isLoading ? (
                        <p>Loading stations…</p>
                    ) : (
                        <p style={{ marginBottom: 0, color: '#475569' }}>
                            {(stationsQuery.data || []).map((station: PulsoStation) => `${station.name || 'Unnamed'} (${station.code})`).join(', ') || 'No stations report this observation.'}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default PulsoWebMetadataExplorer;
