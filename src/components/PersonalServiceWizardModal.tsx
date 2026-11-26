import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Phone,
  User,
  Check,
  ChevronRight,
  ChevronLeft,
  X,
  Sparkles,
  Loader2,
  CalendarDays,
  Sun,
  Sunset,
  Sunrise,
  Waves,
  Brush,
  Shirt,
  Building2,
  Home,
  Wrench,
  CheckCircle2,
} from 'lucide-react';
import { registerBackHandler } from '../lib/backNavigation';
import { PersonalService, getCategoryMeta } from '../types/personalService';

export interface ServiceWizardFormData {
  title: string;
  category: string;
  service_date: string;
  start_time: string;
  end_time: string;
  client_name?: string;
  client_phone?: string;
  address?: string;
  notes?: string;
}

export interface PersonalServiceWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  role: 'faxineira' | 'piscineiro' | 'admin';
  editingService?: PersonalService | null;
  initialDate?: string;
  onSave: (data: ServiceWizardFormData) => Promise<void>;
}

interface ServicePresetOption {
  id: string;
  title: string;
  category: string;
  subtitle: string;
  icon: React.ReactNode;
}

const FAXINEIRA_PRESETS: ServicePresetOption[] = [
  {
    id: 'faxina_residencial',
    title: 'Faxina Residencial',
    category: 'faxina_residencial',
    subtitle: 'Casa, apto ou rotina',
    icon: <Home className="w-5 h-5 text-blue-400" />,
  },
  {
    id: 'faxina_pesada',
    title: 'Faxina Pesada',
    category: 'faxina_pesada',
    subtitle: 'Limpeza geral ou pós-festa',
    icon: <Sparkles className="w-5 h-5 text-purple-400" />,
  },
  {
    id: 'passadoria',
    title: 'Passadoria de Roupas',
    category: 'passadoria',
    subtitle: 'Passar e organizar',
    icon: <Shirt className="w-5 h-5 text-pink-400" />,
  },
  {
    id: 'diaria_completa',
    title: 'Diária Completa',
    category: 'diaria_completa',
    subtitle: 'Dia todo de diarista',
    icon: <Brush className="w-5 h-5 text-emerald-400" />,
  },
  {
    id: 'comercial',
    title: 'Comercial / Escritório',
    category: 'comercial',
    subtitle: 'Comércio ou clínica',
    icon: <Building2 className="w-5 h-5 text-cyan-400" />,
  },
  {
    id: 'outro',
    title: 'Outro Serviço',
    category: 'outro',
    subtitle: 'Personalizar nome',
    icon: <Wrench className="w-5 h-5 text-slate-400" />,
  },
];

const PISCINEIRO_PRESETS: ServicePresetOption[] = [
  {
    id: 'limpeza_simples',
    title: 'Limpeza & Aspiração',
    category: 'limpeza_simples',
    subtitle: 'Fundo, bordas e folhas',
    icon: <Waves className="w-5 h-5 text-sky-400" />,
  },
  {
    id: 'tratamento_quimico',
    title: 'Tratamento c/ Cloro & pH',
    category: 'tratamento_quimico',
    subtitle: 'Cloro, algicida e decantação',
    icon: <Sparkles className="w-5 h-5 text-cyan-400" />,
  },
  {
    id: 'troca_areia',
    title: 'Troca de Areia do Filtro',
    category: 'troca_areia',
    subtitle: 'Troca de carga filtrante',
    icon: <Wrench className="w-5 h-5 text-purple-400" />,
  },
  {
    id: 'manutencao_bomba',
    title: 'Manutenção Bomba / Motor',
    category: 'manutencao_bomba',
    subtitle: 'Revisão ou conserto',
    icon: <Wrench className="w-5 h-5 text-amber-400" />,
  },
  {
    id: 'limpeza_pesada',
    title: 'Limpeza Pesada / Choque',
    category: 'limpeza_pesada',
    subtitle: 'Água verde ou parada',
    icon: <Waves className="w-5 h-5 text-blue-400" />,
  },
  {
    id: 'outro',
    title: 'Outro Serviço',
    category: 'outro',
    subtitle: 'Personalizar nome',
    icon: <Wrench className="w-5 h-5 text-slate-400" />,
  },
];

const TIME_PRESETS = [
  {
    label: 'Manhã',
    start: '08:00',
    end: '12:00',
    icon: <Sunrise className="w-4 h-4 text-amber-400" />,
  },
  {
    label: 'Tarde',
    start: '13:00',
    end: '17:00',
    icon: <Sun className="w-4 h-4 text-orange-400" />,
  },
  {
    label: 'Dia Todo',
    start: '08:00',
    end: '17:00',
    icon: <Sunset className="w-4 h-4 text-purple-400" />,
  },
];

