import React from 'react';
import { ConditionStatus } from '../types/inventory';

export interface ConditionConfig {
  value: ConditionStatus;
  label: string;
  shortLabel: string;
  description: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  dotColor: string;
  colorName: string;
}

export const CONDITION_CONFIGS: Record<ConditionStatus, ConditionConfig> = {
  good: {
    value: 'good',
    label: 'Bom Estado',
    shortLabel: 'Bom',
    description: 'Item em bom estado físico, sem necessidade de atenção.',
    badgeBg: 'bg-emerald-500/15',
    badgeText: 'text-emerald-400',
    badgeBorder: 'border-emerald-500/30',
    dotColor: 'bg-emerald-400',
    colorName: 'emerald',
  },
  attention: {
    value: 'attention',
    label: 'Requer Atenção',
    shortLabel: 'Atenção',
    description: 'Apresenta desgaste natural ou pequeno detalhe a monitorar.',
    badgeBg: 'bg-amber-500/15',
    badgeText: 'text-amber-400',
    badgeBorder: 'border-amber-500/30',
    dotColor: 'bg-amber-400',
    colorName: 'amber',
  },
  concerning: {
    value: 'concerning',
    label: 'Preocupante',
    shortLabel: 'Preocupante',
    description: 'Deterioração significativa que requer atenção do proprietário.',
    badgeBg: 'bg-orange-500/20',
    badgeText: 'text-orange-300',
    badgeBorder: 'border-orange-500/40',
    dotColor: 'bg-orange-400',
    colorName: 'orange',
  },
  replacement_required: {
    value: 'replacement_required',
    label: 'Substituição Necessária',
    shortLabel: 'Trocar',
    description: 'Item muito avariado ou vencido que deve ser substituído.',
    badgeBg: 'bg-rose-500/25',
    badgeText: 'text-rose-300',
    badgeBorder: 'border-rose-500/50',
    dotColor: 'bg-rose-500',
    colorName: 'rose',
  },
};

export const CONDITION_OPTIONS: ConditionConfig[] = [
  CONDITION_CONFIGS.good,
  CONDITION_CONFIGS.attention,
  CONDITION_CONFIGS.concerning,
  CONDITION_CONFIGS.replacement_required,
];

export function getConditionConfig(status?: ConditionStatus | null): ConditionConfig {
  if (!status || !CONDITION_CONFIGS[status]) {
    return CONDITION_CONFIGS.good;
  }
  return CONDITION_CONFIGS[status];
}
