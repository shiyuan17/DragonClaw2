import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { ServiceLifecycleSnapshot } from "../types";

export function useServiceLifecycle() {
  const [serviceLifecycle, setServiceLifecycle] = useState<ServiceLifecycleSnapshot | null>(null);
  const [serviceLifecycleReady, setServiceLifecycleReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    invoke<ServiceLifecycleSnapshot | null>("get_service_lifecycle_snapshot")
      .then((snapshot) => {
        if (!cancelled) {
          setServiceLifecycle(snapshot);
          setServiceLifecycleReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setServiceLifecycle(null);
          setServiceLifecycleReady(true);
        }
      });

    const unlisten = listen<ServiceLifecycleSnapshot | null>("service-lifecycle", (event) => {
      setServiceLifecycle(event.payload ?? null);
    });

    return () => {
      cancelled = true;
      unlisten.then((fn) => fn());
    };
  }, []);

  return {
    serviceLifecycle,
    serviceLifecycleReady,
  };
}