export const PersonalServiceWizardModal: React.FC<PersonalServiceWizardModalProps> = ({
  isOpen,
  onClose,
  role,
  editingService,
  initialDate,
  onSave,
}) => {
  // Step State: 1 to 4
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [serviceDate, setServiceDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('12:00');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [address, setAddress] = useState('');
  const [customTitleMode, setCustomTitleMode] = useState(false);

  // Today & Tomorrow calculations
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const presets = useMemo(() => {
    return role === 'piscineiro' ? PISCINEIRO_PRESETS : FAXINEIRA_PRESETS;
  }, [role]);

  // Initialize or reset form on open / change of editingService
  useEffect(() => {
    if (!isOpen) return;

    if (editingService) {
      setTitle(editingService.title || '');
      setCategory(editingService.category || (role === 'piscineiro' ? 'limpeza_simples' : 'faxina_residencial'));
      setServiceDate(editingService.service_date || todayStr);
      setStartTime(editingService.start_time || '08:00');
      setEndTime(editingService.end_time || '');
      setClientName(editingService.client_name || '');
      setClientPhone(editingService.client_phone || '');
      setAddress(editingService.address || '');
      setCurrentStep(1);
      setCustomTitleMode(false);
    } else {
      const defaultCategory = role === 'piscineiro' ? 'limpeza_simples' : 'faxina_residencial';
      const defaultPreset = presets[0];
      setTitle(defaultPreset?.title || 'Serviço');
      setCategory(defaultPreset?.category || defaultCategory);
      setServiceDate(initialDate || todayStr);
      setStartTime('08:00');
      setEndTime('12:00');
      setClientName('');
      setClientPhone('');
      setAddress('');
      setCurrentStep(1);
      setCustomTitleMode(false);
    }
  }, [isOpen, editingService, initialDate, role, presets, todayStr]);

  // Back button navigation (Priority 70: Intercepts before modals)
  useEffect(() => {
    if (!isOpen) return;

    const unregister = registerBackHandler('PersonalServiceWizardModal', 70, () => {
      if (currentStep > 1) {
        setCurrentStep((s) => s - 1);
        return true;
      }
      onClose();
      return true;
    });

    return unregister;
  }, [isOpen, currentStep, onClose]);

  if (!isOpen) return null;

  // Format date readable in pt-BR
  const formatFriendlyDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      const weekday = dt.toLocaleDateString('pt-BR', { weekday: 'short' });
      const month = dt.toLocaleDateString('pt-BR', { month: 'short' });
      return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${d} de ${month}`;
    } catch {
      return dateStr;
    }
  };

  const handleSelectPreset = (p: ServicePresetOption) => {
    setCategory(p.category);
    if (p.id === 'outro') {
      setTitle('');
      setCustomTitleMode(true);
    } else {
      setTitle(p.title);
      setCustomTitleMode(false);
    }
  };

  const handleApplyTimePreset = (tp: { start: string; end: string }) => {
    setStartTime(tp.start);
    setEndTime(tp.end);
  };

  const handleNextStep = () => {
    if (currentStep === 1 && !title.trim()) return;
    if (currentStep === 2 && !serviceDate) return;
    if (currentStep === 3 && !startTime) return;

    if (currentStep < 4) {
      setCurrentStep((s) => s + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((s) => s - 1);
    } else {
      onClose();
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!title.trim() || !serviceDate || !startTime) return;

    setIsSubmitting(true);
    try {
      await onSave({
        title: title.trim(),
        category: category || (role === 'piscineiro' ? 'limpeza_simples' : 'faxina_residencial'),
        service_date: serviceDate,
        start_time: startTime,
        end_time: endTime || '',
        client_name: clientName.trim() || undefined,
        client_phone: clientPhone.trim() || undefined,
        address: address.trim() || undefined,
      });
      onClose();
    } catch (err) {
      console.error('Erro ao salvar serviço:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const progressPercent = (currentStep / 4) * 100;
  const isPiscineiro = role === 'piscineiro';
  const themeColor = isPiscineiro ? 'cyan' : 'purple';

  return (
    <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* MODAL HEADER WITH DYNAMIC PROGRESS */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${
                isPiscineiro
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
              }`}>
                Etapa {currentStep} de 4
              </span>
              <h3 className="text-sm sm:text-base font-black text-white">
                {editingService ? 'Editar Serviço' : 'Novo Agendamento'}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800/80 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Stepper Dots & Progress Bar */}
          <div className="space-y-2">
            <div className="w-full bg-slate-800/80 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ease-out ${
                  isPiscineiro
                    ? 'bg-gradient-to-r from-sky-400 to-cyan-400'
                    : 'bg-gradient-to-r from-indigo-500 to-purple-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="grid grid-cols-4 text-center gap-1">
              {[
                { step: 1, label: 'Serviço' },
                { step: 2, label: 'Data' },
                { step: 3, label: 'Horário' },
                { step: 4, label: 'Detalhes' },
              ].map((s) => {
                const isActive = currentStep === s.step;
                const isPassed = currentStep > s.step;
                return (
                  <button
                    key={s.step}
                    type="button"
                    onClick={() => {
                      if (s.step < currentStep || (currentStep === 1 && title.trim())) {
                        setCurrentStep(s.step);
                      }
                    }}
                    className={`text-[11px] font-bold py-0.5 rounded transition-colors ${
                      isActive
                        ? isPiscineiro ? 'text-cyan-300' : 'text-purple-300 font-black'
                        : isPassed
                        ? 'text-slate-300 hover:text-white'
                        : 'text-slate-600'
                    }`}
                  >
                    {s.step}. {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* STEP CONTENT CONTAINER */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 text-xs sm:text-sm">
          {/* ================= STEP 1: QUAL O SERVIÇO ================= */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div>
                <h4 className="text-base font-black text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Qual serviço você vai realizar?
                </h4>
                <p className="text-slate-400 text-xs mt-0.5 font-bold">
                  Toque em uma opção ou personalize o nome abaixo:
                </p>
              </div>

              {/* Preset Cards Grid */}
              <div className="grid grid-cols-2 gap-2">
                {presets.map((p) => {
                  const isSelected = title === p.title && !customTitleMode;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPreset(p)}
                      className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                        isSelected
                          ? isPiscineiro
                            ? 'bg-cyan-500/15 border-cyan-400 ring-2 ring-cyan-400/40 text-white'
                            : 'bg-purple-500/15 border-purple-400 ring-2 ring-purple-400/40 text-white'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                          {p.icon}
                        </div>
                        {isSelected && (
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white ${
                            isPiscineiro ? 'bg-cyan-500' : 'bg-purple-600'
                          }`}>
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="font-black text-xs sm:text-sm text-white leading-tight">
                          {p.title}
                        </div>
                        <div className="text-[10px] text-slate-400 font-bold mt-0.5 line-clamp-1">
                          {p.subtitle}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Custom Input */}
              <div className="pt-2">
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Ou digite o nome do serviço:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      setCustomTitleMode(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleNextStep();
                      }
                    }}
                    placeholder="Ex: Faxina Pós-Pintura, Troca de Bomba..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-purple-400 text-xs sm:text-sm"
                  />
                  {title.trim() && (
                    <span className="absolute right-3 top-3 text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 2: QUAL A DATA ================= */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div>
                <h4 className="text-base font-black text-white flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-purple-400" />
                  Para qual dia é o serviço?
                </h4>
                <p className="text-slate-400 text-xs mt-0.5 font-bold">
                  Escolha um atalho rápido ou selecione a data:
                </p>
              </div>

              {/* Quick Date Cards */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* HOJE */}
                <button
                  type="button"
                  onClick={() => setServiceDate(todayStr)}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                    serviceDate === todayStr
                      ? isPiscineiro
                        ? 'bg-cyan-500/15 border-cyan-400 ring-2 ring-cyan-400/40 text-white'
                        : 'bg-purple-500/15 border-purple-400 ring-2 ring-purple-400/40 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-black uppercase text-amber-400 tracking-wider">
                      Hoje
                    </span>
                    {serviceDate === todayStr && (
                      <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                    )}
                  </div>
                  <div className="text-sm font-black text-white">
                    {formatFriendlyDate(todayStr)}
                  </div>
                </button>

                {/* AMANHÃ */}
                <button
                  type="button"
                  onClick={() => setServiceDate(tomorrowStr)}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                    serviceDate === tomorrowStr
                      ? isPiscineiro
                        ? 'bg-cyan-500/15 border-cyan-400 ring-2 ring-cyan-400/40 text-white'
                        : 'bg-purple-500/15 border-purple-400 ring-2 ring-purple-400/40 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-black uppercase text-indigo-400 tracking-wider">
                      Amanhã
                    </span>
                    {serviceDate === tomorrowStr && (
                      <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                    )}
                  </div>
                  <div className="text-sm font-black text-white">
                    {formatFriendlyDate(tomorrowStr)}
                  </div>
                </button>
              </div>

              {/* Exact Date Picker Input */}
              <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                <label className="block text-xs font-bold text-slate-300">
                  Ou selecione outra data:
                </label>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={serviceDate}
                    onChange={(e) => setServiceDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-bold focus:outline-none focus:border-purple-400 text-xs sm:text-sm"
                  />
                </div>
                {serviceDate && serviceDate !== todayStr && serviceDate !== tomorrowStr && (
                  <p className="text-xs font-black text-purple-300 mt-1">
                    🗓️ Selecionado: {formatFriendlyDate(serviceDate)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ================= STEP 3: QUAL O HORÁRIO ================= */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div>
                <h4 className="text-base font-black text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  Qual o horário do serviço?
                </h4>
                <p className="text-slate-400 text-xs mt-0.5 font-bold">
                  Selecione um turno sugerido ou ajuste as horas:
                </p>
              </div>

              {/* Quick Period Presets */}
              <div className="grid grid-cols-3 gap-2">
                {TIME_PRESETS.map((tp) => {
                  const isSelected = startTime === tp.start && endTime === tp.end;
                  return (
                    <button
                      key={tp.label}
                      type="button"
                      onClick={() => handleApplyTimePreset(tp)}
                      className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                        isSelected
                          ? isPiscineiro
                            ? 'bg-cyan-500/15 border-cyan-400 ring-2 ring-cyan-400/40 text-white'
                            : 'bg-purple-500/15 border-purple-400 ring-2 ring-purple-400/40 text-white'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="mb-1">{tp.icon}</div>
                      <span className="font-black text-xs text-white block">{tp.label}</span>
                      <span className="text-[10px] text-slate-400 font-bold block mt-0.5">
                        {tp.start} - {tp.end}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Exact Time Selectors */}
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Horário de Início *
                  </label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-bold focus:outline-none focus:border-purple-400 text-xs sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Horário de Término
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-bold focus:outline-none focus:border-purple-400 text-xs sm:text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 4: DETALHES & RESUMO ================= */}
          {currentStep === 4 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div>
                <h4 className="text-base font-black text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-emerald-400" />
                  Onde ou para quem é o serviço?
                </h4>
                <p className="text-slate-400 text-xs mt-0.5 font-bold">
                  Campos opcionais para organizar o seu dia:
                </p>
              </div>

              {/* Inputs */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      Cliente ou Local
                    </label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Ex: Dona Maria, Casa 12..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-purple-400 text-xs sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      WhatsApp / Contato
                    </label>
                    <input
                      type="tel"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="Ex: (11) 99999-9999"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-purple-400 text-xs sm:text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    Endereço / Condomínio (opcional)
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ex: Rua das Flores, 123 ou Sítio Primavera"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-purple-400 text-xs sm:text-sm"
                  />
                </div>
              </div>

              {/* LIVE RESUMO CARD */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-slate-950 to-slate-900 border border-purple-500/30 shadow-lg space-y-2">
                <span className="text-[10px] font-black uppercase text-purple-400 tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Resumo do Agendamento
                </span>
                <div className="text-sm font-black text-white flex items-center justify-between">
                  <span>{title || 'Serviço'}</span>
                  <span className="text-xs px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 font-bold">
                    Particular
                  </span>
                </div>
                <div className="text-xs text-slate-300 flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-1 font-bold">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {formatFriendlyDate(serviceDate)}
                  </span>
                  <span className="flex items-center gap-1 font-bold">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {startTime} {endTime ? `às ${endTime}` : ''}
                  </span>
                  {clientName && (
                    <span className="flex items-center gap-1 font-bold text-emerald-300">
                      <User className="w-3.5 h-3.5" />
                      {clientName}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER BUTTONS */}
        <div className="px-5 py-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handlePrevStep}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {currentStep === 1 ? (
              'Cancelar'
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" />
                Voltar
              </>
            )}
          </button>

          {currentStep < 4 ? (
            <button
              type="button"
              onClick={handleNextStep}
              disabled={
                (currentStep === 1 && !title.trim()) ||
                (currentStep === 2 && !serviceDate) ||
                (currentStep === 3 && !startTime)
              }
              className={`px-5 py-2.5 rounded-xl text-white font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-lg transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                isPiscineiro
                  ? 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-600/25'
                  : 'bg-purple-600 hover:bg-purple-500 shadow-purple-600/25'
              }`}
            >
              <span>Continuar</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={isSubmitting || !title.trim() || !serviceDate || !startTime}
              className={`px-6 py-2.5 rounded-xl text-white font-black text-xs sm:text-sm flex items-center gap-2 shadow-xl transition-all cursor-pointer active:scale-95 disabled:opacity-50 ${
                isPiscineiro
                  ? 'bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 shadow-cyan-500/30'
                  : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-purple-600/30'
              }`}
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4 stroke-[3]" />
              )}
              <span>{editingService ? 'Salvar Alterações' : 'Confirmar e Agendar'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
