import React from 'react';
import { Note, Project } from '../types';
import { motion } from 'motion/react';

interface CalendarViewProps {
  notes: Record<string, Note>;
  projects: Project[];
  onNavigateToNote: (noteId: string) => void;
  onFilterDate?: (dateStr: string) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ notes, projects, onNavigateToNote, onFilterDate }) => {
  const [currentDate, setCurrentDate] = React.useState(new Date());

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const padding = Array.from({ length: firstDay === 0 ? 6 : firstDay - 1 }, (_, i) => i); // Adjust for Monday start

  const notesByDate: Record<string, Note[]> = {};
  Object.values(notes).forEach(note => {
    const date = new Date(note.timestamp).toDateString();
    if (!notesByDate[date]) notesByDate[date] = [];
    notesByDate[date].push(note);
  });

  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <div className="bg-[#0F1117] border border-white/10 rounded-[2.5rem] p-8 shadow-2xl">
      <div className="flex justify-between items-center mb-8">
        <h3 className="text-2xl font-black text-white tracking-tight">
          {monthNames[month]} {year}
        </h3>
        <div className="flex gap-2">
          <button onClick={prevMonth} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-400 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          <button onClick={nextMonth} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-400 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-4">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => (
          <div key={day} className="text-center text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] pb-4">
            {day}
          </div>
        ))}
        
        {padding.map(i => <div key={`pad-${i}`} className="aspect-square"></div>)}
        
        {days.map(day => {
          const date = new Date(year, month, day).toDateString();
          const dayNotes = notesByDate[date] || [];
          const isToday = new Date().toDateString() === date;

          return (
            <div 
              key={day} 
              onClick={() => {
                  const dateStr = new Date(year, month, day).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }).toUpperCase();
                  onFilterDate && onFilterDate(dateStr);
              }}
              className={`aspect-square rounded-2xl border p-2 flex flex-col gap-1 transition-all cursor-pointer ${
                isToday ? 'bg-indigo-500/10 border-indigo-500/40 hover:bg-indigo-500/20' : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.05]'
              }`}
            >
              <span className={`text-xs font-bold ${isToday ? 'text-indigo-400' : 'text-slate-500'}`}>{day}</span>
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
                {dayNotes.map(note => (
                  <button
                    key={note.id}
                    onClick={() => onNavigateToNote(note.id)}
                    className="w-full text-left text-[9px] p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 truncate hover:bg-indigo-500 hover:text-white transition-all"
                    title={note.title}
                  >
                    {note.title}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
