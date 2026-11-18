export type InspectionType = 'functionality' | 'conservation' | 'physical_integrity';

export interface InspectionQuestion {
  id: string;
  order: number;
  question: string;
  shortTag: string;
}

export interface InspectionTypeConfig {
  type: InspectionType;
  title: string;
  shortLabel: string;
  badgeLabel: string;
  description: string;
  detailedScope: string;
  iconName: 'Zap' | 'Sparkles' | 'ShieldCheck';
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  dotColor: string;
  questions: [InspectionQuestion, InspectionQuestion, InspectionQuestion];
}

export const INSPECTION_TYPES_CONFIG: Record<InspectionType, InspectionTypeConfig> = {
  functionality: {
    type: 'functionality',
    title: 'Funcionamento',
    shortLabel: 'Funcionamento',
    badgeLabel: 'Conferência de Funcionamento',
    description: 'Para aparelhos e eletrodomésticos que precisam operar e ligar',
    detailedScope: 'Ventiladores, televisores, liquidificadores, micro-ondas, batedeiras, eletrônicos, etc.',
    iconName: 'Zap',
    badgeBg: 'bg-amber-500/15',
    badgeBorder: 'border-amber-400/40',
    badgeText: 'text-amber-300',
    dotColor: 'bg-amber-400',
    questions: [
      {
        id: 'func_1',
        order: 1,
        question: 'O item está funcionando corretamente?',
        shortTag: 'Não funciona / Falha na operação',
      },
      {
        id: 'func_2',
        order: 2,
        question: 'O cabo de força e a tomada estão em bom estado?',
        shortTag: 'Cabo ou plugue danificado',
      },
      {
        id: 'func_3',
        order: 3,
        question: 'O item está sem danos visíveis ou peças quebradas?',
        shortTag: 'Dano visível / Peça quebrada',
      },
    ],
  },
  conservation: {
    type: 'conservation',
    title: 'Conservação',
    shortLabel: 'Conservação',
    badgeLabel: 'Conferência de Conservação',
    description: 'Para tecidos, estofados, roupas de cama, banho e cortinas',
    detailedScope: 'Travesseiros, sofás, colchões, lençóis, toalhas, cortinas, almofadas, etc.',
    iconName: 'Sparkles',
    badgeBg: 'bg-purple-500/15',
    badgeBorder: 'border-purple-400/40',
    badgeText: 'text-purple-300',
    dotColor: 'bg-purple-400',
    questions: [
      {
        id: 'cons_1',
        order: 1,
        question: 'O item está em boas condições de uso?',
        shortTag: 'Mau estado de conservação',
      },
      {
        id: 'cons_2',
        order: 2,
        question: 'Está sem rasgos, furos ou partes descosturadas?',
        shortTag: 'Rasgo, furo ou descosturado',
      },
      {
        id: 'cons_3',
        order: 3,
        question: 'Está limpo, sem manchas ou desgaste excessivo?',
        shortTag: 'Manchado, sujo ou desgastado',
      },
    ],
  },
  physical_integrity: {
    type: 'physical_integrity',
    title: 'Integridade Física',
    shortLabel: 'Integridade Física',
    badgeLabel: 'Conferência de Integridade',
    description: 'Para louças, utensílios de cozinha, móveis e objetos em geral',
    detailedScope: 'Copos, pratos, panelas, talheres, mesas, cadeiras, enfeites, etc.',
    iconName: 'ShieldCheck',
    badgeBg: 'bg-emerald-500/15',
    badgeBorder: 'border-emerald-400/40',
    badgeText: 'text-emerald-300',
    dotColor: 'bg-emerald-400',
    questions: [
      {
        id: 'integ_1',
        order: 1,
        question: 'O item está inteiro, sem quebras ou trincas?',
        shortTag: 'Quebrado ou trincado',
      },
      {
        id: 'integ_2',
        order: 2,
        question: 'Está sem partes soltas, amassadas ou danificadas?',
        shortTag: 'Parte solta ou amassada',
      },
      {
        id: 'integ_3',
        order: 3,
        question: 'Está em condições normais de uso?',
        shortTag: 'Impróprio para uso normal',
      },
    ],
  },
};

export const INSPECTION_TYPE_OPTIONS: InspectionTypeConfig[] = [
  INSPECTION_TYPES_CONFIG.functionality,
  INSPECTION_TYPES_CONFIG.conservation,
  INSPECTION_TYPES_CONFIG.physical_integrity,
];

export function getInspectionTypeConfig(type?: string | null): InspectionTypeConfig {
  if (type && type in INSPECTION_TYPES_CONFIG) {
    return INSPECTION_TYPES_CONFIG[type as InspectionType];
  }
  return INSPECTION_TYPES_CONFIG.physical_integrity;
}
