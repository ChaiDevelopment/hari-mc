'use client';

import type { DatesSetArg, EventClickArg, EventContentArg, EventInput } from '@fullcalendar/core';
import idLocale from '@fullcalendar/core/locales/id';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import clsx from 'clsx';
import { AlertTriangle, MapPin, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/admin/admin-shell';
import { Alert, LinkButton, StatusBadge } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { CalendarEventDto } from '@/lib/admin-types';
import { STATUS_META, formatDate, formatTimeRange } from '@/lib/format';
import type { BookingStatus } from '@/lib/types';

const WIB_MS = 7 * 3_600_000;
/** Kalender ditampilkan dalam WIB: waktu dikirim sebagai "jam dinding" WIB dan FullCalendar diset ke UTC. */
const toWall = (iso: string | Date) => new Date(+new Date(iso) + WIB_MS).toISOString().slice(0, 19);
const fromWall = (d: Date) => new Date(+d - WIB_MS);

const COLORS: Record<BookingStatus, { bg: string; border: string; text: string }> = {
  PENDING: { bg: '#fff8e6', border: '#d4a017', text: '#6b4e00' },
  ACCEPTED: { bg: '#e7f2fb', border: '#3a7fbf', text: '#123a5e' },
  WAITING_PAYMENT: { bg: '#f1ecfb', border: '#7b5cc4', text: '#3b2470' },
  CONFIRMED: { bg: '#0e192c', border: '#c29f5f', text: '#f8f3ea' },
  IN_PROGRESS: { bg: '#15253f', border: '#e4d0a0', text: '#f8f3ea' },
  COMPLETED: { bg: '#e8f5ee', border: '#3f9a6b', text: '#15462d' },
  REJECTED: { bg: '#f3f4f6', border: '#cbd5e1', text: '#64748b' },
  CANCELLED: { bg: '#f3f4f6', border: '#cbd5e1', text: '#64748b' },
  REFUNDED: { bg: '#f3f4f6', border: '#cbd5e1', text: '#64748b' },
};
const FILTERS: BookingStatus[] = ['PENDING', 'ACCEPTED', 'WAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED'];
const DEFAULT_ON: BookingStatus[] = ['PENDING', 'ACCEPTED', 'WAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'];

export default function CalendarPage() {
  const [range, setRange] = useState<{ from: Date; to: Date } | null>(null);
  const [events, setEvents] = useState<CalendarEventDto[]>([]);
  const [buffer, setBuffer] = useState(0);
  const [active, setActive] = useState<Set<BookingStatus>>(new Set(DEFAULT_ON));
  const [selected, setSelected] = useState<CalendarEventDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const calRef = useRef<FullCalendar>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => {
    calRef.current?.getApi().changeView(narrow ? 'listWeek' : 'dayGridMonth');
  }, [narrow]);

  const load = useCallback(async () => {
    if (!range) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() });
      if (active.size) qs.set('status', [...active].join(','));
      const r = await api<{ events: CalendarEventDto[]; travelBufferMinutes: number }>(`/admin/calendar?${qs}`);
      setEvents(active.size ? r.events : []);
      setBuffer(r.travelBufferMinutes);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal memuat kalender');
    } finally {
      setLoading(false);
    }
  }, [range, active]);
  useEffect(() => {
    void load();
  }, [load]);

  const fcEvents = useMemo<EventInput[]>(() => {
    const out: EventInput[] = [];
    for (const e of events) {
      const c = COLORS[e.status];
      out.push({
        id: e.id,
        title: `${e.eventName} · ${e.contactName}`,
        start: toWall(e.eventStartAt),
        end: toWall(e.eventEndAt),
        backgroundColor: c.bg,
        borderColor: e.conflicts.length ? '#dc2626' : c.border,
        textColor: c.text,
        classNames: [e.blocking ? 'hmc-blocking' : 'hmc-tentative', e.conflicts.length ? 'hmc-conflict' : ''],
        extendedProps: { booking: e },
      });
      // Jeda perjalanan untuk jadwal yang mengunci (tampil di tampilan minggu/hari)
      if (e.blocking && buffer > 0) {
        const s = +new Date(e.eventStartAt);
        const en = +new Date(e.eventEndAt);
        for (const [a, b] of [
          [s - buffer * 60_000, s],
          [en, en + buffer * 60_000],
        ]) {
          out.push({ start: toWall(new Date(a)), end: toWall(new Date(b)), display: 'background', backgroundColor: '#c29f5f', classNames: ['hmc-buffer'] });
        }
      }
    }
    return out;
  }, [events, buffer]);

  const conflictCount = events.filter((e) => e.conflicts.length).length;

  const toggle = (s: BookingStatus) =>
    setActive((prev) => {
      const n = new Set(prev);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });

  const renderEvent = (arg: EventContentArg) => {
    const b = arg.event.extendedProps.booking as CalendarEventDto | undefined;
    if (!b) return null;
    return (
      <div className="flex min-w-0 items-center gap-1 overflow-hidden px-1 py-0.5 text-[0.72rem] leading-tight">
        {b.conflicts.length > 0 && <AlertTriangle className="size-3 shrink-0 text-red-600" aria-label="Bentrok" />}
        {arg.timeText && <span className="shrink-0 font-semibold">{arg.timeText}</span>}
        <span className="truncate">{b.eventName}</span>
      </div>
    );
  };

  return (
    <>
      <PageHeader eyebrow="Kalender" title="Jadwal acara">
        Waktu ditampilkan dalam WIB. Garis tegas = jadwal terkunci; garis putus-putus = menunggu persetujuan (belum mengunci jadwal).
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter status">
        {FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => toggle(s)}
            aria-pressed={active.has(s)}
            className={clsx('flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition', active.has(s) ? 'border-navy-900/20 bg-white text-navy-900 shadow-soft' : 'border-line bg-cream-100 text-muted line-through')}
          >
            <span className="size-2.5 rounded-full" style={{ background: COLORS[s].border }} aria-hidden />
            {STATUS_META[s].label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
        <span className="flex items-center gap-2">
          <span className="h-3 w-6 rounded bg-gold-500/25" aria-hidden /> Jeda perjalanan {buffer} menit
        </span>
        <span className="flex items-center gap-2">
          <AlertTriangle className="size-3.5 text-red-600" aria-hidden /> Bentrok / terlalu berdekatan
        </span>
        {loading && <span>Memuat…</span>}
      </div>
      {conflictCount > 0 && (
        <Alert tone="error" className="mb-4" title={`${conflictCount} acara pada rentang ini bentrok atau terlalu berdekatan`}>
          Klik acara bertanda untuk melihat detail.
        </Alert>
      )}
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}

      <div className="hmc-calendar rounded-2xl border border-line bg-white p-3 shadow-soft sm:p-5" data-testid="calendar">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          locale={idLocale}
          timeZone="UTC"
          initialView="dayGridMonth"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' }}
          buttonText={{ today: 'Hari ini', month: 'Bulan', week: 'Minggu', day: 'Hari', list: 'Agenda' }}
          height="auto"
          firstDay={1}
          dayMaxEvents={3}
          nowIndicator
          slotMinTime="06:00:00"
          slotMaxTime="24:00:00"
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          events={fcEvents}
          eventContent={renderEvent}
          datesSet={(a: DatesSetArg) => setRange({ from: fromWall(a.start), to: fromWall(a.end) })}
          eventClick={(a: EventClickArg) => {
            const b = a.event.extendedProps.booking as CalendarEventDto | undefined;
            if (b) setSelected(b);
          }}
          noEventsContent="Tidak ada acara pada rentang ini"
        />
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="ev-title">
          <button className="absolute inset-0 bg-navy-950/50" onClick={() => setSelected(null)} aria-label="Tutup" />
          <div className="relative w-full max-w-md rounded-t-2xl bg-white p-6 shadow-lift sm:rounded-2xl" data-testid="event-detail">
            <button onClick={() => setSelected(null)} className="absolute top-4 right-4 rounded-full p-1.5 text-muted hover:bg-cream-100" aria-label="Tutup">
              <X className="size-4" />
            </button>
            <div className="flex items-center gap-2">
              <StatusBadge status={selected.status} />
              <span className="font-mono text-xs text-muted">{selected.code}</span>
            </div>
            <h2 id="ev-title" className="mt-3 font-display text-2xl text-navy-900">
              {selected.eventName}
            </h2>
            <p className="text-sm text-muted">
              {selected.contactName} · {selected.serviceName}
            </p>
            <p className="mt-4 text-sm font-medium text-navy-900">
              {formatDate(selected.eventStartAt, selected.timezone)}
              <br />
              {formatTimeRange(selected.eventStartAt, selected.eventEndAt, selected.timezone)}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
              <MapPin className="size-4 text-gold-600" aria-hidden /> {selected.venueName}, {selected.city}
            </p>
            {!selected.blocking && ['PENDING'].includes(selected.status) && <p className="mt-3 text-xs text-muted">Belum mengunci jadwal — menunggu persetujuan.</p>}
            {selected.conflicts.length > 0 && (
              <div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-900">
                <p className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="size-4" aria-hidden /> Bentrok dengan:
                </p>
                <ul className="mt-1 space-y-0.5">
                  {selected.conflicts.map((c) => (
                    <li key={c.id}>
                      <Link className="font-mono underline" href={`/admin/pesanan/${c.id}`}>
                        {c.code}
                      </Link>{' '}
                      ({c.type === 'OVERLAP' ? 'tumpang tindih' : 'dalam jeda perjalanan'})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <LinkButton href={`/admin/pesanan/${selected.id}`} className="mt-6 w-full" variant="navy">
              Buka detail booking
            </LinkButton>
          </div>
        </div>
      )}
    </>
  );
}
