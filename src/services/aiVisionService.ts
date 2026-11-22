// ============================================================================
// AI Vision Service - Google Gemini Multimodal Classifier
// Analyzes inventory photos to automatically suggest name, category, and description
// ============================================================================

import { getInventoryImageUrl } from '../lib/supabase';
import { InventoryCategory, InventoryItem, Room } from '../types/inventory';

const LS_GEMINI_KEY = 'chacara_gemini_api_key';
const DEFAULT_GEMINI_KEY = '';

// Available Gemini models for vision tasks
// gemini-3.5-flash-lite is optimized for low latency and high accuracy
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
export const GEMINI_FALLBACK_MODEL = 'gemini-flash-latest';

export interface AiClassificationResult {
  itemId: string;
  originalName: string;
  suggestedName: string;
  suggestedCategoryName: string;
  matchedCategoryId: string | null;
  suggestedRoomName?: string;
  matchedRoomId?: string | null;
  description: string;
  estimatedQuantity: number;
  confidence: 'high' | 'medium' | 'low';
  rawResponse?: any;
}

/**
 * Retrieve the active Gemini API key (from localStorage, env, or default)
 */
export function getAiApiKey(): string {
  if (typeof window !== 'undefined') {
    const local = localStorage.getItem(LS_GEMINI_KEY);
    if (local && local.trim().length > 10) {
      return local.trim();
    }
  }
  const envKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (envKey && envKey.trim().length > 10) {
    return envKey.trim();
  }
  return DEFAULT_GEMINI_KEY;
}

/**
 * Save user Gemini API key to localStorage
 */
export function saveAiApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    if (!key || !key.trim()) {
      localStorage.removeItem(LS_GEMINI_KEY);
    } else {
      localStorage.setItem(LS_GEMINI_KEY, key.trim());
    }
  }
}

/**
 * Convert an image URL or Blob/File to base64 for Gemini inline_data
 */
export async function convertImageToBase64(
  imageSource: string | File | Blob
): Promise<{ mimeType: string; base64Data: string }> {
  // If already a File or Blob
  if (imageSource instanceof Blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const [header, base64] = result.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || imageSource.type || 'image/jpeg';
        resolve({ mimeType, base64Data: base64 });
      };
      reader.onerror = reject;
      reader.readAsDataURL(imageSource);
    });
  }

  // If URL string
  const url = String(imageSource).trim();

  // If already a Data URL
  if (url.startsWith('data:image/')) {
    const [header, base64] = url.split(',');
    const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
    return { mimeType, base64Data: base64 };
  }

  // Fetch image over network
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) {
    throw new Error(`Falha ao carregar imagem para análise (${response.status})`);
  }
  const blob = await response.blob();
  return convertImageToBase64(blob);
}

/**
 * Match a category name suggested by AI with existing categories
 */
export function matchCategory(
  suggestedName: string,
  categories: InventoryCategory[]
): InventoryCategory | null {
  if (!suggestedName || categories.length === 0) return null;
  const cleanSuggested = suggestedName.trim().toLowerCase();

  // 1. Exact match
  const exact = categories.find((c) => c.name.trim().toLowerCase() === cleanSuggested);
  if (exact) return exact;

  // 2. Partial containment
  const partial = categories.find(
    (c) =>
      cleanSuggested.includes(c.name.trim().toLowerCase()) ||
      c.name.trim().toLowerCase().includes(cleanSuggested)
  );
  if (partial) return partial;

  // 3. Keyword heuristic
  const keywordMap: Record<string, string[]> = {
    Cozinha: ['prato', 'copo', 'panela', 'talher', 'fogão', 'louça', 'travessa', 'xícara'],
    Eletrodomésticos: ['liquidificador', 'micro-ondas', 'geladeira', 'ventilador', 'cafeteira', 'batedeira', 'air fryer', 'torradeira'],
    Móveis: ['mesa', 'cadeira', 'sofá', 'cama', 'armário', 'banco', 'guarda-roupa', 'poltrona'],
    Lazer: ['sinuca', 'piscina', 'churrasqueira', 'bola', 'baralho', 'jogo', 'espreguiçadeira'],
    'Roupas de Cama / Banho': ['toalha', 'lençol', 'travesseiro', 'cobertor', 'edredom'],
    Eletrônicos: ['tv', 'televisão', 'som', 'caixa de som', 'controle', 'roteador'],
    Ferramentas: ['furadeira', 'martelo', 'alicate', 'chave', 'mangueira', 'cortador'],
  };

  for (const cat of categories) {
    const keywords = keywordMap[cat.name];
    if (keywords && keywords.some((k) => cleanSuggested.includes(k))) {
      return cat;
    }
  }

  return null;
}

/**
 * Classify a single inventory item using Gemini AI Vision
 */
