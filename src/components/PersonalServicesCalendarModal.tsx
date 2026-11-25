import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Edit2,
  List,
  Loader2,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { registerBackHandler } from '../lib/backNavigation';
import {
  createPersonalService,
  deletePersonalService,
  fetchPersonalServices,
  formatCurrencyBRL,
  formatTimeShort,
  getGoogleMapsLink,
  getPhoneCallLink,
  getWhatsAppLink,
  togglePersonalServiceStatus,
  updatePersonalService,
} from '../services/personalServicesService';
import { formatDateBR, getLocalTodayDateStr } from '../services/staysService';
import { AppUserProfile } from '../types/auth';
import {
  getCategoriesForRole,
  getCategoryMeta,
  PersonalService,
  PersonalServiceStatus,
} from '../types/personalService';

interface PersonalServicesCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: AppUserProfile;
  onToast?: (msg: string) => void;
}

export const PersonalServicesCalendarModal: React.FC<PersonalServicesCalendarModalProps> = ({
  isOpen,
  onClose,
  userProfile,
  onToast,
}) => {
  const [services, setServices] = useState<PersonalService[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'day_schedule' | 'month' | 'list'>('day_schedule');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() => getLocalTodayDateStr());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'scheduled' | 'completed'>('all');

  // Form modal state (Create / Edit)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<PersonalService | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form fields
  const [formTitle, setFormTitle] = useState('');
  const [formClientName, setFormClientName] = useState('');
  const [formClientPhone, setFormClientPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formDate, setFormDate] = useState(selectedDate);
  const [formStartTime, setFormStartTime] = useState('08:00');
  const [formEndTime, setFormEndTime] = useState('12:00');
  const [formCategory, setFormCategory] = useState('geral');
  const [formPrice, setFormPrice] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const todayStr = getLocalTodayDateStr();
  const categories = useMemo(() => getCategoriesForRole(userProfile.role), [userProfile.role]);

  // Load services for this staff member
  const loadServices = async () => {
    setIsLoading(true);
    try {
      const data = await fetchPersonalServices(userProfile.email);
      setServices(data);
    } catch (err) {
      console.error('Erro ao carregar serviços:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadServices();
    }
  }, [isOpen, userProfile.email]);

  // Android hardware back handler
  useEffect(() => {
    if (!isOpen) return;
    const unregister = registerBackHandler('PersonalServicesCalendarModal', 65, () => {
      if (isFormOpen) {
        setIsFormOpen(false);
        return true;
      }
      onClose();
      return true;
    });
    return unregister;
  }, [isOpen, isFormOpen, onClose]);

  // Open Form for New Service
  const handleOpenNewForm = (presetHour?: string) => {
    setEditingService(null);
    const startHour = presetHour ? presetHour.slice(0, 5) : '08:00';
    const [h, m] = startHour.split(':').map(Number);
    const endHourNum = Math.min(h + 3, 23);
    const endHour = `${String(endHourNum).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;

    const defaultCat = categories[0]?.id || 'geral';
    setFormTitle(
      userProfile.role === 'faxineira'
        ? 'Faxina Residencial'
        : userProfile.role === 'piscineiro'
        ? 'Limpeza de Piscina'
        : 'Serviço Particular'
    );
    setFormClientName('');
    setFormClientPhone('');
    setFormAddress('');
    setFormDate(selectedDate || todayStr);
    setFormStartTime(startHour);
    setFormEndTime(endHour);
    setFormCategory(defaultCat);
    setFormPrice('');
    setFormNotes('');
    setIsFormOpen(true);
  };

  // Open Form for Editing
  const handleOpenEditForm = (srv: PersonalService) => {
    setEditingService(srv);
    setFormTitle(srv.title);
    setFormClientName(srv.client_name || '');
    setFormClientPhone(srv.client_phone || '');
    setFormAddress(srv.address || '');
    setFormDate(srv.service_date);
    setFormStartTime(srv.start_time ? srv.start_time.slice(0, 5) : '08:00');
    setFormEndTime(srv.end_time ? srv.end_time.slice(0, 5) : '12:00');
    setFormCategory(srv.category || categories[0]?.id || 'geral');
    setFormPrice(srv.price !== null && srv.price !== undefined ? String(srv.price) : '');
    setFormNotes(srv.notes || '');
    setIsFormOpen(true);
  };

  // Save Service (Create or Update)
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      alert('Informe o título do serviço.');
      return;
    }
    if (!formDate) {
      alert('Informe a data do serviço.');
      return;
    }

    setIsSaving(true);
    const categoryMeta = getCategoryMeta(formCategory, userProfile.role);
    const priceNum = formPrice.trim() ? parseFloat(formPrice.replace(',', '.')) : null;

    try {
      if (editingService) {
        const updated = await updatePersonalService(
          editingService.id,
          {
            title: formTitle.trim(),
            client_name: formClientName.trim() || null,
            client_phone: formClientPhone.trim() || null,
            address: formAddress.trim() || null,
            service_date: formDate,
            start_time: formStartTime,
            end_time: formEndTime,
            category: formCategory,
            color: categoryMeta.color,
            price: priceNum !== null && !isNaN(priceNum) ? priceNum : null,
            notes: formNotes.trim() || null,
          },
          userProfile.email
        );
        setServices((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        onToast?.('Serviço atualizado com sucesso!');
      } else {
        const created = await createPersonalService({
          user_email: userProfile.email,
          staff_role: userProfile.role,
          title: formTitle.trim(),
          client_name: formClientName.trim() || null,
          client_phone: formClientPhone.trim() || null,
          address: formAddress.trim() || null,
          service_date: formDate,
          start_time: formStartTime,
          end_time: formEndTime,
          category: formCategory,
          color: categoryMeta.color,
          price: priceNum !== null && !isNaN(priceNum) ? priceNum : null,
          status: 'scheduled',
          notes: formNotes.trim() || null,
        });
        setServices((prev) => [...prev, created]);
        onToast?.('Novo serviço agendado!');
      }
      setIsFormOpen(false);
    } catch (err) {
      console.error('Erro ao salvar serviço:', err);
      alert('Falha ao salvar o serviço. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle status
  const handleToggleStatus = async (srv: PersonalService) => {
    try {
      const next = await togglePersonalServiceStatus(srv.id, srv.status, userProfile.email);
      setServices((prev) =>
        prev.map((s) => (s.id === srv.id ? { ...s, status: next } : s))
      );
      onToast?.(next === 'completed' ? 'Serviço concluído!' : 'Serviço reaberto.');
    } catch (err) {
      console.error('Erro ao alternar status:', err);
    }
  };

  // Delete service
  const handleDeleteService = async (srv: PersonalService) => {
    if (!window.confirm(`Excluir o agendamento "${srv.title}"?`)) return;
    try {
      await deletePersonalService(srv.id, userProfile.email);
      setServices((prev) => prev.filter((s) => s.id !== srv.id));
      onToast?.('Serviço excluído.');
    } catch (err) {
      console.error('Erro ao excluir:', err);
    }
  };

  // Calendar calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };
  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };
  const handleGoToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(todayStr);
  };

  // Day timeline hours: 07:00 to 20:00 (Google Calendar Schedule style)
  const timelineHours = [
    '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
    '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'
  ];

  // Services on the selected day
  const selectedDayServices = useMemo(() => {
    return services.filter((s) => s.service_date === selectedDate);
  }, [services, selectedDate]);

  // Filtered services for the list view
  const filteredListServices = useMemo(() => {
    let list = [...services];
    if (filterStatus === 'scheduled') {
      list = list.filter((s) => s.status === 'scheduled');
    } else if (filterStatus === 'completed') {
      list = list.filter((s) => s.status === 'completed');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          (s.client_name && s.client_name.toLowerCase().includes(q)) ||
          (s.client_phone && s.client_phone.includes(q)) ||
          (s.address && s.address.toLowerCase().includes(q)) ||
          (s.notes && s.notes.toLowerCase().includes(q))
      );
    }

    return list.sort((a, b) => {
      if (a.service_date !== b.service_date) {
        return a.service_date.localeCompare(b.service_date);
      }
      return (a.start_time || '').localeCompare(b.start_time || '');
    });
  }, [services, filterStatus, searchQuery]);

  // Metrics summary
  const metrics = useMemo(() => {
    const total = services.length;
    const scheduled = services.filter((s) => s.status === 'scheduled').length;
    const completed = services.filter((s) => s.status === 'completed').length;
    const todayCount = services.filter((s) => s.service_date === todayStr).length;
    const totalEarnings = services
      .filter((s) => s.status === 'completed' && s.price)
      .reduce((sum, s) => sum + (s.price || 0), 0);
    return { total, scheduled, completed, todayCount, totalEarnings };
  }, [services, todayStr]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl h-[94vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white">
                  Minha Agenda Pessoal
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-extrabold text-[10px] border border-indigo-500/30">
                  {userProfile.role === 'faxineira'
                    ? 'Modo Faxineira • Clientes Particulares'
                    : userProfile.role === 'piscineiro'
                    ? 'Modo Piscineiro • Clientes Particulares'
                    : 'Agenda Particular'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Seus serviços e compromissos do dia a dia fora da chácara.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleOpenNewForm()}
              className="px-3 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-black text-xs flex items-center gap-1.5 shadow-lg shadow-indigo-500/25 transition-all cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Novo Serviço</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation & Controls Bar */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 bg-slate-950/50 shrink-0">
          {/* View Switcher (Google Calendar Style) */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('day_schedule')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'day_schedule'
                  ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Dia / Horários</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'month'
                  ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Mês</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>
          </div>

          {/* Month / Date Navigator */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleGoToday}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
            >
              Hoje
            </button>
            <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-black text-white px-2">
                {monthNames[month]} {year}
              </span>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">
          {/* 1. GOOGLE CALENDAR DAY / SCHEDULE VIEW */}
          {viewMode === 'day_schedule' && (
            <div className="space-y-4">
              {/* Day selection ribbon */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/70 border border-slate-800 gap-2 overflow-x-auto">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="text-xs font-bold text-slate-300">Data selecionada:</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-700 text-xs font-black text-white focus:outline-none focus:border-indigo-400"
                  />
                  {selectedDate === todayStr && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-black text-[10px] border border-emerald-500/30">
                      Hoje
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenNewForm('08:00')}
                  className="px-3 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Neste Dia</span>
                </button>
              </div>

              {/* Timeline Grid (Hourly Slots like Google Calendar) */}
              <div className="rounded-3xl bg-slate-950/70 border border-slate-800 divide-y divide-slate-800/80 shadow-xl overflow-hidden">
                {timelineHours.map((hour) => {
                  const hourInt = parseInt(hour.slice(0, 2), 10);
                  // Find services that start in this hour
                  const slotServices = selectedDayServices.filter((s) => {
                    const startH = parseInt((s.start_time || '08:00').slice(0, 2), 10);
                    return startH === hourInt;
                  });

                  return (
                    <div
                      key={hour}
                      className="group flex items-start gap-3 p-3 min-h-[72px] hover:bg-slate-900/60 transition-colors"
                    >
                      {/* Hour label column */}
                      <div className="w-14 shrink-0 text-right">
                        <span className="text-xs font-mono font-black text-slate-500 group-hover:text-indigo-400 transition-colors">
                          {hour}
                        </span>
                      </div>

                      {/* Services or Empty Clickable Slot */}
                      <div className="flex-1 space-y-2">
                        {slotServices.length > 0 ? (
                          slotServices.map((srv) => {
                            const meta = getCategoryMeta(srv.category, userProfile.role);
                            const isDone = srv.status === 'completed';

                            return (
                              <div
                                key={srv.id}
                                className={`p-3 sm:p-4 rounded-2xl border transition-all duration-200 shadow-md ${
                                  isDone
                                    ? 'bg-slate-900/50 border-slate-800 opacity-70'
                                    : 'bg-slate-900 border-slate-700 hover:border-indigo-400'
                                }`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span
                                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${meta.bgClass} ${meta.textClass} ${meta.borderClass}`}
                                    >
                                      {meta.label}
                                    </span>
                                    <span className="text-xs font-mono font-bold text-amber-300">
                                      {formatTimeShort(srv.start_time)} às {formatTimeShort(srv.end_time)}
                                    </span>
                                    <h4
                                      className={`text-sm font-black text-white ${
                                        isDone ? 'line-through text-slate-400' : ''
                                      }`}
                                    >
                                      {srv.title}
                                    </h4>
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    {srv.price !== null && srv.price !== undefined && (
                                      <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono font-black text-xs">
                                        {formatCurrencyBRL(srv.price)}
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleToggleStatus(srv)}
                                      className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                                        isDone
                                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                          : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'
                                      }`}
                                      title={isDone ? 'Reabrir serviço' : 'Marcar como concluído'}
                                    >
                                      {isDone ? <Check className="w-4 h-4 stroke-[3]" /> : <CheckCircle2 className="w-4 h-4" />}
                                    </button>
                                  </div>
                                </div>

                                {/* Client, address & contact area */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-2 text-slate-300">
                                  {srv.client_name && (
                                    <div className="flex items-center gap-1.5">
                                      <User className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                      <span className="font-bold">{srv.client_name}</span>
                                    </div>
                                  )}
                                  {srv.address && (
                                    <div className="flex items-center gap-1.5">
                                      <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                      <span className="truncate">{srv.address}</span>
                                    </div>
                                  )}
                                </div>

                                {srv.notes && (
                                  <p className="text-[11px] text-slate-400 mt-2 bg-slate-950/40 p-2 rounded-xl">
                                    {srv.notes}
                                  </p>
                                )}

                                {/* Bottom Quick Action Bar */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 mt-2 border-t border-slate-800/60">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {srv.client_phone && (
                                      <>
                                        <a
                                          href={getWhatsAppLink(srv.client_phone, srv.client_name) || '#'}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="px-2.5 py-1 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold flex items-center gap-1 transition-colors"
                                        >
                                          <MessageCircle className="w-3 h-3" />
                                          <span>WhatsApp</span>
                                        </a>
                                        <a
                                          href={getPhoneCallLink(srv.client_phone) || '#'}
                                          className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1 transition-colors"
                                        >
                                          <Phone className="w-3 h-3" />
                                          <span>Ligar</span>
                                        </a>
                                      </>
                                    )}
                                    {srv.address && (
                                      <a
                                        href={getGoogleMapsLink(srv.address) || '#'}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="px-2.5 py-1 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 text-[11px] font-bold flex items-center gap-1 transition-colors"
                                      >
                                        <Navigation className="w-3 h-3" />
                                        <span>Mapa / GPS</span>
                                      </a>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditForm(srv)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                      title="Editar serviço"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteService(srv)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                                      title="Excluir serviço"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div
                            onClick={() => handleOpenNewForm(hour)}
                            className="h-full min-h-[44px] rounded-2xl border border-dashed border-slate-800/80 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all flex items-center px-3 cursor-pointer group/slot text-slate-600 hover:text-indigo-300 text-xs font-bold"
                          >
                            <span className="opacity-0 group-hover/slot:opacity-100 transition-opacity flex items-center gap-1">
                              <Plus className="w-3 h-3" /> Agendar serviço às {hour}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. GOOGLE CALENDAR MONTH GRID VIEW */}
          {viewMode === 'month' && (
            <div className="space-y-4">
              <div className="p-4 rounded-3xl bg-slate-950/80 border border-slate-800 shadow-xl space-y-3">
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-black uppercase text-slate-500 pb-1">
                  <span>Dom</span>
                  <span>Seg</span>
                  <span>Ter</span>
                  <span>Qua</span>
                  <span>Qui</span>
                  <span>Sex</span>
                  <span>Sáb</span>
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-7 gap-1 sm:gap-2">
                  {/* Empty cells before month start */}
                  {Array.from({ length: firstDayIndex }).map((_, i) => (
                    <div key={`empty-${i}`} className="h-20 sm:h-24 rounded-2xl bg-slate-900/20 opacity-30" />
                  ))}

                  {/* Month days */}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const dayNum = i + 1;
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                    const isSelected = selectedDate === dateStr;
                    const isToday = dateStr === todayStr;

                    const dayServices = services.filter((s) => s.service_date === dateStr);
                    const hasServices = dayServices.length > 0;

                    return (
                      <div
                        key={dateStr}
                        onClick={() => {
                          setSelectedDate(dateStr);
                          setViewMode('day_schedule');
                        }}
                        className={`h-20 sm:h-24 p-1.5 sm:p-2 rounded-2xl border transition-all flex flex-col justify-between cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-500/20 border-indigo-400 ring-2 ring-indigo-400/50 shadow-lg'
                            : hasServices
                            ? 'bg-slate-900/90 border-slate-700 hover:border-indigo-400/60'
                            : 'bg-slate-950/40 border-slate-800/60 hover:border-slate-700 text-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs font-black ${
                              isToday
                                ? 'w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center'
                                : isSelected
                                ? 'text-indigo-300'
                                : 'text-slate-300'
                            }`}
                          >
                            {dayNum}
                          </span>
                          {hasServices && (
                            <span className="text-[10px] font-black px-1.5 rounded-full bg-indigo-500/20 text-indigo-300">
                              {dayServices.length}
                            </span>
                          )}
                        </div>

                        {/* Event chips */}
                        <div className="space-y-0.5 overflow-hidden">
                          {dayServices.slice(0, 2).map((srv) => {
                            const meta = getCategoryMeta(srv.category, userProfile.role);
                            return (
                              <div
                                key={srv.id}
                                className={`text-[9px] font-bold px-1 py-0.5 rounded truncate ${meta.bgClass} ${meta.textClass}`}
                              >
                                {formatTimeShort(srv.start_time)} {srv.title}
                              </div>
                            );
                          })}
                          {dayServices.length > 2 && (
                            <div className="text-[9px] font-bold text-slate-500 pl-1">
                              +{dayServices.length - 2} mais
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 3. AGENDA LIST VIEW */}
          {viewMode === 'list' && (
            <div className="space-y-4">
              {/* Filter & Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-2xl bg-slate-950/70 border border-slate-800">
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setFilterStatus('all')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      filterStatus === 'all'
                        ? 'bg-indigo-500 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Todos ({metrics.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('scheduled')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      filterStatus === 'scheduled'
                        ? 'bg-amber-500 text-slate-950 shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Agendados ({metrics.scheduled})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('completed')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      filterStatus === 'completed'
                        ? 'bg-emerald-500 text-slate-950 shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Concluídos ({metrics.completed})
                  </button>
                </div>

                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar cliente, título, endereço..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-400"
                  />
                </div>
              </div>

              {/* Services List */}
              {filteredListServices.length === 0 ? (
                <div className="text-center py-16 space-y-3 bg-slate-950/40 rounded-3xl border border-slate-800 p-6">
                  <CalendarIcon className="w-10 h-10 text-slate-600 mx-auto" />
                  <h3 className="text-base font-black text-white">Nenhum serviço nesta lista</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Toque em &quot;Novo Serviço&quot; para registrar seu primeiro cliente ou compromisso particular.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleOpenNewForm()}
                    className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-black text-xs inline-flex items-center gap-1.5 shadow-lg shadow-indigo-500/20 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Criar Novo Serviço</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredListServices.map((srv) => {
                    const meta = getCategoryMeta(srv.category, userProfile.role);
                    const isDone = srv.status === 'completed';

                    return (
                      <div
                        key={srv.id}
                        className={`p-4 rounded-3xl border transition-all duration-200 flex flex-col gap-3 shadow-lg ${
                          isDone
                            ? 'bg-slate-950/40 border-slate-800/80 opacity-75'
                            : 'bg-slate-900 border-slate-800 hover:border-indigo-500/50'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-black border ${meta.bgClass} ${meta.textClass} ${meta.borderClass}`}
                            >
                              {meta.label}
                            </span>
                            <span className="px-2.5 py-1 rounded-xl bg-slate-800 border border-slate-700 text-amber-300 font-mono font-black text-xs">
                              {formatDateBR(srv.service_date)} ({formatTimeShort(srv.start_time)} -{' '}
                              {formatTimeShort(srv.end_time)})
                            </span>
                            <h4
                              className={`text-base font-black text-white ${
                                isDone ? 'line-through text-slate-400' : ''
                              }`}
                            >
                              {srv.title}
                            </h4>
                          </div>

                          <div className="flex items-center gap-2">
                            {srv.price !== null && srv.price !== undefined && (
                              <span className="px-2.5 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono font-black text-xs">
                                {formatCurrencyBRL(srv.price)}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(srv)}
                              className={`px-3 py-1.5 rounded-xl border text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                                isDone
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700'
                              }`}
                            >
                              {isDone ? (
                                <>
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Reabrir</span>
                                </>
                              ) : (
                                <>
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                  <span>Concluir</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Details */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-300">
                          {srv.client_name && (
                            <div className="flex items-center gap-1.5 p-2 rounded-xl bg-slate-950/50">
                              <User className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              <span className="font-bold">{srv.client_name}</span>
                            </div>
                          )}
                          {srv.client_phone && (
                            <div className="flex items-center gap-1.5 p-2 rounded-xl bg-slate-950/50">
                              <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span>{srv.client_phone}</span>
                            </div>
                          )}
                          {srv.address && (
                            <div className="flex items-center gap-1.5 p-2 rounded-xl bg-slate-950/50">
                              <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                              <span className="truncate">{srv.address}</span>
                            </div>
                          )}
                        </div>

                        {srv.notes && (
                          <div className="p-2.5 rounded-xl bg-slate-950/40 text-xs text-slate-400 border border-slate-800/60">
                            {srv.notes}
                          </div>
                        )}

                        {/* Bottom Actions */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {srv.client_phone && (
                              <a
                                href={getWhatsAppLink(srv.client_phone, srv.client_name) || '#'}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span>WhatsApp</span>
                              </a>
                            )}
                            {srv.address && (
                              <a
                                href={getGoogleMapsLink(srv.address) || '#'}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors"
                              >
                                <Navigation className="w-3.5 h-3.5" />
                                <span>Google Maps</span>
                              </a>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenEditForm(srv)}
                              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1 transition-colors"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>Editar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteService(srv)}
                              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 text-xs font-bold flex items-center gap-1 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Excluir</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Earnings & Status Bar */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-4 text-slate-400 font-bold">
            <span>
              Total de Serviços: <strong className="text-white">{metrics.total}</strong>
            </span>
            <span>
              Agendados: <strong className="text-amber-400">{metrics.scheduled}</strong>
            </span>
            <span>
              Concluídos: <strong className="text-emerald-400">{metrics.completed}</strong>
            </span>
          </div>

          {metrics.totalEarnings > 0 && (
            <div className="flex items-center gap-1.5 text-emerald-400 font-black">
              <DollarSign className="w-4 h-4" />
              <span>Recebido (Concluídos): {formatCurrencyBRL(metrics.totalEarnings)}</span>
            </div>
          )}
        </div>
      </div>

      {/* CREATE / EDIT SERVICE MODAL FORM */}
      {isFormOpen && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <CalendarIcon className="w-4 h-4" />
                </div>
                <h3 className="text-base font-black text-white">
                  {editingService ? 'Editar Serviço' : 'Novo Serviço na Minha Agenda'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Category selector */}
              <div>
                <label className="block font-bold text-slate-400 mb-1.5">
                  Tipo / Categoria do Serviço
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setFormCategory(cat.id);
                        if (!editingService && formTitle.trim().length === 0) {
                          setFormTitle(cat.label);
                        }
                      }}
                      className={`p-2 rounded-xl border text-left font-bold transition-all cursor-pointer flex items-center gap-2 ${
                        formCategory === cat.id
                          ? `${cat.bgClass} ${cat.textClass} ${cat.borderClass} ring-1 ring-indigo-400`
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="truncate">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  Título / Descrição Curta *
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ex: Faxina Casa D. Maria, Limpeza Piscina Condomínio..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-indigo-400 text-xs"
                />
              </div>

              {/* Client Name & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Nome do Cliente</label>
                  <input
                    type="text"
                    value={formClientName}
                    onChange={(e) => setFormClientName(e.target.value)}
                    placeholder="Ex: Maria Silva"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-indigo-400 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">WhatsApp / Telefone</label>
                  <input
                    type="tel"
                    value={formClientPhone}
                    onChange={(e) => setFormClientPhone(e.target.value)}
                    placeholder="Ex: (11) 98765-4321"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-indigo-400 text-xs"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  Endereço / Local do Serviço
                </label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Ex: Rua das Flores, 120 - Bairro Centro"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-indigo-400 text-xs"
                />
              </div>

              {/* Date & Quick Date Buttons */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-300">Data do Serviço *</label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setFormDate(todayStr)}
                      className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold"
                    >
                      Hoje
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const tomorrow = new Date();
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        setFormDate(tomorrow.toISOString().slice(0, 10));
                      }}
                      className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold"
                    >
                      Amanhã
                    </button>
                  </div>
                </div>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold focus:outline-none focus:border-indigo-400 text-xs"
                />
              </div>

              {/* Times (Start and End) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Horário Início</label>
                  <input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold focus:outline-none focus:border-indigo-400 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Horário Término</label>
                  <input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold focus:outline-none focus:border-indigo-400 text-xs"
                  />
                </div>
              </div>

              {/* Price */}
              <div>
                <label className="block font-bold text-slate-300 mb-1">Valor Cobrado (R$)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 font-bold text-slate-500">R$</span>
                  <input
                    type="text"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    placeholder="Ex: 180,00"
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono font-bold placeholder:text-slate-600 focus:outline-none focus:border-indigo-400 text-xs"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block font-bold text-slate-300 mb-1">Observações Adicionais</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Instruções de chave, produtos a levar, detalhes do local..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-indigo-400 text-xs resize-none"
                />
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-black flex items-center gap-1.5 shadow-lg shadow-indigo-500/25 transition-all cursor-pointer active:scale-95 disabled:opacity-60"
                >
                  {isSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  )}
                  <span>{editingService ? 'Salvar Alterações' : 'Agendar Serviço'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
