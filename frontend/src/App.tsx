import { useState, useEffect } from 'react';
import './App.css';
import { checkHealth } from './services/api';
import MapView from './components/Map/MapView';

function App() {
    const [status, setStatus] = useState<string>('Checking connection...');
    const [lastChecked, setLastChecked] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        const verifyConnection = async () => {
            try {
                const data = await checkHealth();
                if (mounted) {
                    setStatus(data.message);
                    setLastChecked(new Date().toLocaleTimeString());
                }
            } catch (error) {
                if (mounted) {
                    setStatus('Connection failed. Is the backend running?');
                    console.error(error);
                }
            }
        };

        verifyConnection();

        return () => {
            mounted = false;
        };
    }, []);

    return (
        <div className="app-container" style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
            <div style={{ 
                position: 'absolute', 
                top: 10, 
                right: 10, 
                zIndex: 1000, 
                background: 'white', 
                padding: '10px', 
                borderRadius: '5px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
            }}>
                <div style={{ fontSize: '12px', marginBottom: '5px' }}>
                    Backend: <span style={{ 
                        color: status.includes('running') ? 'green' : 'red',
                        fontWeight: 'bold'
                    }}>{status}</span>
                </div>
                {lastChecked && <div style={{ fontSize: '10px', color: '#666' }}>Checked: {lastChecked}</div>}
            </div>
            
            <MapView />
        </div>
    );
}

export default App;
