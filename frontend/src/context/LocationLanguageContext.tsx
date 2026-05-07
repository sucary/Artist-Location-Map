import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { LocationLanguage } from '../types/artist';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { API_URL } from '../services/api';

const STORAGE_KEY = 'locationLanguage';
const DEFAULT_LANGUAGE: LocationLanguage = 'en';

interface LocationLanguageContextType {
    locationLanguage: LocationLanguage;
    setLocationLanguage: (lang: LocationLanguage) => void;
}

const LocationLanguageContext = createContext<LocationLanguageContextType | undefined>(undefined);

export function LocationLanguageProvider({ children }: { children: ReactNode }) {
    const { profile } = useAuth();

    const [locationLanguage, setLangState] = useState<LocationLanguage>(() => {
        if (profile?.locationLanguage) return profile.locationLanguage as LocationLanguage;
        return (localStorage.getItem(STORAGE_KEY) as LocationLanguage) || DEFAULT_LANGUAGE;
    });

    // Sync with profile when it loads/changes
    useEffect(() => {
        if (profile?.locationLanguage) {
            const frameId = window.requestAnimationFrame(() => {
                setLangState(profile.locationLanguage as LocationLanguage);
            });
            return () => window.cancelAnimationFrame(frameId);
        }
    }, [profile?.locationLanguage]);

    const setLocationLanguage = useCallback(async (lang: LocationLanguage) => {
        setLangState(lang);
        localStorage.setItem(STORAGE_KEY, lang);

        // Persist to backend if logged in
        if (profile) {
            try {
                const token = (await supabase.auth.getSession()).data.session?.access_token;
                if (token) {
                    fetch(`${API_URL}/auth/profile`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                        },
                        body: JSON.stringify({ locationLanguage: lang }),
                    });
                }
            } catch {
                // Non-critical — localStorage is the fallback
            }
        }
    }, [profile]);

    return (
        <LocationLanguageContext.Provider value={{ locationLanguage, setLocationLanguage }}>
            {children}
        </LocationLanguageContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLocationLanguage() {
    const context = useContext(LocationLanguageContext);
    if (context === undefined) {
        throw new Error('useLocationLanguage must be used within a LocationLanguageProvider');
    }
    return context;
}
