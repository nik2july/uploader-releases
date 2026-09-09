import React, { useState, useRef, useEffect } from 'react';
import { Clock, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ClockTimePickerProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  defaultPeriod?: 'AM' | 'PM';
  placeholder?: string;
  id?: string;
}

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const MINUTE_PRESETS = ['00', '15', '30', '45'];

/**
 * Robust parser for various time formats:
 * "12:00 PM", "12:00", "12 PM", "630", "18:00", "9:30 am", etc.
 */
function parseTimeString(val: string, fallbackPeriod: 'AM' | 'PM' | string = 'PM') {
  const normFallback: 'AM' | 'PM' = fallbackPeriod?.toUpperCase() === 'AM' ? 'AM' : 'PM';
  if (!val || !val.trim()) {
    return { hour: 10, minute: 0, period: normFallback, formatted: '', digitsOnly: '', isEmpty: true };
  }

  const trimmed = val.trim();
  // Check for AM/PM in string
  let period: 'AM' | 'PM' = normFallback;
  if (/am/i.test(trimmed)) {
    period = 'AM';
  } else if (/pm/i.test(trimmed)) {
    period = 'PM';
  }

  // Remove letters to parse numbers
  const digitsPart = trimmed.replace(/[a-z\s]/gi, '');
  let h = 10;
  let m = 0;

  if (digitsPart.includes(':')) {
    const parts = digitsPart.split(':');
    h = parseInt(parts[0], 10) || 10;
    m = parseInt(parts[1], 10) || 0;
  } else if (digitsPart.length === 3) {
    // e.g. "930" -> 9:30
    h = parseInt(digitsPart.slice(0, 1), 10);
    m = parseInt(digitsPart.slice(1), 10);
  } else if (digitsPart.length === 4) {
    // e.g. "1200" -> 12:00
    h = parseInt(digitsPart.slice(0, 2), 10);
    m = parseInt(digitsPart.slice(2), 10);
  } else if (digitsPart.length > 0) {
    h = parseInt(digitsPart, 10) || 10;
    m = 0;
  }

  // 24-hour conversion if entered as > 12 without explicit period
  if (h > 12 && !/am/i.test(trimmed)) {
    period = 'PM';
    h = h % 12 || 12;
  } else if (h === 0) {
    h = 12;
  } else if (h > 12) {
    h = h % 12 || 12;
  }

  if (m > 59) m = 59;
  if (m < 0) m = 0;

  const formattedH = h.toString().padStart(2, '0');
  const formattedM = m.toString().padStart(2, '0');

  return {
    hour: h,
    minute: m,
    period,
    formatted: `${formattedH}:${formattedM} ${period}`,
    digitsOnly: `${formattedH}:${formattedM}`,
    isEmpty: false,
  };
}

