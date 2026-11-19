import { App as CapApp } from '@capacitor/app';

export type BackActionHandler = () => boolean | Promise<boolean>;

interface HandlerRegistration {
  id: string;
  priority: number; // Higher number = higher priority (runs first)
  handler: BackActionHandler;
}

const registry: HandlerRegistration[] = [];
let isCapacitorListenerAttached = false;
let isPopstateListenerAttached = false;

// Global fallback for root back press (double tap to exit)
let onRootBackAction: (() => void) | null = null;

export function setRootBackAction(action: (() => void) | null) {
  onRootBackAction = action;
}

/**
 * Register a back navigation handler with a priority.
 * Returns an unregister function.
 * 
 * Priorities guideline:
 * - 100+: Modals, overlays, dropdowns, zoom popups
 * - 50+: Multi-step forms internal step transition
 * - 20+: Nested screen navigation (e.g. room inspection -> checklist main)
 * - 10+: Secondary page navigation (e.g. admin -> checklist main)
 */
export function registerBackHandler(
  id: string,
  priority: number,
  handler: BackActionHandler
): () => void {
  // Remove existing with same id if any
  const existingIdx = registry.findIndex((r) => r.id === id);
  if (existingIdx >= 0) {
    registry.splice(existingIdx, 1);
  }

  registry.push({ id, priority, handler });
  // Sort descending by priority
  registry.sort((a, b) => b.priority - a.priority);

  initGlobalListeners();

  return () => {
    const idx = registry.findIndex((r) => r.id === id);
    if (idx >= 0) {
      registry.splice(idx, 1);
    }
  };
}

/**
 * Executes back navigation in priority order.
 * Returns true if an action was handled, false otherwise.
 */
export async function triggerBackNavigation(): Promise<boolean> {
  // Iterate through handlers in priority order
  for (const reg of [...registry]) {
    try {
      const handled = await reg.handler();
      if (handled) {
        return true;
      }
    } catch (err) {
      console.warn(`[BackNav] Error in handler '${reg.id}':`, err);
    }
  }

  // If no handler consumed the event, invoke root back action if set
  if (onRootBackAction) {
    onRootBackAction();
    return true;
  }

  return false;
}

function initGlobalListeners() {
  if (typeof window === 'undefined') return;

  // 1. Capacitor Native Android Back Button Listener
  if (!isCapacitorListenerAttached) {
    try {
      CapApp.addListener('backButton', async (event) => {
        const handled = await triggerBackNavigation();
        if (!handled && event.canGoBack) {
          window.history.back();
        }
      });
      isCapacitorListenerAttached = true;
    } catch {
      // In non-Capacitor environment (e.g. standard browser), fallback to popstate
    }
  }

  // 2. Web Browser Popstate Listener (for web browsers / PWAs)
  if (!isPopstateListenerAttached) {
    window.addEventListener('popstate', async (e) => {
      // Prevent browser default back jump if handled
      const handled = await triggerBackNavigation();
      if (handled) {
        // Push state back so browser history does not navigate away
        window.history.pushState({ appNav: true }, '', window.location.href);
      }
    });
    // Prime initial history state
    if (window.history.state?.appNav !== true) {
      window.history.pushState({ appNav: true }, '', window.location.href);
    }
    isPopstateListenerAttached = true;
  }
}
