import { useEffect, useState } from 'react';

export type VisualScaleLevel = 'small' | 'normal' | 'large' | 'very_large' | 'extra_large';

export interface VisualScaleOption {
  level: VisualScaleLevel;
  index: number;
  label: string;
  sublabel: string;
  description: string;
  fontSizePx: number;
  touchTargetMinPx: number;
  scaleMultiplier: number;
}

export const VISUAL_SCALE_LEVELS: VisualScaleLevel[] = [
  'small',
  'normal',
  'large',
  'very_large',
  'extra_large',
];

export const VISUAL_SCALE_OPTIONS: Record<VisualScaleLevel, VisualScaleOption> = {
  small: {
    level: 'small',
    index: 0,
    label: 'Pequeno',
    sublabel: '87% de escala',
    description: 'Interface compacta. Exibe mais itens na tela para telas grandes ou quem prefere alta densidade.',
    fontSizePx: 14,
    touchTargetMinPx: 42,
    scaleMultiplier: 0.875,
  },
  normal: {
    level: 'normal',
    index: 1,
    label: 'Normal',
    sublabel: '100% (Padrão)',
    description: 'Tamanho padrão do aplicativo, balanceado para visualização confortável na maioria dos smartphones.',
    fontSizePx: 16,
    touchTargetMinPx: 48,
    scaleMultiplier: 1.0,
  },
  large: {
    level: 'large',
    index: 2,
    label: 'Grande',
    sublabel: '112% de escala',
    description: 'Textos, imagens e botões ampliados para facilitar a leitura sem forçar a visão.',
    fontSizePx: 18,
    touchTargetMinPx: 52,
    scaleMultiplier: 1.125,
  },
  very_large: {
    level: 'very_large',
    index: 3,
    label: 'Muito grande',
    sublabel: '128% de escala',
    description: 'Alta visibilidade para pessoas com baixa visão e botões largos de toque facilitado.',
    fontSizePx: 20.5,
    touchTargetMinPx: 58,
    scaleMultiplier: 1.28,
  },
  extra_large: {
    level: 'extra_large',
    index: 4,
    label: 'Extra grande',
    sublabel: '144% de escala',
    description: 'Máxima acessibilidade para idosos e baixa visão severa, com perguntas e controles destacados.',
    fontSizePx: 23,
    touchTargetMinPx: 64,
    scaleMultiplier: 1.44,
  },
};

export const DEFAULT_VISUAL_SCALE: VisualScaleLevel = 'normal';
const STORAGE_KEY = 'chacara_visual_scale_level_v1';
const EVENT_NAME = 'chacara-visual-scale-changed';

/**
 * Retrieve the currently stored visual scale level from localStorage.
 */
export function getStoredVisualScale(): VisualScaleLevel {
  if (typeof window === 'undefined') return DEFAULT_VISUAL_SCALE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && VISUAL_SCALE_LEVELS.includes(raw as VisualScaleLevel)) {
      return raw as VisualScaleLevel;
    }
  } catch {
    // Ignore localStorage errors
  }
  return DEFAULT_VISUAL_SCALE;
}

/**
 * Apply the visual scale level to the document root element.
 * By updating html font-size, all Tailwind rem units (text, padding, margins, heights)
 * scale proportionally and layout-aware without CSS transform bugs.
 */
export function applyVisualScale(level: VisualScaleLevel): void {
  if (typeof document === 'undefined') return;

  const option = VISUAL_SCALE_OPTIONS[level] || VISUAL_SCALE_OPTIONS.normal;
  const root = document.documentElement;

  // 1. Set root font size in pixels
  root.style.fontSize = `${option.fontSizePx}px`;

  // 2. Set data-attribute for targeted responsive CSS adaptations
  root.setAttribute('data-ui-size', option.level);

  // 3. Set custom CSS variables for components
  root.style.setProperty('--ui-scale-multiplier', String(option.scaleMultiplier));
  root.style.setProperty('--ui-touch-target-min', `${option.touchTargetMinPx}px`);
  root.style.setProperty('--ui-font-size-px', `${option.fontSizePx}px`);
}

/**
 * Persist the visual scale to localStorage and notify listeners.
 */
export function setStoredVisualScale(level: VisualScaleLevel): void {
  const validLevel = VISUAL_SCALE_LEVELS.includes(level) ? level : DEFAULT_VISUAL_SCALE;
  
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, validLevel);
    } catch {
      // Ignore
    }

    // Apply immediately to DOM
    applyVisualScale(validLevel);

    // Notify React components
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, { detail: { level: validLevel } })
    );
  }
}

/**
 * Reset visual scale to default 'normal' (16px).
 */
export function resetVisualScale(): void {
  setStoredVisualScale(DEFAULT_VISUAL_SCALE);
}

/**
 * Initialize visual scale on application bootstrap.
 */
export function initVisualScale(): VisualScaleLevel {
  const stored = getStoredVisualScale();
  applyVisualScale(stored);
  return stored;
}

/**
 * React hook to observe and update the current visual scale level.
 */
export function useVisualScale() {
  const [level, setLevelState] = useState<VisualScaleLevel>(getStoredVisualScale);

  useEffect(() => {
    // Ensure initial scale is applied
    applyVisualScale(level);

    const handleScaleChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ level: VisualScaleLevel }>;
      if (customEvent.detail?.level) {
        setLevelState(customEvent.detail.level);
      }
    };

    window.addEventListener(EVENT_NAME, handleScaleChanged);
    return () => window.removeEventListener(EVENT_NAME, handleScaleChanged);
  }, [level]);

  const setLevel = (newLevel: VisualScaleLevel) => {
    setLevelState(newLevel);
    setStoredVisualScale(newLevel);
  };

  const resetToDefault = () => {
    setLevelState(DEFAULT_VISUAL_SCALE);
    resetVisualScale();
  };

  const isHighAccessibility = level === 'very_large' || level === 'extra_large';

  return {
    level,
    option: VISUAL_SCALE_OPTIONS[level] || VISUAL_SCALE_OPTIONS.normal,
    setLevel,
    resetToDefault,
    isHighAccessibility,
    allOptions: VISUAL_SCALE_OPTIONS,
    levels: VISUAL_SCALE_LEVELS,
  };
}
