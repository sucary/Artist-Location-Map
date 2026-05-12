import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { ArtistNameDisplayMode } from '../types/profile';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { API_URL } from '../services/api';
import { DEFAULT_ARTIST_NAME_DISPLAY_MODE } from '../utils/artistNameDisplay';

// Artist name display preference

const STORAGE_KEY = 'artistNameDisplayMode';
const validModes: ArtistNameDisplayMode[] = ['main', 'sub', 'both', 'subFirst'];

interface ArtistNameDisplayContextType {
    artistNameDisplayMode: ArtistNameDisplayMode;
    setArtistNameDisplayMode: (mode: ArtistNameDisplayMode) => void;
}

const ArtistNameDisplayContext = createContext<ArtistNameDisplayContextType | undefined>(undefined);

const normalizeMode = (value: unknown): ArtistNameDisplayMode => (
    typeof value === 'string' && validModes.includes(value as ArtistNameDisplayMode)
        ? value as ArtistNameDisplayMode
        : DEFAULT_ARTIST_NAME_DISPLAY_MODE
);

export function ArtistNameDisplayProvider({ children }: { children: ReactNode }) {
    const { profile } = useAuth();
    const [artistNameDisplayMode, setModeState] = useState<ArtistNameDisplayMode>(() => (
        normalizeMode(profile?.artistNameDisplayMode || localStorage.getItem(STORAGE_KEY))
    ));

    useEffect(() => {
        if (!profile?.artistNameDisplayMode) return;

        const frameId = window.requestAnimationFrame(() => {
            setModeState(normalizeMode(profile.artistNameDisplayMode));
        });
        return () => window.cancelAnimationFrame(frameId);
    }, [profile?.artistNameDisplayMode]);

    const setArtistNameDisplayMode = useCallback(async (mode: ArtistNameDisplayMode) => {
        const normalizedMode = normalizeMode(mode);
        setModeState(normalizedMode);
        localStorage.setItem(STORAGE_KEY, normalizedMode);

        if (!profile) return;

        try {
            const token = (await supabase.auth.getSession()).data.session?.access_token;
            if (!token) return;

            fetch(`${API_URL}/auth/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ artistNameDisplayMode: normalizedMode }),
            });
        } catch {
            // Local preference remains available if persistence fails
        }
    }, [profile]);

    return (
        <ArtistNameDisplayContext.Provider value={{ artistNameDisplayMode, setArtistNameDisplayMode }}>
            {children}
        </ArtistNameDisplayContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useArtistNameDisplay() {
    const context = useContext(ArtistNameDisplayContext);
    if (context === undefined) {
        throw new Error('useArtistNameDisplay must be used within an ArtistNameDisplayProvider');
    }
    return context;
}