export async function classifyInventoryItemWithAi(params: {
  item: InventoryItem;
  categories: InventoryCategory[];
  rooms?: Room[];
  apiKey?: string;
  customImageFile?: File | Blob;
}): Promise<AiClassificationResult> {
  const { item, categories, rooms = [], apiKey, customImageFile } = params;
  const key = apiKey || getAiApiKey();

  if (!key) {
    throw new Error('Chave de API do Gemini não configurada.');
  }

  // 1. Resolve image base64
  let base64Result: { mimeType: string; base64Data: string };

  if (customImageFile) {
    base64Result = await convertImageToBase64(customImageFile);
  } else if (item.image_path) {
    const fullUrl = getInventoryImageUrl(item.image_path);
    if (!fullUrl) {
      throw new Error(`Item "${item.name}" não possui URL de foto válida.`);
    }
    base64Result = await convertImageToBase64(fullUrl);
  } else {
    throw new Error(`Item "${item.name}" não possui imagem anexada para análise.`);
  }

  // 2. Prepare categories and rooms context
  const categoriesList = categories.map((c) => `- ${c.name}`).join('\n');
  const roomsList = rooms.length > 0 ? rooms.map((r) => `- ${r.name}`).join('\n') : '';

  const prompt = `Você é um assistente especialista em inventário patrimonial de uma chácara de aluguel por temporada.
Analise detalhadamente a foto deste objeto e identifique o item com precisão em português brasileiro.

CATEGORIAS EXISTENTES NO SISTEMA:
${categoriesList || '- Geral'}

${roomsList ? `CÔMODOS EXISTENTES:\n${roomsList}` : ''}

INSTRUÇÕES E REGRAS:
1. "name": Nome claro, comercial e específico do objeto em português. Se identificar marca ou cor evidente (ex: "Ventilador de Coluna Mondial Preto", "Liquidificador Walita Vermelho", "Panela de Pressão Tramontina", "Cadeira de Área em Fibra"), inclua de forma elegante. Evite nomes genéricos como "Objeto" ou "Item".
2. "suggested_category_name": Escolha OBRIGATORIAMENTE uma das categorias existentes acima que melhor se adequa ao item. Se realmente não couber em nenhuma, sugira uma categoria nova concisa.
3. "description": Breve descrição observando cor, material predominante e características visíveis em 1 ou 2 frases curtas.
4. "estimated_quantity": Quantidade de unidades visíveis do item na foto (número inteiro, normalmente 1).
5. "suggested_room_name": Caso o ambiente ao fundo identifique claramente o cômodo (ex: Cozinha, Quarto, Área Gourmet), indique-o, senão deixe vazio.
6. "confidence": "high", "medium" ou "low".

Retorne ESTRITAMENTE um objeto JSON válido no seguinte formato:
{
  "name": "Nome do Objeto",
  "suggested_category_name": "Categoria",
  "suggested_room_name": "",
  "description": "Descrição curta das características visuais",
  "estimated_quantity": 1,
  "confidence": "high"
}`;

  // 3. Call Gemini generateContent API
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(
    key
  )}`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: base64Result.mimeType,
              data: base64Result.base64Data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  };

  let response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  // If primary model failed (e.g. 404), fallback to fallback model
  if (!response.ok && response.status === 404) {
    const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FALLBACK_MODEL}:generateContent?key=${encodeURIComponent(
      key
    )}`;
    response = await fetch(fallbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    let msg = `Erro Gemini (${response.status})`;
    try {
      const parsed = JSON.parse(errorText);
      msg = parsed.error?.message || msg;
    } catch {}
    throw new Error(msg);
  }

  const data = await response.json();
  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textContent) {
    throw new Error('A IA não retornou resposta para esta imagem.');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(textContent);
  } catch (err) {
    throw new Error(`Falha ao interpretar resposta da IA: ${textContent.slice(0, 100)}`);
  }

  const matchedCat = matchCategory(parsed.suggested_category_name, categories);
  const matchedRm = rooms.find(
    (r) =>
      parsed.suggested_room_name &&
      r.name.trim().toLowerCase() === String(parsed.suggested_room_name).trim().toLowerCase()
  );

  return {
    itemId: item.id,
    originalName: item.name,
    suggestedName: parsed.name || item.name,
    suggestedCategoryName: matchedCat ? matchedCat.name : parsed.suggested_category_name || '',
    matchedCategoryId: matchedCat ? matchedCat.id : null,
    suggestedRoomName: parsed.suggested_room_name || '',
    matchedRoomId: matchedRm ? matchedRm.id : null,
    description: parsed.description || '',
    estimatedQuantity: Number(parsed.estimated_quantity) || 1,
    confidence: parsed.confidence || 'high',
    rawResponse: parsed,
  };
}

/**
 * Execute batch classification of multiple items with concurrency control
 */
export async function classifyBatchItemsWithAi(params: {
  items: InventoryItem[];
  categories: InventoryCategory[];
  rooms?: Room[];
  apiKey?: string;
  concurrency?: number;
  onProgress?: (completed: number, total: number, latestResult?: AiClassificationResult) => void;
  onErrorItem?: (item: InventoryItem, error: Error) => void;
}): Promise<AiClassificationResult[]> {
  const {
    items,
    categories,
    rooms = [],
    apiKey,
    concurrency = 2,
    onProgress,
    onErrorItem,
  } = params;

  const results: AiClassificationResult[] = [];
  let completedCount = 0;

  // Worker queue
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      const currentItem = items[idx];

      try {
        const result = await classifyInventoryItemWithAi({
          item: currentItem,
          categories,
          rooms,
          apiKey,
        });
        results.push(result);
        completedCount++;
        onProgress?.(completedCount, items.length, result);
      } catch (err: any) {
        console.error(`Erro ao analisar item ${currentItem.name}:`, err);
        completedCount++;
        onErrorItem?.(currentItem, err);
        onProgress?.(completedCount, items.length);
      }
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  return results;
}
