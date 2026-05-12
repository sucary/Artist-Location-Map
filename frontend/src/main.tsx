import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SettingsPage } from './components/Settings/SettingsPage'
import { AboutPage } from './components/AboutPage'
import { AuthProvider } from './context/AuthContext'
import { LocationLanguageProvider } from './context/LocationLanguageContext'
import { ArtistNameDisplayProvider } from './context/ArtistNameDisplayContext'
import i18n from './i18n';

const queryClient = new QueryClient();
const storedTileTheme = localStorage.getItem('mapLibreTileTheme');

if (storedTileTheme === 'dark' || storedTileTheme === 'light') {
    document.documentElement.dataset.theme = storedTileTheme;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <AuthProvider>
                    <LocationLanguageProvider>
                        <ArtistNameDisplayProvider>
                            <Routes>
                                <Route path="/" element={<App />} />
                                <Route path="/u/:username" element={<App />} />
                                <Route path="/settings" element={<SettingsPage />} />
                                <Route path="/about" element={<AboutPage />} />
                            </Routes>
                        </ArtistNameDisplayProvider>
                    </LocationLanguageProvider>
                </AuthProvider>
            </BrowserRouter>
        </QueryClientProvider>
    </I18nextProvider>,
);
