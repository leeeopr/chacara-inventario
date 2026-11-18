import type { CodePrefixRule } from '../types/inventory';

const LS_PREFIX_RULES_KEY = 'chacara_inventory_code_prefixes_v1';

export const DEFAULT_PREFIX_RULES: CodePrefixRule[] = [
  {
    id: 'tg',
    prefix: 'TG',
    label: 'Pote Plástico Grande (Tupperware Grande)',
    digits: 2,
    keywords: ['pote grande', 'tupperware grande', 'vasilha grande', 'container grande', 'large container'],
  },
  {
    id: 'tm',
    prefix: 'TM',
    label: 'Pote Plástico Médio (Tupperware Médio)',
    digits: 2,
    keywords: ['pote medio', 'pote médio', 'tupperware medio', 'tupperware médio', 'vasilha media', 'medium container'],
  },
  {
    id: 'tp',
    prefix: 'TP',
    label: 'Pote Plástico Pequeno (Tupperware Pequeno)',
    digits: 2,
    keywords: ['pote pequeno', 'tupperware pequeno', 'vasilha pequena', 'small container'],
  },
  {
    id: 'tv',
    prefix: 'TV',
    label: 'Televisão / Smart TV',
    digits: 2,
    keywords: ['tv', 'televisao', 'televisão', 'television', 'smart tv'],
  },
  {
    id: 'mo',
    prefix: 'MO',
    label: 'Micro-ondas',
    digits: 2,
    keywords: ['microondas', 'micro-ondas', 'microwave'],
  },
  {
    id: 'lq',
    prefix: 'LQ',
    label: 'Liquidificador / Mixer / Processador',
    digits: 2,
    keywords: ['liquidificador', 'blender', 'mixer', 'processador', 'batedeira'],
  },
  {
    id: 'el',
    prefix: 'EL',
    label: 'Eletrodoméstico / Eletrônico',
    digits: 2,
    keywords: ['geladeira', 'freezer', 'fogao', 'fogão', 'airfryer', 'cafeteira', 'forno', 'ventilador', 'ar condicionado'],
  },
  {
    id: 'ut',
    prefix: 'UT',
    label: 'Utensílio de Cozinha Específico',
    digits: 2,
    keywords: ['panela', 'frigideira', 'assadeira', 'espeto', 'faca', 'tabua', 'tábua', 'garrafa termica'],
  },
  {
    id: 'dc',
    prefix: 'DC',
    label: 'Objeto de Decoração Especial',
    digits: 2,
    keywords: ['quadro', 'vaso', 'escultura', 'abajur', 'luminaria', 'espelho', 'decoracao', 'decoração'],
  },
  {
    id: 'mv',
    prefix: 'MV',
    label: 'Móvel / Mobiliário Individual',
    digits: 2,
    keywords: ['sofa', 'sofá', 'mesa', 'cadeira', 'poltrona', 'cama', 'colchao', 'colchão', 'espreguicadeira'],
  },
];

export function getCodePrefixRules(): CodePrefixRule[] {
  if (typeof window === 'undefined') return DEFAULT_PREFIX_RULES;
  try {
    const raw = localStorage.getItem(LS_PREFIX_RULES_KEY);
    if (!raw) return DEFAULT_PREFIX_RULES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // fallback to defaults
  }
  return DEFAULT_PREFIX_RULES;
}

export function saveCodePrefixRules(rules: CodePrefixRule[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_PREFIX_RULES_KEY, JSON.stringify(rules));
}

export function resetCodePrefixRules(): CodePrefixRule[] {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(LS_PREFIX_RULES_KEY);
  }
  return DEFAULT_PREFIX_RULES;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function matchesKeywordPhrase(normalizedTarget: string, keywordPhrase: string): boolean {
  const normKw = normalizeText(keywordPhrase);
  if (!normKw) return false;
  if (normalizedTarget.includes(normKw)) return true;
  const kwWords = normKw.split(/\s+/).filter(Boolean);
  if (kwWords.length > 1) {
    const targetWords = normalizedTarget.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
    return kwWords.every((w) => targetWords.includes(w));
  }
  return false;
}

/**
 * Infers the best prefix (e.g., TG, TM, TP, TV) from item name, category name,
 * and configured prefix rules.
 */
export function inferPrefixForItem(
  itemName: string,
  categoryName?: string | null,
  rules: CodePrefixRule[] = getCodePrefixRules()
): { prefix: string; digits: number; matchedRule?: CodePrefixRule } {
  const normName = normalizeText(itemName);
  const normCategory = categoryName ? normalizeText(categoryName) : '';

  // 1. Check keyword match on item name first
  for (const rule of rules) {
    for (const kw of rule.keywords) {
      if (matchesKeywordPhrase(normName, kw)) {
        return { prefix: rule.prefix.toUpperCase(), digits: rule.digits || 2, matchedRule: rule };
      }
    }
  }

  // 2. Check keyword match on category name
  if (normCategory) {
    for (const rule of rules) {
      for (const kw of rule.keywords) {
        if (matchesKeywordPhrase(normCategory, kw)) {
          return { prefix: rule.prefix.toUpperCase(), digits: rule.digits || 2, matchedRule: rule };
        }
      }
    }
  }

  // 3. Auto-derive 2-letter uppercase prefix from item name words
  const words = normName
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !['de', 'da', 'do', 'das', 'dos', 'para', 'com', 'em'].includes(w));

  if (words.length >= 2) {
    const derived = (words[0][0] + words[1][0]).toUpperCase();
    return { prefix: derived, digits: 2 };
  }

  if (words.length === 1 && words[0].length >= 2) {
    return { prefix: words[0].slice(0, 2).toUpperCase(), digits: 2 };
  }

  return { prefix: 'IT', digits: 2 };
}

/**
 * Generates the next available unique identification code(s) for a given prefix,
 * checking against all existing codes in the inventory database.
 * Example: prefix="TG", digits=2, existing=["TG01", "TG02"] -> ["TG03"]
 */
export function generateNextCodes(
  prefix: string,
  existingCodes: (string | null | undefined)[],
  count = 1,
  digits = 2
): string[] {
  const cleanPrefix = (prefix || 'IT').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'IT';
  const existingSet = new Set(
    existingCodes
      .filter((c): c is string => Boolean(c && c.trim()))
      .map((c) => c.trim().toUpperCase())
  );

  // Find highest existing number for this prefix
  let maxNumber = 0;
  const regex = new RegExp(`^${cleanPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`, 'i');

  for (const code of existingSet) {
    const match = code.match(regex);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNumber) {
        maxNumber = num;
      }
    }
  }

  const generated: string[] = [];
  let candidateNum = maxNumber + 1;

  while (generated.length < count) {
    const padded = String(candidateNum).padStart(digits, '0');
    const candidateCode = `${cleanPrefix}${padded}`;
    if (!existingSet.has(candidateCode)) {
      generated.push(candidateCode);
      existingSet.add(candidateCode);
    }
    candidateNum++;
  }

  return generated;
}
