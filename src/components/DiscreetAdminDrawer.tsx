import React from 'react';
import {
  ArrowUpDown,
  Boxes,
  Calendar,
  Compass,
  Database,
  Droplets,
  FolderTree,
  Hash,
  History,
  Home,
  LogOut,
  Plus,
  Power,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';
import { getRoleBadgeColor, getRoleLabel } from '../services/authService';
import { AppUserProfile } from '../types/auth';

interface DiscreetAdminDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: AppUserProfile | null;
  onLogout?: () => void;
  onOpenPiscineiroView?: () => void;
  onOpenInventory: () => void;
  onOpenFloorPlan: () => void;
  onOpenRooms: () => void;
  onOpenRoomCategories: () => void;
  onOpenRoomOrder: () => void;
  onOpenCategories: () => void;
  onOpenPrefixes: () => void;
  onOpenSupabase: () => void;
  onOpenHistory: () => void;
  onStartNewInspection: () => void;
  onOpenStaysCalendar?: () => void;
  onOpenOtaSettings?: () => void;
  onOpenVisualScale?: () => void;
  onOpenPreChecklistConfig?: () => void;
}

export const DiscreetAdminDrawer: React.FC<DiscreetAdminDrawerProps> = ({
  isOpen,
  onClose,
  userProfile = null,
  onLogout,
  onOpenPiscineiroView,
  onOpenInventory,
  onOpenFloorPlan,
  onOpenRooms,
  onOpenRoomCategories,
  onOpenRoomOrder,
  onOpenCategories,
  onOpenPrefixes,
  onOpenSupabase,
  onOpenHistory,
  onStartNewInspection,
  onOpenStaysCalendar,
  onOpenOtaSettings,
  onOpenVisualScale,
  onOpenPreChecklistConfig,
}) => {
  if (!isOpen) return null;

  const isAdmin = userProfile?.role === 'admin';

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm h-full bg-slate-900 border-l border-slate-800 p-5 flex flex-col justify-between shadow-2xl overflow-y-auto"
      >
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <img
                src="/logo.png"
                alt="Logo Chácara"
                className="w-10 h-10 rounded-xl object-cover shadow-md shadow-emerald-500/20 shrink-0"
              />
              <div className="min-w-0">
                <h3 className="text-base font-black text-white truncate">
                  {userProfile ? userProfile.full_name : 'Menu do Proprietário'}
                </h3>
                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                  {userProfile ? (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${getRoleBadgeColor(
                        userProfile.role
                      )}`}
                    >
                      {getRoleLabel(userProfile.role)}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                      Área Administrativa
                    </span>
                  )}
                </div>
                {userProfile?.email && (
                  <span className="block text-[10px] text-slate-400 truncate mt-0.5">
                    {userProfile.email}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Checklist Actions */}
          <div className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 px-2 block">
              {userProfile?.role === 'faxineira' ? 'Ações da Vistoria & Faxina' : 'Ações da Vistoria'}
            </span>

            {onOpenStaysCalendar && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenStaysCalendar();
                }}
                className="w-full p-3.5 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 flex items-center gap-3 text-left transition-colors cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-500/30 text-amber-300 flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-sm font-extrabold text-amber-200">
                    Estadias, Checklists &amp; Faxinas
                  </span>
                  <span className="block text-xs text-amber-300/80">
                    Ver saídas, vistorias e faxinas pendentes
                  </span>
                </div>
              </button>
            )}

            {isAdmin && onOpenPiscineiroView && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPiscineiroView();
                }}
                className="w-full p-3.5 rounded-2xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 flex items-center gap-3 text-left transition-colors cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-sky-500/30 text-sky-300 flex items-center justify-center shrink-0">
                  <Droplets className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-sm font-extrabold text-sky-200">
                    Visão do Piscineiro
                  </span>
                  <span className="block text-xs text-sky-300/80">
                    Calendário de entradas e limpeza de piscinas
                  </span>
                </div>
              </button>
            )}

            <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartNewInspection();
                }}
              className="w-full p-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-3 text-left transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <span className="block text-sm font-extrabold text-white">
                  Iniciar Nova Conferência
                </span>
                <span className="block text-xs text-slate-400">
                  Começar checklist de novo checkout
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenHistory();
              }}
              className="w-full p-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-3 text-left transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                <History className="w-5 h-5" />
              </div>
              <div>
                <span className="block text-sm font-extrabold text-white">
                  Histórico de Vistorias
                </span>
                <span className="block text-xs text-slate-400">
                  Ver relatórios anteriores e danos
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenVisualScale?.();
              }}
              className="w-full p-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-amber-500/30 flex items-center gap-3 text-left transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <Sliders className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <span className="block text-sm font-extrabold text-white">
                  Tamanho da Interface
                </span>
                <span className="block text-xs text-slate-400">
                  Ajustar escala visual para baixa visão
                </span>
              </div>
            </button>
          </div>

          {/* Admin Management Section (Proprietário/Admin only) */}
          {isAdmin && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 px-2 block">
                Gestão de Propriedade & Itens
              </span>

              {onOpenPreChecklistConfig && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenPreChecklistConfig();
                  }}
                  className="w-full p-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-amber-500/30 flex items-center gap-3 text-left transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                    <Power className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <div>
                    <span className="block text-sm font-extrabold text-white">
                      Configurar pré-checklist
                    </span>
                    <span className="block text-xs text-slate-400">
                      Ações de preparação de equipamentos (freezer, etc.)
                    </span>
                  </div>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenInventory();
                }}
                className="w-full p-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-3 text-left transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <Boxes className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-sm font-extrabold text-white">
                    Gestão do Inventário
                  </span>
                  <span className="block text-xs text-slate-400">
                    Cadastrar, editar ou remover itens
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFloorPlan();
                }}
                className="w-full p-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-3 text-left transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center shrink-0">
                  <Compass className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-sm font-extrabold text-white">
                    Planta da Chácara
                  </span>
                  <span className="block text-xs text-slate-400">
                    Visualizar e editar a planta baixa 2D
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenRooms();
                }}
                className="w-full p-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-3 text-left transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <Home className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-sm font-extrabold text-white">
                    Gerenciar Cômodos
                  </span>
                  <span className="block text-xs text-slate-400">
                    Criar ou renomear ambientes e suítes
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenRoomCategories();
                }}
                className="w-full p-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-3 text-left transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0">
                  <FolderTree className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-sm font-extrabold text-white">
                    Categorias de Cômodos
                  </span>
                  <span className="block text-xs text-slate-400">
                    Quartos, Banheiros, Áreas Sociais, etc.
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenRoomOrder();
                }}
                className="w-full p-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-3 text-left transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0">
                  <ArrowUpDown className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-sm font-extrabold text-white">
                    Ordem dos Cômodos
                  </span>
                  <span className="block text-xs text-slate-400">
                    Definir sequência de vistoria
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCategories();
                }}
                className="w-full p-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-3 text-left transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-sm font-extrabold text-white">
                    Gerenciar Categorias
                  </span>
                  <span className="block text-xs text-slate-400">
                    Grupos de utensílios e móveis
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPrefixes();
                }}
                className="w-full p-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-3 text-left transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0">
                  <Hash className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-sm font-extrabold text-white">
                    Gerador de Códigos
                  </span>
                  <span className="block text-xs text-slate-400">
                    Prefixos TG, TM, TP e regras
                  </span>
                </div>
              </button>
            </div>
          )}

          {/* Database / Cloud Settings */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSupabase();
                }}
                className="w-full p-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-3 text-left transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-sm font-extrabold text-white">
                    Banco & Nuvem (Supabase)
                  </span>
                  <span className="block text-xs text-slate-400">
                    Configurar credenciais e SQL
                  </span>
                </div>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenOtaSettings?.();
              }}
              className="w-full p-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-3 text-left transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <span className="block text-sm font-extrabold text-white">
                  Atualizações do App (OTA)
                </span>
                <span className="block text-xs text-slate-400">
                  Verificar versão e releases no GitHub
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Footer info & Logout */}
        <div className="pt-4 border-t border-slate-800 space-y-3">
          {onLogout && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="w-full p-3.5 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 font-black text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4 stroke-[2.5]" />
              <span>Sair da Conta (Trocar Usuário)</span>
            </button>
          )}
          <p className="text-[11px] font-bold text-slate-500 text-center">
            Chácara Inventário &amp; Equipe
          </p>
        </div>
      </div>
    </div>
  );
};