export const ClockTimePicker: React.FC<ClockTimePickerProps> = ({
  label,
  value,
  onChange,
  defaultPeriod = 'PM',
  placeholder = 'e.g. 12:00 PM',
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Local text state allows natural typing and backspacing without external interference
  const [inputValue, setInputValue] = useState(value || '');

  const parsed = parseTimeString(value, defaultPeriod);
  const [currentPeriod, setCurrentPeriod] = useState<'AM' | 'PM'>(parsed.period);
  const [tempHour, setTempHour] = useState<number>(parsed.hour);
  const [tempMinute, setTempMinute] = useState<number>(parsed.minute);
  const [tempPeriod, setTempPeriod] = useState<'AM' | 'PM'>(parsed.period);

  const containerRef = useRef<HTMLDivElement>(null);

  // Sync internal state when external value changes and input is not actively focused
  useEffect(() => {
    if (!isInputFocused) {
      setInputValue(value || '');
      const p = parseTimeString(value, defaultPeriod);
      setCurrentPeriod(p.period);
      setTempHour(p.hour);
      setTempMinute(p.minute);
      setTempPeriod(p.period);
    }
  }, [value, isInputFocused, defaultPeriod]);

  // Click outside listener for the clock popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle typing inside text input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInputValue(raw);
    // Directly notify parent with raw input so auto-save picks it up if completed
    if (!raw.trim()) {
      onChange('');
    } else {
      // If user typed AM or PM, update period state
      if (/am/i.test(raw)) {
        setCurrentPeriod('AM');
      } else if (/pm/i.test(raw)) {
        setCurrentPeriod('PM');
      }
      onChange(raw);
    }
  };

  // Format cleanly on blur
  const handleInputBlur = () => {
    setIsInputFocused(false);
    if (!inputValue.trim()) {
      onChange('');
      return;
    }
    const result = parseTimeString(inputValue, currentPeriod);
    setInputValue(result.formatted);
    setCurrentPeriod(result.period);
    onChange(result.formatted);
  };

  // Handle toggling AM / PM
  const handleTogglePeriod = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nextPeriod = currentPeriod === 'AM' ? 'PM' : 'AM';
    setCurrentPeriod(nextPeriod);
    setTempPeriod(nextPeriod);

    const res = parseTimeString(inputValue || value || '10:00', nextPeriod);
    const formatted = `${res.digitsOnly} ${nextPeriod}`;
    setInputValue(formatted);
    onChange(formatted);
  };

  const handleToggleClock = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const p = parseTimeString(inputValue || value, currentPeriod);
    setTempHour(p.hour);
    setTempMinute(p.minute);
    setTempPeriod(p.period);
    setMode('hour');
    setIsOpen(prev => !prev);
  };

  const handleSelectHour = (h: number) => {
    setTempHour(h);
    setMode('minute');
  };

  const handleSelectMinute = (m: number) => {
    setTempMinute(m);
  };

  const handleConfirmClock = () => {
    const formattedH = tempHour.toString().padStart(2, '0');
    const formattedM = tempMinute.toString().padStart(2, '0');
    const finalVal = `${formattedH}:${formattedM} ${tempPeriod}`;
    setInputValue(finalVal);
    setCurrentPeriod(tempPeriod);
    onChange(finalVal);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setInputValue('');
    onChange('');
    setIsOpen(false);
  };

  // Clock Hand Rotation Calculations
  const hourAngle = (tempHour % 12) * 30; // 360 / 12 = 30 deg
  const minuteAngle = (tempMinute % 60) * 6; // 360 / 60 = 6 deg
  const handAngle = mode === 'hour' ? hourAngle : minuteAngle;
  const DIAL_RADIUS = 54;

  return (
    <div className="relative" ref={containerRef}>
      {/* Label & Clear */}
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-bold text-[#111417] flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-[#7a2e33]" />
          {label}
        </label>
        {inputValue && (
          <button
            type="button"
            onClick={handleClear}
            className="text-[10px] font-semibold text-[#7a2e33] hover:underline cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* Input Group */}
      <div
        id={id}
        className={`w-full px-2.5 py-1.5 rounded-xl border transition-all flex items-center justify-between gap-1.5 bg-[#f9f8f6]/50 ${
          isOpen || isInputFocused
            ? 'border-[#7a2e33] bg-[#f9f8f6] ring-2 ring-[#7a2e33]/15'
            : 'border-[#d4c1a3] hover:border-[#7a2e33]/50'
        }`}
      >
        {/* Direct Text Input (smooth typing and backspacing) */}
        <input
          type="text"
          placeholder={placeholder}
          value={inputValue}
          onFocus={() => setIsInputFocused(true)}
          onBlur={handleInputBlur}
          onChange={handleInputChange}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
          className="w-full bg-transparent text-xs font-bold text-[#111417] focus:outline-none placeholder:text-[#6b6660]/60"
        />

        {/* Quick AM / PM Switcher Button */}
        <button
          type="button"
          onClick={handleTogglePeriod}
          title={`Click to switch to ${currentPeriod === 'AM' ? 'PM' : 'AM'}`}
          className="px-2 py-1 rounded-md text-[11px] font-extrabold uppercase bg-white border border-[#d4c1a3] text-[#7a2e33] hover:bg-[#7a2e33] hover:text-white transition-all shadow-2xs cursor-pointer shrink-0 select-none"
        >
          {currentPeriod}
        </button>

        {/* Clock Popover Toggle Button */}
        <button
          type="button"
          onClick={handleToggleClock}
          title="Open Clock Time Picker"
          className={`p-1.5 rounded-md border transition-all cursor-pointer shrink-0 ${
            isOpen
              ? 'bg-[#7a2e33] border-[#7a2e33] text-white shadow-xs'
              : 'bg-white border-[#d4c1a3] text-[#7a2e33] hover:bg-[#7a2e33]/10'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Floating Clock Modal / Popover */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 left-0 w-[240px] max-w-[calc(100vw-40px)] mt-1.5 bg-white rounded-xl border border-[#d4c1a3] shadow-xl p-3 text-[#111417]"
          >
            {/* Header: Digital Display & AM/PM */}
            <div className="flex items-center justify-between bg-[#f9f8f6] p-1.5 rounded-lg border border-[#d4c1a3] mb-2">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setMode('hour')}
                  className={`px-2 py-1 rounded-md text-sm font-bold transition-all cursor-pointer ${
                    mode === 'hour'
                      ? 'bg-[#7a2e33] text-white shadow-xs'
                      : 'bg-white/80 text-[#111417] hover:bg-white'
                  }`}
                >
                  {tempHour.toString().padStart(2, '0')}
                </button>
                <span className="text-xs font-bold text-[#7a2e33]">:</span>
                <button
                  type="button"
                  onClick={() => setMode('minute')}
                  className={`px-2 py-1 rounded-md text-sm font-bold transition-all cursor-pointer ${
                    mode === 'minute'
                      ? 'bg-[#7a2e33] text-white shadow-xs'
                      : 'bg-white/80 text-[#111417] hover:bg-white'
                  }`}
                >
                  {tempMinute.toString().padStart(2, '0')}
                </button>
              </div>

              {/* AM / PM Toggle in Popover */}
              <div className="flex bg-white/90 p-0.5 rounded-md border border-[#d4c1a3]">
                <button
                  type="button"
                  onClick={() => setTempPeriod('AM')}
                  className={`px-2 py-0.5 text-[11px] font-bold rounded transition-all cursor-pointer ${
                    tempPeriod === 'AM'
                      ? 'bg-[#7a2e33] text-white shadow-2xs'
                      : 'text-[#6b6660] hover:text-[#111417]'
                  }`}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => setTempPeriod('PM')}
                  className={`px-2 py-0.5 text-[11px] font-bold rounded transition-all cursor-pointer ${
                    tempPeriod === 'PM'
                      ? 'bg-[#7a2e33] text-white shadow-2xs'
                      : 'text-[#6b6660] hover:text-[#111417]'
                  }`}
                >
                  PM
                </button>
              </div>
            </div>

            {/* Mode switch tabs */}
            <div className="flex items-center justify-center gap-1.5 mb-2">
              <button
                type="button"
                onClick={() => setMode('hour')}
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                  mode === 'hour'
                    ? 'border-[#7a2e33] bg-[#7a2e33]/10 text-[#7a2e33]'
                    : 'border-transparent text-[#6b6660] hover:text-[#111417]'
                }`}
              >
                1. Hour (1–12)
              </button>
              <button
                type="button"
                onClick={() => setMode('minute')}
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                  mode === 'minute'
                    ? 'border-[#7a2e33] bg-[#7a2e33]/10 text-[#7a2e33]'
                    : 'border-transparent text-[#6b6660] hover:text-[#111417]'
                }`}
              >
                2. Minute
              </button>
            </div>

            {/* Interactive Radial Clock Face */}
            <div className="relative w-[150px] h-[150px] mx-auto my-0.5 rounded-full bg-[#f9f8f6] border border-[#d4c1a3] flex items-center justify-center select-none shadow-inner">
              {/* Clock Center Pivot */}
              <div className="absolute w-2.5 h-2.5 bg-[#7a2e33] rounded-full z-20 shadow-xs" />

              {/* Clock Hand / Pointer */}
              <div
                className="absolute top-1/2 left-1/2 origin-top pointer-events-none transition-transform duration-200 z-10"
                style={{
                  transform: `rotate(${handAngle + 180}deg)`,
                  width: '2px',
                  height: `${DIAL_RADIUS}px`,
                  backgroundColor: '#7a2e33',
                }}
              >
                {/* Pointer Tip Target */}
                <div className="absolute -bottom-2.5 -left-2.5 w-5 h-5 rounded-full bg-[#7a2e33]/20 border border-[#7a2e33]" />
              </div>

              {/* Dial Numbers: Hour (1..12) or Minutes (00, 05..55) */}
              {mode === 'hour'
                ? HOURS.map(h => {
                    const angleDeg = (h % 12) * 30 - 90;
                    const rad = (angleDeg * Math.PI) / 180;
                    const x = 75 + DIAL_RADIUS * Math.cos(rad);
                    const y = 75 + DIAL_RADIUS * Math.sin(rad);
                    const isSelected = tempHour === h;

                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => handleSelectHour(h)}
                        style={{
                          left: `${x}px`,
                          top: `${y}px`,
                          transform: 'translate(-50%, -50%)',
                        }}
                        className={`absolute w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center transition-all z-20 cursor-pointer ${
                          isSelected
                            ? 'bg-[#7a2e33] text-white shadow-xs scale-110'
                            : 'text-[#111417] hover:bg-white hover:text-[#7a2e33] hover:scale-105'
                        }`}
                      >
                        {h}
                      </button>
                    );
                  })
                : MINUTES.map(m => {
                    const angleDeg = (m / 5) * 30 - 90;
                    const rad = (angleDeg * Math.PI) / 180;
                    const x = 75 + DIAL_RADIUS * Math.cos(rad);
                    const y = 75 + DIAL_RADIUS * Math.sin(rad);
                    const isSelected = tempMinute === m;

                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => handleSelectMinute(m)}
                        style={{
                          left: `${x}px`,
                          top: `${y}px`,
                          transform: 'translate(-50%, -50%)',
                        }}
                        className={`absolute w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center transition-all z-20 cursor-pointer ${
                          isSelected
                            ? 'bg-[#7a2e33] text-white shadow-xs scale-110'
                            : 'text-[#111417] hover:bg-white hover:text-[#7a2e33] hover:scale-105'
                        }`}
                      >
                        {m.toString().padStart(2, '0')}
                      </button>
                    );
                  })}
            </div>

            {/* Quick minute shortcut pills */}
            <div className="flex items-center justify-between gap-1 pt-1.5 pb-1 border-t border-[#d4c1a3] mt-1.5">
              <span className="text-[9px] font-bold text-[#6b6660] uppercase">Min:</span>
              <div className="flex items-center gap-1">
                {MINUTE_PRESETS.map(preset => {
                  const pVal = parseInt(preset, 10);
                  const isSelected = tempMinute === pVal;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setTempMinute(pVal);
                        setMode('minute');
                      }}
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#7a2e33] text-white border-[#7a2e33]'
                          : 'bg-[#f9f8f6] text-[#111417] border-[#d4c1a3] hover:border-[#7a2e33]'
                      }`}
                    >
                      :{preset}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer Action Buttons */}
            <div className="flex items-center justify-between pt-1.5 border-t border-[#d4c1a3] mt-1">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-2 py-1 text-[11px] font-semibold text-[#6b6660] hover:text-[#111417] cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmClock}
                className="px-3 py-1 rounded-lg bg-[#7a2e33] text-white text-[11px] font-bold hover:bg-[#600d1e] shadow-xs transition-all flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-3 h-3" />
                Set Time
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
