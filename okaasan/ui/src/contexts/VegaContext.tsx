import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

// Define the type for the vega-embed function
type VegaEmbed = typeof import('vega-embed').default;

interface VegaContextType {
    isLoaded: boolean;
    error: Error | null;
    embed: VegaEmbed | null;
}

const VegaContext = createContext<VegaContextType>({
    isLoaded: false,
    error: null,
    embed: null,
});

export const useVega = () => useContext(VegaContext);

interface VegaProviderProps {
    children: ReactNode;
}

export const VegaProvider: React.FC<VegaProviderProps> = ({ children }) => {
    const [embed, setEmbed] = useState<VegaEmbed | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        let mounted = true;

        const loadVega = async () => {
            try {
                // Dynamic import of vega-embed
                const vegaEmbedModule = await import('vega-embed');

                if (mounted) {
                    setEmbed(() => vegaEmbedModule.default);
                    setIsLoaded(true);
                }
            } catch (err) {
                console.error('Failed to load vega-embed:', err);
                if (mounted) {
                    setError(err instanceof Error ? err : new Error('Failed to load vega-embed'));
                }
            }
        };

        loadVega();

        return () => {
            mounted = false;
        };
    }, []);

    const value = {
        isLoaded,
        error,
        embed,
    };

    return <VegaContext.Provider value={value}>{children}</VegaContext.Provider>;
};
