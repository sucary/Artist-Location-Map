import { useState, useEffect } from 'react';
import './App.css';
import { checkHealth } from './services/api';
import MapView from './components/Map/MapView';

function App() {
    const [status, setStatus] = useState<string>('Checking connection...');

    useEffect(() => {
        let mounted = true;

        const verifyConnection = async () => {
            try {
                const data = await checkHealth();
                if (mounted) 
                    {setStatus(data.message);
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

    /* 
        TODO
            - Make shadowing consistent (shadow-xl/30 vs shadow-md)
            - Add a proper locate icon instead of "X"
            

    */

    return (
        <div className="h-screen w-screen flex flex-col">
            <div className="absolute top-2 right-2 z-[1000] bg-white p-2 rounded-md shadow-md">
                <div className="text-xs">
                    Backend: <span className={`font-bold ${status.includes('running') ? 'text-green-600' : 'text-red-600'}`}>
                        {status}
                    </span>
                </div>
            </div>
            <MapView />
        </div>
    );
};

export default App;
