import React, { useRef } from 'react';
import { Note, NoteType, GenerationStatus, Attachment } from '../types';
import { LoadingSpinner } from './LoadingSpinner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface NoteCardProps {
  note: Note;
  isRoot?: boolean;
  onRetry?: (noteId: string) => void;
  onExport?: () => void;
  isExporting?: boolean;
  onUpdate?: (noteId: string, updates: Partial<Note> | string) => void;
  onDelete?: (noteId: string) => void;
  onRegenerateImage?: (noteId: string, feedback: string) => void;
  onAddAttachment?: (noteId: string, attachment: Attachment) => void;
  onRemoveAttachment?: (noteId: string, attachmentId: string) => void;
  onAddTag?: (noteId: string, tag: string) => void;
  onRemoveTag?: (noteId: string, tag: string) => void;
  getNoteTitle?: (noteId: string) => string;
  onNavigateToNote?: (noteId: string) => void;
  dragHandleProps?: any;
}

const NoteCard: React.FC<NoteCardProps> = ({ 
  note, 
  isRoot = false, 
  onRetry, 
  onExport,
  isExporting = false,
  onUpdate,
  onDelete,
  onRegenerateImage,
  onAddAttachment,
  onRemoveAttachment,
  onAddTag,
  onRemoveTag,
  getNoteTitle,
  onNavigateToNote,
  dragHandleProps
}) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editContent, setEditContent] = React.useState(note.content);
  const [feedback, setFeedback] = React.useState('');
  const [showFeedback, setShowFeedback] = React.useState(false);
  const [useFeedback, setUseFeedback] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [showSuccess, setShowSuccess] = React.useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isImage = note.type === NoteType.IMAGE;
  const isLoading = note.status === GenerationStatus.GENERATING;
  const isIdle = note.status === GenerationStatus.IDLE;
  const isError = note.status === GenerationStatus.ERROR;

  const handleSave = () => {
    if (onUpdate) {
      onUpdate(note.id, { content: editContent });
    }
    setIsEditing(false);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2500);
  };

  const toggleTask = () => {
    if (onUpdate) {
        onUpdate(note.id, { isTask: !note.isTask });
    }
  };

  const toggleTaskStatus = () => {
    if (onUpdate) {
        onUpdate(note.id, { isCompleted: !note.isCompleted });
    }
  };

  const handleCancel = () => {
    setEditContent(note.content);
    setIsEditing(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onAddAttachment) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      let type: 'image' | 'audio' | 'file' = 'file';
      if (file.type.startsWith('image/')) type = 'image';
      else if (file.type.startsWith('audio/')) type = 'audio';

      const newAttachment: Attachment = {
        id: Date.now().toString(),
        type,
        url: base64String,
        name: file.name
      };
      onAddAttachment(note.id, newAttachment);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const renderAttachments = () => {
    if (!note.attachments || note.attachments.length === 0) return null;

    return (
      <div className="mt-4 space-y-2 border-t border-slate-700/50 pt-4">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Attachments</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {note.attachments.map(attachment => (
            <div key={attachment.id} className="relative group/attach bg-slate-900/50 border border-slate-700 rounded-lg p-3 flex items-center gap-3">
              {attachment.type === 'image' && (
                <div className="w-10 h-10 rounded overflow-hidden shrink-0 bg-slate-800">
                  <img src={attachment.url} alt={attachment.name} className="w-full h-full object-cover" />
                </div>
              )}
              {attachment.type === 'audio' && (
                <div className="w-10 h-10 rounded shrink-0 bg-indigo-900/30 text-indigo-400 flex items-center justify-center">
                  🎵
                </div>
              )}
              {attachment.type === 'file' && (
                <div className="w-10 h-10 rounded shrink-0 bg-slate-800 text-slate-400 flex items-center justify-center">
                  📄
                </div>
              )}
              
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-300 truncate" title={attachment.name}>{attachment.name}</p>
                {attachment.type === 'audio' && (
                  <audio src={attachment.url} controls className="w-full h-6 mt-1" />
                )}
                {attachment.type === 'file' && (
                  <a href={attachment.url} download={attachment.name} className="text-xs text-indigo-400 hover:underline">Download</a>
                )}
              </div>

              {onRemoveAttachment && (
                <button 
                  onClick={() => onRemoveAttachment(note.id, attachment.id)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover/attach:opacity-100 transition-opacity shadow-lg hide-in-pdf"
                  title="Remove Attachment"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center p-12 space-y-4 text-slate-400 bg-slate-900/30 rounded-lg border border-dashed border-slate-700">
          <LoadingSpinner />
          <span className="text-sm animate-pulse text-indigo-400 font-medium">Preparing content...</span>
          <p className="text-xs max-w-xs text-center opacity-60">AI is detailing this step, please wait.</p>
        </div>
      );
    }

    if (isIdle) {
         return (
             <div className="p-6 bg-slate-900/20 rounded-lg border border-dashed border-slate-700 text-slate-500 italic text-sm">
                 {note.content || "Content will be generated when it's time for this step..."}
             </div>
         )
    }

    if (isError) {
      return (
        <div className="flex flex-col items-center justify-center p-6 gap-3 border border-red-900/50 bg-red-900/10 rounded-lg text-center">
            <p className="text-red-400">An error occurred while generating content.</p>
            {onRetry && (
                <button 
                    onClick={() => onRetry(note.id)}
                    className="px-4 py-2 bg-red-800/50 hover:bg-red-700/50 text-red-200 text-sm rounded-md transition-colors border border-red-700/50 flex items-center gap-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v3.292a1 1 0 01-2 0V12.899a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                    </svg>
                    Retry
                </button>
            )}
        </div>
      );
    }

    if (isEditing) {
      return (
        <div className="flex flex-col gap-4 bg-slate-900/50 p-4 rounded-xl border border-indigo-500/30">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full bg-slate-950 text-slate-200 p-5 rounded-lg border border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none min-h-[250px] font-mono text-sm leading-relaxed shadow-inner"
            placeholder="Write note content here..."
          />
          <div className="flex justify-end gap-3">
            <button
              onClick={handleCancel}
              className="px-5 py-2.5 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-600"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Save
            </button>
          </div>
        </div>
      );
    }

    if (isImage) {
        if (note.content && note.content.startsWith('data:image')) {
            return (
                <div className="flex flex-col items-center p-4 bg-slate-950 rounded-lg border border-slate-800">
                    <img src={note.content} alt={note.title} className="max-w-full h-auto rounded shadow-2xl border border-slate-700" />
                    <p className="text-xs text-slate-500 mt-2 italic">Generated by Gemini Image</p>
                    
                    <div className="w-full mt-6 pt-6 border-t border-slate-800">
        <div className="flex gap-4 max-w-md mx-auto">
                            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white transition-colors">
                                <input 
                                    type="checkbox" 
                                    checked={useFeedback}
                                    onChange={(e) => setUseFeedback(e.target.checked)}
                                    className="rounded border-slate-600 text-indigo-500 focus:ring-indigo-500 bg-slate-800"
                                />
                                Revise image with feedback
                            </label>
                            
                            {useFeedback && (
                                <textarea 
                                    value={feedback}
                                    onChange={(e) => setFeedback(e.target.value)}
                                    placeholder="Ex: Darker atmosphere, make the character's hair blue..."
                                    className="w-full bg-slate-900 text-slate-300 p-3 rounded-lg border border-slate-700 text-xs focus:outline-none focus:border-indigo-500 transition-colors"
                                    rows={3}
                                />
                            )}
                            
                            <button 
                                onClick={() => {
                                    if (onRegenerateImage) onRegenerateImage(note.id, useFeedback ? feedback : '');
                                    setFeedback('');
                                    setUseFeedback(false);
                                }}
                                className="w-full bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v3.292a1 1 0 01-2 0V12.899a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                                </svg>
                                Regenerate
                            </button>
                        </div>
                    </div>
                </div>
            );
        }
        return (
            <div className="p-10 bg-[#0B0F19]/40 rounded-[2rem] border border-dashed border-white/10 text-center space-y-6">
                <div className="w-20 h-20 bg-orange-500/10 rounded-[1.5rem] flex items-center justify-center mx-auto text-orange-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                </div>
                <div className="space-y-2">
                    <h4 className="text-white font-black text-xs uppercase tracking-[0.2em]">Image Generation Failed</h4>
                    <p className="text-slate-500 text-xs leading-relaxed max-w-sm mx-auto">
                        {note.content || "An unknown error occurred."}
                    </p>
                </div>
                {onRetry && (
                    <button 
                        onClick={() => onRetry(note.id)}
                        className="bg-white/5 border border-white/10 hover:border-white/20 text-indigo-400 hover:text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                    >
                        Retry
                    </button>
                )}
            </div>
        );
    }

    // Advanced Markdown-like rendering
    return (
      <div 
        className="prose prose-invert prose-slate max-w-none group/content relative"
      >
        {!isRoot && note.type !== NoteType.IMAGE && (
          <button 
            onClick={() => setIsEditing(true)}
            className="absolute -right-2 -top-2 opacity-0 group-hover/content:opacity-100 transition-opacity bg-indigo-600 text-white text-[10px] px-2 py-1 rounded shadow-lg z-10 hide-in-pdf"
          >
            Click to edit
          </button>
        )}
        <div className="text-slate-300 leading-7 font-light markdown-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({node, inline, className, children, ...props}: any) {
                const match = /language-(\w+)/.exec(className || '')
                return !inline && match ? (
                  <SyntaxHighlighter
                    {...props}
                    children={String(children).replace(/\n$/, '')}
                    style={vscDarkPlus}
                    language={match[1]}
                    PreTag="div"
                    className="rounded-xl border border-white/10 my-6 text-sm shadow-lg shadow-black/20"
                  />
                ) : (
                  <code {...props} className={`${className} bg-white/5 text-indigo-300 px-1.5 py-0.5 rounded-md text-sm border border-white/5`}>
                    {children}
                  </code>
                )
              },
              img({node, ...props}: any) {
                if (!props.src) return null;
                return (
                  <span className="my-8 flex justify-center">
                    <img {...props} src={props.src} className="max-w-full h-auto rounded-xl shadow-2xl shadow-black/40 border border-white/10" />
                  </span>
                )
              },
              h1: ({node, ...props}: any) => <h1 {...props} className="text-2xl md:text-3xl font-bold text-white mt-8 mb-6 tracking-tight" />,
              h2: ({node, ...props}: any) => <h2 {...props} className="text-xl md:text-2xl font-bold text-indigo-200 mt-8 mb-4 tracking-tight" />,
              h3: ({node, ...props}: any) => <h3 {...props} className="text-lg md:text-xl font-bold text-indigo-300 mt-6 mb-3 pb-2 border-b border-white/5" />,
              hr: ({node, ...props}: any) => <hr {...props} className="my-8 border-white/5" />,
              blockquote: ({node, ...props}: any) => <blockquote {...props} className="border-l-4 border-indigo-500/50 pl-5 italic text-slate-400 my-6 bg-white/[0.02] py-3 rounded-r-lg" />,
              a: ({node, ...props}: any) => <a {...props} className="text-indigo-400 hover:text-indigo-300 hover:underline decoration-indigo-500/30 underline-offset-4 transition-colors" target="_blank" rel="noopener noreferrer" />,
              ul: ({node, ...props}: any) => <ul {...props} className="list-disc pl-6 mb-6 space-y-2 marker:text-indigo-500/50" />,
              ol: ({node, ...props}: any) => <ol {...props} className="list-decimal pl-6 mb-6 space-y-2 marker:text-indigo-500/50" />,
              li: ({node, ...props}: any) => <li {...props} className="text-slate-300 pl-1" />,
              p: ({node, children, ...props}: any) => {
                const hasImage = node?.children?.some((child: any) => child.tagName === 'img');
                if (hasImage) {
                  return <div {...props} className="mb-4">{children}</div>;
                }
                return <p {...props} className="mb-4">{children}</p>;
              }
            }}
          >
            {note.content}
          </ReactMarkdown>
        </div>
      </div>
    );
  };

  const [showTagInput, setShowTagInput] = React.useState(false);
  const [newTagText, setNewTagText] = React.useState('');

  const handleAddTagSubmit = () => {
    if (newTagText.trim() && onAddTag) {
      onAddTag(note.id, newTagText.trim());
      setNewTagText('');
      setShowTagInput(false);
    }
  };

  const renderTags = () => {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-700/50 pt-4">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-2">Tags:</span>
        {(note.tags || []).map(tag => (
          <span key={tag} className="bg-indigo-900/40 text-indigo-300 text-xs px-2 py-1 rounded-md flex items-center gap-1 border border-indigo-500/30">
            #{tag}
            {onRemoveTag && (
              <button onClick={() => onRemoveTag(note.id, tag)} className="hover:text-red-400 ml-1 hide-in-pdf">×</button>
            )}
          </span>
        ))}
        {onAddTag && (
          <div className="flex items-center gap-2">
            {showTagInput ? (
                <div className="flex items-center gap-2 animate-fadeIn">
                    <input 
                        type="text"
                        autoFocus
                        value={newTagText}
                        onChange={(e) => setNewTagText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddTagSubmit();
                            if (e.key === 'Escape') { setShowTagInput(false); setNewTagText(''); }
                        }}
                        placeholder="Tag name..."
                        className="bg-slate-900 border border-indigo-500/50 rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button onClick={handleAddTagSubmit} className="text-emerald-400 hover:text-emerald-300">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                    </button>
                    <button onClick={() => setShowTagInput(false)} className="text-slate-500 hover:text-slate-300">×</button>
                </div>
            ) : (
                <button 
                    onClick={() => setShowTagInput(true)}
                    className="text-xs text-slate-500 hover:text-indigo-400 border border-dashed border-slate-600 rounded-md px-2 py-1 hide-in-pdf"
                >
                    + Tag
                </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const [linkedNotesSearch, setLinkedNotesSearch] = React.useState('');

  const renderLinkedNotes = () => {
    if (!note.linkedNoteIds || note.linkedNoteIds.length === 0 || !getNoteTitle) return null;
    
    const filteredLinkedNotes = note.linkedNoteIds.filter(id => {
        const title = getNoteTitle(id);
        return title && title.toLowerCase().includes(linkedNotesSearch.toLowerCase());
    });

    return (
      <div className="mt-4 space-y-3 border-t border-slate-700/50 pt-4">
        <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Linked Notes</h4>
            {note.linkedNoteIds.length > 3 && (
                <div className="relative w-48">
                    <input 
                        type="text" 
                        placeholder="Search links..." 
                        value={linkedNotesSearch}
                        onChange={(e) => setLinkedNotesSearch(e.target.value)}
                        className="w-full bg-slate-900 text-slate-300 text-[10px] rounded pl-6 pr-2 py-1 border border-slate-700 focus:border-indigo-500 focus:outline-none"
                    />
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 absolute left-2 top-1.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
            )}
        </div>
        <div className="flex flex-wrap gap-2">
          {filteredLinkedNotes.length > 0 ? filteredLinkedNotes.map(linkedNoteId => {
            const title = getNoteTitle(linkedNoteId);
            if (!title) return null;
            return (
            <button 
              key={linkedNoteId} 
              onClick={() => onNavigateToNote && onNavigateToNote(linkedNoteId)}
              className="bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-indigo-300 flex items-center gap-2 hover:bg-slate-700 hover:border-indigo-500 transition-colors cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
              </svg>
              {title}
            </button>
            );
          }) : (
            <p className="text-xs text-slate-500 italic">No matching links found.</p>
          )}
        </div>
      </div>
    );
  };

  const getIcon = () => {
    switch (note.type) {
      case NoteType.IMAGE: return '🎨';
      case NoteType.CODE: return '💻';
      case NoteType.ROOT: return '📁';
      default: return '📝';
    }
  };

  const handleCopy = () => {
      if(note.type === NoteType.IMAGE) return; 
      navigator.clipboard.writeText(note.content);
  };

  const handleExportNoteMD = () => {
      if (note.type === NoteType.IMAGE) return;
      const blob = new Blob([note.content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${note.title.replace(/\s+/g, '_')}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  return (
    <div className={`
        relative group transition-all duration-700 break-inside-avoid
        ${isRoot 
            ? 'bg-gradient-to-br from-[#1A1D26] to-[#0F1117] border-indigo-500/40 border-2 rounded-[2.5rem] shadow-2xl shadow-black/60' 
            : 'bg-[#161B26]/30 backdrop-blur-xl border border-white/5 rounded-[2rem] hover:border-indigo-500/30 hover:bg-[#161B26]/50 shadow-xl shadow-black/30 transition-all duration-500'
        }
    `}>
      {/* Header */}
      <div 
        className={`flex flex-col sm:flex-row sm:items-center justify-between px-6 py-5 md:px-8 md:py-6 border-b ${isRoot ? 'border-white/10' : 'border-white/5'} gap-4`}
      >
        <div className="flex items-center gap-5 min-w-0">
          {dragHandleProps && (
            <div 
              {...dragHandleProps} 
              className="cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-300 p-2.5 -ml-3 rounded-2xl hover:bg-white/5 hide-in-pdf transition-all duration-300"
              title="Drag"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
              </svg>
            </div>
          )}
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-500 group-hover:scale-105 ${isRoot ? 'bg-indigo-500 text-white shadow-xl shadow-indigo-500/30' : 'bg-[#1F2937]/50 text-slate-400 border border-white/5'}`}>
             <span className="text-2xl">{getIcon()}</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-4">
              {note.isTask && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleTaskStatus(); }}
                    className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 ${note.isCompleted ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-700 hover:border-indigo-500'}`}
                  >
                      {note.isCompleted && (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                      )}
                  </button>
              )}
              <h3 
                title={note.title}
                className={`font-black tracking-tight truncate ${isRoot ? 'text-2xl md:text-3xl text-white' : 'text-lg md:text-xl text-slate-100'} ${note.isCompleted ? 'line-through opacity-50' : ''}`}
              >
                  {note.title}
              </h3>
              {showSuccess && (
                  <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-black rounded-full uppercase tracking-[0.2em] animate-pulse border border-emerald-500/20">
                      Saved
                  </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5">
                {isRoot && <span className="text-[10px] text-indigo-400 font-black tracking-[0.3em] uppercase">Master Project</span>}
                {!isRoot && <span className="text-[10px] text-slate-500 font-black tracking-[0.3em] uppercase">Step {note.status === GenerationStatus.COMPLETED ? 'Complete' : 'Pending'}</span>}
                <span className="w-1.5 h-1.5 rounded-full bg-slate-800"></span>
                <span className="text-[10px] text-slate-600 font-black uppercase tracking-[0.2em]">{new Date(note.timestamp).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</span>
                {note.assignedAgent && (
                    <>
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500/50"></span>
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded-md">
                            <span className="text-[9px] text-indigo-400 font-black uppercase tracking-wider">Agent: {note.assignedAgent}</span>
                            {note.agentRole && (
                                <span className="text-[9px] text-slate-500 font-medium italic">({note.agentRole})</span>
                            )}
                        </div>
                    </>
                )}
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 items-center justify-start sm:justify-end hide-in-pdf sm:ml-auto shrink-0">
           {isRoot && onExport && !isLoading && (
               <button 
                onClick={onExport} 
                disabled={isExporting}
                className={`flex items-center gap-2 px-4 py-2 md:px-6 md:py-3 rounded-xl md:rounded-2xl text-[10px] md:text-[11px] font-black uppercase tracking-[0.1em] md:tracking-[0.2em] transition-all shadow-xl ${isExporting ? 'bg-indigo-800 text-indigo-300 cursor-not-allowed shadow-none' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 hover:-translate-y-0.5 active:translate-y-0'}`}
                title="Download Project"
               >
                  {isExporting ? (
                    <svg className="animate-spin h-4 w-4 md:h-5 md:w-5 text-indigo-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-5 md:w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span className="hidden xs:inline">{isExporting ? '...' : 'Export'}</span>
                  {!isExporting && <span className="xs:hidden">EXP</span>}
               </button>
           )}

           {note.type !== NoteType.IMAGE && note.content && !isLoading && !isIdle && !isError && (
               <>
                   <button onClick={handleCopy} className="opacity-0 group-hover:opacity-100 transition-all text-[10px] uppercase tracking-[0.2em] bg-white/5 hover:bg-indigo-600 text-slate-400 hover:text-white px-4 py-2.5 rounded-2xl font-black border border-white/5 shadow-lg">
                       Copy
                   </button>
                   <button onClick={handleExportNoteMD} className="opacity-0 group-hover:opacity-100 transition-all text-[10px] uppercase tracking-[0.2em] bg-white/5 hover:bg-indigo-600 text-slate-400 hover:text-white px-4 py-2.5 rounded-2xl font-black border border-white/5 shadow-lg">
                       MD
                   </button>
               </>
           )}

           {!isRoot && onDelete && (
               <div className="relative opacity-0 group-hover:opacity-100 transition-all flex items-center">
                   {showDeleteConfirm ? (
                       <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-2xl p-1.5">
                           <button onClick={(e) => { e.stopPropagation(); onDelete(note.id); }} className="text-[10px] uppercase tracking-[0.2em] bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl font-black transition-all shadow-lg">Delete</button>
                           <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }} className="text-[10px] uppercase tracking-[0.2em] bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl font-black transition-all">Cancel</button>
                       </div>
                   ) : (
                       <button 
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }} 
                        className="p-3 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-2xl transition-all duration-300"
                        title="Delete Step"
                       >
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                               <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                           </svg>
                       </button>
                   )}
               </div>
           )}
        </div>
      </div>

      {/* Content */}
      <div className={`px-6 py-6 md:px-10 md:py-8 ${isRoot ? 'bg-white/[0.01]' : ''}`}>
        {renderContent()}
        {renderAttachments()}
        {renderTags()}
        {renderLinkedNotes()}
      </div>
      
      {/* Footer Actions */}
      <div className="px-6 py-4 md:px-8 md:py-5 border-t border-white/5 bg-black/40 flex justify-between items-center hide-in-pdf rounded-b-[2rem]">
        <div className="flex items-center gap-6">
            {!isRoot && onUpdate && (
                <button 
                    onClick={toggleTask}
                    className={`text-[11px] font-black uppercase tracking-[0.2em] flex items-center gap-3 transition-all group/footer ${note.isTask ? 'text-indigo-400' : 'text-slate-500 hover:text-indigo-400'}`}
                >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300 ${note.isTask ? 'bg-indigo-500/20' : 'bg-white/5 group-hover/footer:bg-indigo-500/10'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                    </div>
                    {note.isTask ? 'Task' : 'Convert to Task'}
                </button>
            )}
            {onAddAttachment && (
            <div>
                <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept="image/*,audio/*,.pdf,.doc,.docx,.txt"
                />
                <button 
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] font-black uppercase tracking-[0.2em] flex items-center gap-3 text-slate-500 hover:text-indigo-400 transition-all group/footer"
                >
                <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center group-hover/footer:bg-indigo-500/10 transition-all duration-300">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                    </svg>
                </div>
                Add File
                </button>
            </div>
            )}
            {onAddTag && (
                <button 
                    onClick={() => {
                        setShowTagInput(true);
                        setTimeout(() => {
                            const noteEl = document.getElementById(`note-${note.id}`);
                            if (noteEl) noteEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 100);
                    }}
                    className="text-[11px] font-black uppercase tracking-[0.2em] flex items-center gap-3 text-slate-500 hover:text-indigo-400 transition-all group/footer"
                >
                    <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center group-hover/footer:bg-indigo-500/10 transition-all duration-300">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M17.707 9.293l-5-5a1 1 0 00-1.414 0l-8 8a1 1 0 000 1.414l5 5a1 1 0 001.414 0l8-8a1 1 0 000-1.414zM9 14a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
                        </svg>
                    </div>
                    Tag
                </button>
            )}
        </div>
        
        <div className="flex items-center gap-4">
            <div className="text-[10px] text-slate-700 font-black uppercase tracking-[0.2em]">
                ID: {note.id.split('-')[0]}
            </div>
        </div>
      </div>

      {/* Decorative footer for root */}
      {isRoot && (
          <div className="h-2 bg-gradient-to-r from-indigo-500 via-purple-600 to-indigo-500 w-full rounded-b-3xl opacity-30 blur-[1px]"></div>
      )}
    </div>
  );
};

export default React.memo(NoteCard);