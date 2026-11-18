import React, { useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Edit3,
  Eye,
  Hash,
  Home,
  Layers,
  Package,
  Tag,
  Trash2,
} from 'lucide-react';
import { getConditionConfig } from '../lib/conditionUtils';
import { getInspectionTypeConfig } from '../lib/inspectionTypeUtils';
import { getInventoryImageUrl } from '../lib/supabase';
import { InventoryItem } from '../types/inventory';

interface InventoryItemCardProps {
  item: InventoryItem;
  onSelect: (item: InventoryItem) => void;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
}

export const InventoryItemCard: React.FC<InventoryItemCardProps> = ({
  item,
  onSelect,
  onEdit,
  onDelete,
}) => {
  const [imgError, setImgError] = useState(false);
  const imageUrl = getInventoryImageUrl(item.image_path);
  const isIndividual = item.inventory_type === 'individual';

  const assignments = item.room_assignments || [];
  const totalQuantity =
    item.total_quantity !== undefined
      ? item.total_quantity
      : assignments.length > 0
      ? assignments.reduce((acc, a) => acc + (Number(a.quantity) || 0), 0)
      : item.room_id
      ? item.expected_quantity
      : 0;

  const hasCriticalCondition = assignments.some(
    (a) => a.condition_status === 'concerning' || a.condition_status === 'replacement_required'
  );

  return (
    <div
      onClick={() => onSelect(item)}
      className="group relative rounded-2xl bg-slate-900/90 border border-slate-800/90 hover:border-emerald-500/50 transition-all duration-200 overflow-hidden flex flex-col cursor-pointer shadow-lg hover:shadow-emerald-950/30"
    >
      {/* Photograph Area */}
      <div className="relative aspect-[16/10] w-full bg-slate-950 overflow-hidden">
        {imageUrl && !imgError ? (
          <img
            src={imageUrl}
            alt={item.name}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-slate-600">
            <Camera className="w-8 h-8 mb-1.5 opacity-40" />
            <span className="text-[11px] font-medium uppercase tracking-wider opacity-60">
              Sem fotografia
            </span>
          </div>
        )}

        {/* Top-left Identification Code or Type Badge */}
        <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1.5">
          {item.identification_code && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 font-black text-xs tracking-wider shadow-md">
              <Hash className="w-3 h-3 stroke-[3]" />
              {item.identification_code}
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold backdrop-blur-md shadow ${
              isIndividual
                ? 'bg-indigo-500/90 text-white'
                : 'bg-emerald-500/90 text-slate-950'
            }`}
          >
            {isIndividual ? (
              <>
                <Tag className="w-3 h-3" />
                Individual
              </>
            ) : (
              <>
                <Layers className="w-3 h-3" />
                Quantidade
              </>
            )}
          </span>
        </div>

        {/* Top-right Total Quantity Pill */}
        <div className="absolute top-2.5 right-2.5">
          {totalQuantity > 0 ? (
            <div className="px-2.5 py-1 rounded-xl bg-slate-950/85 backdrop-blur-md border border-slate-700/80 text-white flex items-center gap-1.5 shadow-md">
              <Package className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-extrabold">
                Total: <span className="text-emerald-400">{totalQuantity}</span>
              </span>
            </div>
          ) : (
            <div className="px-2.5 py-1 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 text-slate-400 text-xs font-semibold shadow-md">
              Sem distribuição
            </div>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors line-clamp-1">
              {item.name}
            </h3>
            {hasCriticalCondition && (
              <span
                title="Possui cômodo com estado físico preocupante ou substituição necessária"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-[10px] font-black text-rose-300 uppercase shrink-0"
              >
                <AlertTriangle className="w-3 h-3 text-rose-400" />
                <span>Atenção</span>
              </span>
            )}
          </div>

          {/* Room Distribution Chips */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {assignments.length > 0 ? (
              <>
                {assignments.slice(0, 3).map((a) => {
                  const cond = getConditionConfig(a.condition_status);
                  return (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 text-xs font-medium border border-slate-700/70"
                    >
                      <Home className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span className="truncate max-w-[100px]">{a.room?.name || 'Cômodo'}</span>
                      <span className="font-bold text-emerald-400 text-[11px]">({a.quantity})</span>
                      {a.condition_status && a.condition_status !== 'good' && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${cond.dotColor}`}
                          title={`Estado: ${cond.label}`}
                        />
                      )}
                    </span>
                  );
                })}
                {assignments.length > 3 && (
                  <span className="text-[11px] font-bold text-slate-400 px-2 py-0.5 rounded bg-slate-800/80">
                    +{assignments.length - 3} cômodos
                  </span>
                )}
              </>
            ) : item.room?.name ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 text-xs font-medium border border-slate-700/70">
                <Home className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="truncate max-w-[140px]">{item.room.name}</span>
                <span className="font-bold text-emerald-400 text-[11px]">({item.expected_quantity})</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/50 text-slate-400 text-xs border border-slate-800">
                Sem cômodo atribuído
              </span>
            )}

            {item.category?.name && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/60 text-slate-300 text-xs border border-slate-800">
                <Tag className="w-3 h-3 text-sky-400 shrink-0" />
                <span className="truncate max-w-[130px]">{item.category.name}</span>
              </span>
            )}

            {(() => {
              const insp = getInspectionTypeConfig(item.inspection_type);
              return (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border ${insp.badgeBg} ${insp.badgeBorder} ${insp.badgeText}`}
                  title={`Tipo de conferência: ${insp.title}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${insp.dotColor}`} />
                  <span className="truncate max-w-[110px]">{insp.shortLabel}</span>
                </span>
              );
            })()}
          </div>

          {item.description && (
            <p className="mt-2 text-xs text-slate-400 line-clamp-2 leading-relaxed">
              {item.description}
            </p>
          )}
        </div>

        {/* Action Bar */}
        <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(item);
            }}
            className="text-xs font-semibold text-slate-400 hover:text-emerald-400 flex items-center gap-1 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Ver detalhes & cômodos</span>
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(item);
              }}
              title="Editar item"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item);
              }}
              title="Excluir item"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
