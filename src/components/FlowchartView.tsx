import React, { useEffect, useState, useCallback, useRef } from 'react';
import mermaid from 'mermaid';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Note, NoteType } from '../../types';
import { chatWithStep } from '../../services/geminiService';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';

interface FlowchartViewProps {
  notes: Record<string, Note>;
  projectTitle: string;
  rootNoteId: string;
}

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

const FlowchartView: React.FC<FlowchartViewProps> = ({ notes, projectTitle, rootNoteId }) => {
  const [svgContent, setSvgContent] = useState<string>('');
  const [isRendering, setIsRendering] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [chatHistories, setChatHistories] = useState<Record<string, ChatMessage[]>>({});
  const [userInput, setUserInput] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis'
      }
    });
  }, []);

  const generateMermaidCode = useCallback(() => {
    if (!notes[rootNoteId]) return "";

    let code = "graph TD\n";
    
    // Styling
    code += "classDef root fill:#4f46e5,stroke:#fff,stroke-width:2px,color:#fff,cursor:pointer;\n";
    code += "classDef text fill:#1e293b,stroke:#475569,stroke-width:1px,color:#cbd5e1,cursor:pointer;\n";
    code += "classDef code fill:#0f172a,stroke:#3b82f6,stroke-width:1px,color:#60a5fa,cursor:pointer;\n";
    code += "classDef image fill:#1e293b,stroke:#8b5cf6,stroke-width:1px,color:#a78bfa,cursor:pointer;\n";
    code += "classDef selected fill:#fbbf24,stroke:#fff,stroke-width:3px,color:#000,cursor:pointer;\n";

    const visited = new Set<string>();

    const processNote = (noteId: string) => {
      if (visited.has(noteId)) return "";
      visited.add(noteId);

      const note = notes[noteId];
      if (!note) return "";
      
      let nodeCode = "";
      const id = note.id.replace(/-/g, '');
      const title = note.title.replace(/[()"[\]{}]/g, "'"); 
      
      // Node definition
      const isSelected = selectedNoteId === note.id;
      const styleClass = isSelected ? 'selected' : (
          note.type === NoteType.ROOT ? 'root' : 
          note.type === NoteType.CODE ? 'code' : 
          note.type === NoteType.IMAGE ? 'image' : 'text'
      );

      if (note.type === NoteType.ROOT) {
        nodeCode += `  ${id}("${title}"):::${styleClass}\n`;
      } else {
        nodeCode += `  ${id}["${title}"]:::${styleClass}\n`;
      }

      // Connections
      if (note.children && note.children.length > 0) {
        note.children.forEach(childId => {
          const child = notes[childId];
          if (child) {
            const childCleanId = child.id.replace(/-/g, '');
            nodeCode += `  ${id} --> ${childCleanId}\n`;
            nodeCode += processNote(childId);
          }
        });
      }
      
      return nodeCode;
    };

    code += processNote(rootNoteId);
    return code;
  }, [notes, rootNoteId, selectedNoteId]);

  useEffect(() => {
    const code = generateMermaidCode();
    if (!code) return;

    let isMounted = true;
    const renderDiagram = async () => {
      setIsRendering(true);
      try {
        const id = `mermaid-render-${Date.now()}`;
        const { svg } = await mermaid.render(id, code);
        if (isMounted) {
          setSvgContent(svg);
        }
      } catch (error) {
        console.error("Mermaid render error:", error);
      } finally {
        if (isMounted) setIsRendering(false);
      }
    };

    renderDiagram();
    return () => { isMounted = false; };
  }, [generateMermaidCode]);

  // Handle node clicks
  const handleSvgClick = (e: React.MouseEvent) => {
    const target = e.target as SVGElement;
    const node = target.closest('.node');
    if (node) {
      const nodeIdClean = node.id.split('-')[0]; // Mermaid nodes have IDs
      // Map back to our IDs
      const foundId = Object.keys(notes).find(id => id.replace(/-/g, '') === nodeIdClean);
      if (foundId) {
        setSelectedNoteId(foundId);
      }
    }
  };

  const handleSendMessage = async () => {
    if (!selectedNoteId || !userInput.trim() || isAsking) return;

    const note = notes[selectedNoteId];
    const currentHistory = chatHistories[selectedNoteId] || [];
    const newHistory: ChatMessage[] = [...currentHistory, { role: 'user', content: userInput }];
    
    setChatHistories(prev => ({ ...prev, [selectedNoteId]: newHistory }));
    setUserInput('');
    setIsAsking(true);

    try {
      const response = await chatWithStep(
        projectTitle,
        note.title,
        note.content,
        userInput,
        currentHistory.map(m => ({ role: m.role, parts: [{ text: m.content }] }))
      );

      setChatHistories(prev => ({
        ...prev,
        [selectedNoteId]: [...newHistory, { role: 'model', content: response }]
      }));
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      setIsAsking(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistories, selectedNoteId]);

  const selectedNote = selectedNoteId ? notes[selectedNoteId] : null;

  return (
    <div className="w-full h-full min-h-[600px] bg-slate-900/50 backdrop-blur-xl rounded-[2.5rem] border border-white/5 flex flex-col overflow-hidden relative">
      <div className="flex items-center justify-between p-8 border-b border-white/5 bg-white/5">
        <div>
          <h3 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
             <div className="w-8 h-8 bg-indigo-500 rounded-xl flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                </svg>
             </div>
             Akıl Haritası Tuvali
          </h3>
          <p className="text-sm text-slate-400 mt-1">"{projectTitle}" projesinin etkileşimli haritası</p>
        </div>
        <div className="flex items-center gap-4">
            {isRendering && (
                <div className="text-[10px] text-indigo-400 font-black tracking-widest animate-pulse uppercase">Modelleniyor...</div>
            )}
            <div className="flex bg-black/20 p-1 rounded-xl border border-white/5">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/20">
                    <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                    <span className="text-[10px] text-indigo-300 font-black uppercase tracking-wider">Kök Bilgi</span>
                </div>
            </div>
        </div>
      </div>
      
      <div className="flex-1 flex overflow-hidden relative">
        {/* Canvas Area */}
        <div className="flex-1 bg-[#0F1117] relative cursor-grab active:cursor-grabbing" onClick={handleSvgClick}>
            <TransformWrapper
                initialScale={1}
                minScale={0.5}
                maxScale={3}
                centerOnInit
            >
                {({ zoomIn, zoomOut, resetTransform }) => (
                    <>
                        <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
                            <button onClick={() => zoomIn()} className="p-3 bg-white/5 hover:bg-white/10 text-white rounded-2xl border border-white/5 transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg></button>
                            <button onClick={() => zoomOut()} className="p-3 bg-white/5 hover:bg-white/10 text-white rounded-2xl border border-white/5 transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg></button>
                            <button onClick={() => resetTransform()} className="p-3 bg-white/5 hover:bg-white/10 text-white rounded-2xl border border-white/10 transition-all font-black text-[10px] uppercase">Sıfırla</button>
                        </div>
                        <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full flex items-center justify-center">
                            <div 
                                className="mermaid-container p-20"
                                dangerouslySetInnerHTML={{ __html: svgContent }}
                            ></div>
                        </TransformComponent>
                    </>
                )}
            </TransformWrapper>
        </div>

        {/* AI Chat Assistant Sidebar */}
        <AnimatePresence>
            {selectedNote && (
                <motion.div 
                    initial={{ x: 400 }}
                    animate={{ x: 0 }}
                    exit={{ x: 400 }}
                    className="w-96 bg-[#161B22] border-l border-white/5 flex flex-col shadow-2xl z-20"
                >
                    <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-500/10 text-indigo-400 rounded-2xl flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" /></svg>
                            </div>
                            <div className="min-w-0">
                                <h4 className="text-white font-black text-sm truncate">{selectedNote.title}</h4>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Adım Asistanı</p>
                            </div>
                        </div>
                        <button onClick={() => setSelectedNoteId(null)} className="p-2 text-slate-500 hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-[#0D1117]">
                        {(!chatHistories[selectedNoteId || ''] || chatHistories[selectedNoteId || ''].length === 0) && (
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                <p className="text-sm font-medium">Bu adım hakkında<br/>AI asistanına soru sor.</p>
                            </div>
                        )}
                        {chatHistories[selectedNoteId || '']?.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white font-medium' : 'bg-white/5 text-slate-200 border border-white/5'}`}>
                                    <div className="markdown-body text-xs prose-invert leading-relaxed">
                                        <ReactMarkdown>
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {isAsking && (
                            <div className="flex justify-start">
                                <div className="bg-white/5 px-4 py-3 rounded-2xl flex items-center gap-2">
                                    <div className="flex gap-1">
                                        <div className="w-1 h-1 bg-slate-500 rounded-full animate-bounce"></div>
                                        <div className="w-1 h-1 bg-slate-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                                        <div className="w-1 h-1 bg-slate-500 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    <div className="p-4 border-t border-white/5 bg-[#0F1117]">
                        <div className="relative group">
                            <input 
                                type="text"
                                value={userInput}
                                onChange={(e) => setUserInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                                placeholder="Bir şey sor..."
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all pr-12"
                            />
                            <button 
                                onClick={handleSendMessage}
                                disabled={isAsking || !userInput.trim()}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 rounded-xl text-white transition-all shadow-lg shadow-indigo-600/20"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                            </button>
                        </div>
                        <p className="text-[10px] text-center text-slate-600 mt-3 font-bold uppercase tracking-widest">Gemini 3 Flash Pro</p>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default FlowchartView;
