import { useEffect, useState } from 'react';

import type { ToolchainManifestEntry } from '../types/toolchains';
import { fetchToolchainManifest } from '../utils/toolchains';

export function useToolchainManifest() {
  const [toolchains, setToolchains] = useState<ToolchainManifestEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetchToolchainManifest()
      .then((manifest) => {
        if (!active) return;
        setToolchains(manifest.toolchains);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!active) return;
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return {
    toolchains,
    isLoading,
    error,
  };
}
