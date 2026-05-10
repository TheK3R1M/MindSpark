import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DndContext, 
  closestCenter,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import html2pdf from 'html2pdf.js';
import { createProjectPlan, generateStepContent, boostPrompt, transcribeAudio } from './services/geminiService';
import { Settings, Key, X, Check, Trash2 } from 'lucide-react';
import { Note, Project, NoteType, GenerationStatus, Attachment, Category, StyleMemory } from './types';
import NoteCard from './components/NoteCard';
import FlowchartView from './src/components/FlowchartView';
import { VoiceRecorder } from './components/VoiceRecorder';
import { CalendarView } from './components/CalendarView';
import { LoadingSpinner } from './components/LoadingSpinner';
import { AITemplate } from './types';
import { auth, signInWithGoogle, logOut, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, getDoc, getDocs, onSnapshot, collection, query, where, writeBatch, deleteDoc, deleteField, or } from 'firebase/firestore';
import { sanitizeProject, sanitizeNote, sanitizeCategory } from './utils/sanitize';

const STORAGE_KEY = 'mindspark_data_v1';

interface StoredData {
  projects: Project[];
  notes: Record<string, Note>;
  categories?: Category[];
}

const SortableItem: React.FC<{ id: string, children: (dragHandleProps: any) => React.ReactNode }> = ({ id, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div id={`note-${id}`} ref={setNodeRef} style={style}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
};

interface SortableNoteProps {
  childId: string;
  index: number;
  note: Note;
  onRetry: (id: string) => void;
  onUpdate: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onRegenerateImage: (id: string, feedback: string) => void;
  onAddAttachment: (id: string, attachment: Attachment) => void;
  onRemoveAttachment: (id: string, attachmentId: string) => void;
  onAddTag: (id: string, tag: string) => void;
  onRemoveTag: (id: string, tag: string) => void;
  getNoteTitle: (id: string) => string;
  onNavigateToNote: (id: string) => void;
}

const SortableNote = React.memo(({
  childId, index, note, onRetry, onUpdate, onDelete, onRegenerateImage,
  onAddAttachment, onRemoveAttachment, onAddTag, onRemoveTag, getNoteTitle, onNavigateToNote
}: SortableNoteProps) => {
  return (
    <SortableItem id={childId}>
      {(dragHandleProps) => (
        <div className="relative group">
            <div className="absolute -left-4 top-10 bottom-0 w-px bg-white/5 hidden md:block group-hover:bg-indigo-500/10 transition-colors"></div>
            <div className="relative">
                <div className="absolute -left-10 top-7 w-8 h-8 rounded-full bg-[#0B0F19] border border-white/10 hidden md:flex items-center justify-center text-[10px] text-slate-600 font-black shadow-xl z-10 transition-all duration-500 group-hover:border-indigo-500/30 group-hover:text-indigo-400 group-hover:scale-110">
                    {index + 1}
                </div>
                <NoteCard 
                    note={note} 
                    onRetry={onRetry}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    onRegenerateImage={onRegenerateImage}
                    onAddAttachment={onAddAttachment}
                    onRemoveAttachment={onRemoveAttachment}
                    onAddTag={onAddTag}
                    onRemoveTag={onRemoveTag}
                    getNoteTitle={getNoteTitle}
                    onNavigateToNote={onNavigateToNote}
                    dragHandleProps={dragHandleProps}
                />
            </div>
        </div>
      )}
    </SortableItem>
  );
});

const CATEGORY_TEMPLATES: Record<string, { icon: string, title: string, desc: string, prompt: string }[]> = {
  "Trends": [
    { icon: "📝", title: "Blog Post Draft", desc: "An SEO-friendly, structured article plan.", prompt: "Create a comprehensive Blog Post Draft. Include SEO-friendly headings, introduction, body, and conclusion sections." },
    { icon: "🛒", title: "E-commerce Site Structure", desc: "Core pages and database architecture.", prompt: "Plan a simple E-commerce Website Structure. Which pages should there be, and what should the database structure look like?" },
    { icon: "📱", title: "Mobile App Design", desc: "UI/UX steps and key screens.", prompt: "Plan a comprehensive Mobile App Design. Include user interface (UI), user experience (UX) steps, and key screens." }
  ],
  "Finance": [
    { icon: "💰", title: "Personal Budget Plan", desc: "Income-expense tracking and savings strategies.", prompt: "Create a comprehensive personal budget and finance plan. Include income items, expense categories, and monthly savings goals." },
    { icon: "📈", title: "Stock Investment Strategy", desc: "Stock analysis and portfolio diversification.", prompt: "Plan a stock investment strategy for beginners. Include fundamental analysis, technical analysis tools, and risk management steps." },
    { icon: "🪙", title: "Crypto Asset Guide", desc: "Blockchain basics and wallet security.", prompt: "Prepare a guide for entering the world of crypto assets. Include blockchain logic, secure wallet setup, and basic investment principles." },
    { icon: "🏦", title: "Credit Management", desc: "Debt repayment and credit score improvement.", prompt: "Create a debt management and credit score improvement plan. Include restructuring existing debts and score-boosting methods." }
  ],
  "Software": [
    { icon: "🔌", title: "RESTful API Design", desc: "Endpoint structure, documentation, and security.", prompt: "Create a roadmap for a modern RESTful API design. Include endpoint structures, authentication models, and error management steps." },
    { icon: "🗄️", title: "Database Schema", desc: "Relational modeling and query optimization.", prompt: "Design a scalable SQL database schema. Explain table relationships (Join), indexing strategies, and normalization steps." },
    { icon: "☁️", title: "Microservices Architecture", desc: "Service communication and deployment strategy.", prompt: "Plan a distributed microservices architecture. Include service discovery, API Gateway usage, and Docker/K8s deployment phases." },
    { icon: "🔒", title: "Cyber Security Audit", desc: "Vulnerability analysis and penetration testing steps.", prompt: "Create a cybersecurity checklist for a web application. Add SQL injection, XSS protection, and security certificate check steps." }
  ],
  "Business": [
    { icon: "📊", title: "Market Research", desc: "Competitor analysis and target audience identification.", prompt: "Plan a market research process for a new product. Include SWOT analysis, competitor review, and survey preparation steps." },
    { icon: "🤝", title: "Investor Presentation (Pitch Deck)", desc: "Slide structure and presentation techniques.", prompt: "Plan the content for an impressive investor presentation (Pitch Deck). Detail problem, solution, business model, and financial projection slides." },
    { icon: "📣", title: "Marketing Strategy", desc: "Social media and digital advertising plan.", prompt: "Create a low-budget digital marketing strategy. Include social media content calendar and Google Ads optimization steps." }
  ],
  "Creative": [
    { icon: "🖋️", title: "Screenwriting", desc: "Character arc, dialogues, and scene structure.", prompt: "Create a script outline for a sci-fi short film. Plan the initial conflict, turning points, and character development." },
    { icon: "🎨", title: "Worldbuilding", desc: "Mythology, geography, and social structure.", prompt: "Prepare a 'Worldbuilding' guide for a fantasy universe. Construct history, map details, and the magic system." },
    { icon: "🎧", title: "Podcast Planner", desc: "Episode topics, equipment, and distribution.", prompt: "Plan a 10-episode podcast series. Include sound quality, guest finding process, and Spotify/YouTube distribution steps." }
  ],
  "Education": [
    { icon: "🌍", title: "Foreign Language Program", desc: "6-month conversation-focused study plan.", prompt: "Prepare a 6-month intensive program to learn Spanish. Include daily practice methods and mobile app suggestions." },
    { icon: "📖", title: "Speed Reading Techniques", desc: "Eye exercises and comprehension improvement.", prompt: "Create a 30-day study plan to gain speed reading and comprehension skills. Add eye muscle exercises and focus methods." },
    { icon: "🎓", title: "Exam Prep", desc: "Subject distribution and mock test frequency.", prompt: "Make a 3-month marathon plan for exam preparation. Include mock test analysis and filling missing subject gaps." }
  ],
  "Lifestyle": [
    { icon: "✈️", title: "Travel Itinerary", desc: "City guide, transportation, and accommodation.", prompt: "Plan a 2-week 'Culture and Technology' itinerary for Japan. Include inter-city transportation, hidden gems, and budget estimation." },
    { icon: "🏡", title: "Minimalist Living", desc: "Decluttering and space organization guide.", prompt: "Create a 30-day minimalist life challenge to completely simplify the home. Include daily categories of items to declutter and organization ideas." },
    { icon: "🌱", title: "Garden Design", desc: "Plant selection and maintenance calendar.", prompt: "Make a plan for growing vegetables on a balcony or in a small garden. Include seasonal planting chart and natural fertilization methods." }
  ],
  "Health": [
    { icon: "🥗", title: "Healthy Eating", desc: "Meal prep and calorie balance.", prompt: "Create a first 4-week transition plan for a sustainable healthy eating habit. Include grocery shopping list and sugar detox steps." },
    { icon: "🏋️", title: "Home Workout", desc: "Equipment-free strength and flexibility program.", prompt: "Plan an equipment-free home workout program to be applied 4 days a week. Detail HIIT sessions and cool-down exercises." },
    { icon: "🧘", title: "Mental Health (Mindfulness)", desc: "Daily meditation and sleep routine.", prompt: "Prepare a 21-day 'Mindfulness' guide to cope with modern life stress. Include daily practices and steps to improve sleep quality." }
  ],
  "Tech Extras": [
    { icon: "🏠", title: "Smart Home Infrastructure", desc: "Automation scenarios and hardware selection.", prompt: "Plan a comprehensive smart home automation. Include security cameras, lighting scenarios, and central control unit selection." },
    { icon: "🛸", title: "Future Technologies", desc: "Space mining and quantum computers.", prompt: "Plan a research report analyzing technological trends of the next 20 years. Address artificial general intelligence, Mars colonization, and the energy revolution." },
    { icon: "💻", title: "Hacker Culture and Honor", desc: "Ethical hacking and the art of clean code.", prompt: "Create a roadmap for entering the ethical hacking world. Include basic Linux knowledge, network security, and principles of being an honorable hacker." }
  ],
  "Hobbies": [
    { icon: "📸", title: "Photography Workshop", desc: "Composition, light, and editing.", prompt: "Make a 10-step training plan to improve mobile photography skills. Include light usage, framing rules, and Lightroom editing steps." },
    { icon: "🧵", title: "Handmade Production", desc: "Knitting, ceramics, or leather processing.", prompt: "Create a material list and initial project production plan to start a hobby from scratch (e.g., leather processing)." },
    { icon: "🍳", title: "Gastronomy Discovery", desc: "Molecular cuisine and mother sauces.", prompt: "Plan a guide to apply professional gastronomy techniques at home. Include making 5 base sauces and the art of presentation." }
  ]
};

const ALL_TEMPLATES = Object.values(CATEGORY_TEMPLATES).flat();

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isPlanning, setIsPlanning] = useState(false);
  const [isBoosting, setIsBoosting] = useState(false);
  const [templatePage, setTemplatePage] = useState(0);
  const [activeTemplateCategory, setActiveTemplateCategory] = useState("Trends");
  const [autoRotateIndex, setAutoRotateIndex] = useState(0);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [userGeminiKey, setUserGeminiKey] = useState(localStorage.getItem('user_gemini_api_key') || '');

  const itemsPerPage = 6;

  const getVisibleTemplates = () => {
    if (activeTemplateCategory === "All") return ALL_TEMPLATES;
    return CATEGORY_TEMPLATES[activeTemplateCategory] || [];
  };

  const visibleTemplates = getVisibleTemplates();
  const totalPages = Math.ceil(visibleTemplates.length / itemsPerPage);
  const currentTemplates = visibleTemplates.slice(templatePage * itemsPerPage, (templatePage + 1) * itemsPerPage);

  // Auto-rotate logic
  useEffect(() => {
    const timer = setInterval(() => {
        setAutoRotateIndex(prev => (prev + 1) % 4); // Rotate between 0-3 for visual effect
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  // When category changes, reset page
  useEffect(() => {
    setTemplatePage(0);
  }, [activeTemplateCategory]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    const allCollaboratorIds = Array.from(new Set(projects.flatMap(p => p.collaborators || [])));
    const idsToFetch = allCollaboratorIds.filter(id => !collaboratorProfiles[id]);
    
    if (idsToFetch.length > 0) {
        // Fetch in batches or individually if small
        idsToFetch.forEach(async (id) => {
            const snap = await getDoc(doc(db, 'users', id));
            if (snap.exists()) {
                setCollaboratorProfiles(prev => ({ ...prev, [id]: snap.data() }));
            }
        });
    }
  }, [projects, user]);

  const [aiTemplates, setAiTemplates] = useState<AITemplate[]>(() => {
    const saved = localStorage.getItem('ai_templates');
    return saved ? JSON.parse(saved) : [];
  });
  const [isCalendarView, setIsCalendarView] = useState(false);
  const [projectView, setProjectView] = useState<'content' | 'flowchart'>('content');
  const [collaboratorProfiles, setCollaboratorProfiles] = useState<Record<string, any>>({});
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showOriginalPrompt, setShowOriginalPrompt] = useState(false);

  useEffect(() => {
    setShowOriginalPrompt(false);
  }, [currentProjectId]);
  const [newTemplate, setNewTemplate] = useState({ name: '', prompt: '', icon: '🤖' });
  const projectsRef = useRef(projects);
  const notesRef = useRef(notes);
  const currentProjectIdRef = useRef(currentProjectId);

  useEffect(() => {
    projectsRef.current = projects;
    notesRef.current = notes;
    currentProjectIdRef.current = currentProjectId;
  }, [projects, notes, currentProjectId]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      if (currentUser) {
          // Ensure user document exists
          try {
              const userRef = doc(db, 'users', currentUser.uid);
              const userSnap = await getDoc(userRef);
              if (!userSnap.exists()) {
                  await setDoc(userRef, {
                      email: currentUser.email || 'no-email@example.com',
                      createdAt: Date.now()
                  });
              }

              // Migrate local data to Firebase
              const saved = localStorage.getItem(STORAGE_KEY);
              if (saved) {
                  const parsed: StoredData = JSON.parse(saved);
                  const localProjects = parsed.projects || [];
                  const localNotes = parsed.notes || {};
                  const localCategories = parsed.categories || [];

                  // Find projects that were created while logged out (they won't have a userId property)
                  const projectsToMigrate = localProjects.filter(p => !(p as any).userId);
                  
                  if (projectsToMigrate.length > 0) {
                      const batch = writeBatch(db);
                      
                      projectsToMigrate.forEach(p => {
                          batch.set(doc(db, 'projects', p.id), sanitizeProject(p, currentUser.uid), { merge: true });
                      });

                      Object.values(localNotes).forEach(n => {
                          if (projectsToMigrate.some(p => p.id === n.projectId)) {
                              batch.set(doc(db, 'notes', n.id), sanitizeNote(n, currentUser.uid), { merge: true });
                          }
                      });

                      localCategories.forEach(c => {
                          if (!(c as any).userId) {
                              batch.set(doc(db, 'categories', c.id), sanitizeCategory(c, currentUser.uid), { merge: true });
                          }
                      });

                      await batch.commit();
                      console.log("Migrated local data to Firebase for user:", currentUser.uid);
                  }
              }
          } catch (error: any) {
              console.error("Error checking/creating user document or migrating data:", error);
              setAlertMessage(`An error occurred while setting up account data: ${error.message || error}`);
          }
      } else {
          // Clear local state on logout
          setProjects([]);
          setNotes({});
          setCategories([]);
          setCurrentProjectId(null);
          
          // Load local data for logged-out state
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
              try {
                  const parsed: StoredData = JSON.parse(saved);
                  const localProjects = parsed.projects || [];
                  const localNotes = parsed.notes || {};
                  const localCategories = parsed.categories || [];
                  
                  // Only show projects that were created offline (no userId)
                  const offlineProjects = localProjects.filter(p => !(p as any).userId);
                  setProjects(offlineProjects);
                  
                  const offlineNotes: Record<string, Note> = {};
                  Object.values(localNotes).forEach(n => {
                      if (offlineProjects.some(p => p.id === n.projectId)) {
                          offlineNotes[n.id] = n;
                      }
                  });
                  setNotes(offlineNotes);
                  
                  const offlineCategories = localCategories.filter(c => !(c as any).userId);
                  setCategories(offlineCategories);
                  
                  if (offlineProjects.length > 0) {
                      setCurrentProjectId(offlineProjects[0].id);
                  }
              } catch (e) {
                  console.error("Failed to load local data on logout", e);
              }
          }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
      try {
          await signInWithGoogle();
      } catch (error: any) {
          console.error("Login error:", error);
          setAlertMessage(`An error occurred during login: ${error.message || error}`);
      }
  };

  const handleLogout = async () => {
      try {
          await logOut();
      } catch (error) {
          setAlertMessage("An error occurred during logout.");
      }
  };
  
  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isExportingMarkdown, setIsExportingMarkdown] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
      if (e.key === 'Escape' && isCommandPaletteOpen) {
        setIsCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCommandPaletteOpen]);

  // Real-time sync from Firebase: Projects and Categories
  useEffect(() => {
    if (!user || !isAuthReady) return;

    // Listen to Projects
    const projectsQuery = query(collection(db, 'projects'), or(where('userId', '==', user.uid), where('collaborators', 'array-contains', user.uid)));
    const unsubscribeProjects = onSnapshot(projectsQuery, (snapshot) => {
      const loadedProjects = snapshot.docs.map(doc => doc.data() as Project);
      // Sort projects by createdAt descending to maintain order
      loadedProjects.sort((a, b) => b.createdAt - a.createdAt);
      setProjects(loadedProjects);
      
      // If no project is selected and we have projects, select the first one
      if (loadedProjects.length > 0 && !currentProjectIdRef.current) {
          setCurrentProjectId(loadedProjects[0].id);
      }
    }, (error) => {
      console.error("Error listening to projects:", error);
    });

    // Listen to Categories
    const categoriesQuery = query(collection(db, 'categories'), where('userId', '==', user.uid));
    const unsubscribeCategories = onSnapshot(categoriesQuery, (snapshot) => {
      const loadedCategories = snapshot.docs.map(doc => doc.data() as Category);
      setCategories(loadedCategories);
    }, (error) => {
      console.error("Error listening to categories:", error);
    });

    return () => {
      unsubscribeProjects();
      unsubscribeCategories();
    };
  }, [user, isAuthReady]);

  // Real-time sync from Firebase: Notes (depends on projects list for collaboration)
  useEffect(() => {
    if (!user || !isAuthReady) return;

    // Listen to Notes - Note syncing logic updated to allow shared notes
    // We listen to notes where we are the owner or that belong to one of our projects
    const projectIds = projects.map(p => p.id);
    let notesQuery;
    
    if (projectIds.length > 0) {
        // Handle potential query limit (30 items for 'in' operator)
        const projectIdsChunk = projectIds.slice(0, 30);
        notesQuery = query(
            collection(db, 'notes'), 
            or(
                where('userId', '==', user.uid),
                where('projectId', 'in', projectIdsChunk)
            )
        );
    } else {
        notesQuery = query(collection(db, 'notes'), where('userId', '==', user.uid));
    }

    const unsubscribeNotes = onSnapshot(notesQuery, (snapshot) => {
      const loadedNotes: Record<string, Note> = {};
      snapshot.docs.forEach(doc => {
        loadedNotes[doc.id] = doc.data() as Note;
      });
      setNotes(loadedNotes);
    }, (error) => {
      console.error("Error listening to notes:", error);
    });

    return () => unsubscribeNotes();
  }, [user, isAuthReady, projects]);

  // Save to LocalStorage on change (debounced) - Only for offline data
  useEffect(() => {
    if (user) return; // Don't spam localStorage if logged in (Firebase is primary)

    const timeoutId = setTimeout(() => {
      // Filter out online projects to avoid hitting 5MB limit
      const offlineProjects = projects.filter(p => !(p as any).userId);
      const offlineNotes: Record<string, Note> = {};
      Object.values(notes).forEach(n => {
          if (offlineProjects.some(p => p.id === n.projectId)) {
              offlineNotes[n.id] = n;
          }
      });
      const offlineCategories = categories.filter(c => !(c as any).userId);

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ 
          projects: offlineProjects, 
          notes: offlineNotes, 
          categories: offlineCategories 
      }));
    }, 2000); // Increased debounce to 2 seconds
    return () => clearTimeout(timeoutId);
  }, [projects, notes, categories, user]);

  const notesEndRef = useRef<HTMLDivElement>(null);

  // Scroll logic
  useEffect(() => {
    if (isPlanning && notesEndRef.current) {
         notesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [notes, isPlanning]);

  const handleBoostPrompt = async () => {
    if (!prompt.trim() || isBoosting) return;
    setIsBoosting(true);
    try {
      const boostedText = await boostPrompt(prompt);
      setPrompt(boostedText);
    } catch (error) {
      console.error("Prompt boost error:", error);
      setAlertMessage("An error occurred while improving the text.");
    } finally {
      setIsBoosting(false);
    }
  };

  const handleCreateProject = async () => {
    if (!prompt.trim()) return;

    setIsPlanning(true);
    const projectId = crypto.randomUUID();
    const rootNoteId = crypto.randomUUID();
    
    try {
      // 0. Fetch Memories for context
      const memories: StyleMemory[] = projects
        .filter(p => p.summary)
        .slice(0, 5)
        .map(p => ({
          id: p.id,
          userId: user?.uid || 'guest',
          projectName: p.title,
          styleKeywords: [], // we could extract these but summary is enough for now
          summary: p.summary!,
          timestamp: p.createdAt
        }));

      // 1. Plan the project structure
      const plan = await createProjectPlan(prompt, memories);
      
      const timestamp = Date.now();
      const projectTitle = plan.title.substring(0, 100) || 'New Project';

      // 2. Create Root Note (The Cover Page)
      const rootNote: Note = {
        id: rootNoteId,
        projectId,
        parentId: null,
        title: projectTitle,
        content: `**Project Summary:** ${plan.summary}\n\nThis notebook contains all the necessary steps to bring your project to life. You can progress by following the steps below.`.substring(0, 1000000),
        type: NoteType.ROOT,
        status: GenerationStatus.COMPLETED,
        children: [],
        timestamp,
      };

      const newNotes: Record<string, Note> = { [rootNoteId]: rootNote };
      const childIds: string[] = [];

      // 3. Create Placeholder Child Notes (The Menu)
      plan.steps.forEach((step) => {
        const stepId = crypto.randomUUID();
        childIds.push(stepId);

        let nType = NoteType.TEXT;
        if (step.type === 'code') nType = NoteType.CODE;
        if (step.type === 'image') nType = NoteType.IMAGE;

        newNotes[stepId] = {
          id: stepId,
          projectId,
          parentId: rootNoteId,
          title: step.title.substring(0, 200) || 'New Step',
          content: step.description.substring(0, 1000000) || 'No description.', // Initially show description as preview
          type: nType,
          status: GenerationStatus.IDLE, // Waiting to be generated
          children: [],
          timestamp: timestamp + 1,
          agentRole: step.agentRole,
          assignedAgent: step.assignedAgent,
        };
      });

      newNotes[rootNoteId].children = childIds;

      setNotes((prev) => ({ ...prev, ...newNotes }));
      
      const newProject: Project = {
        id: projectId,
        title: projectTitle,
        summary: plan.summary,
        originalPrompt: prompt,
        rootNoteId,
        createdAt: timestamp,
        creatorId: user?.uid || 'guest',
        creatorEmail: user?.email || '',
        collaborators: []
      };
      
      setProjects((prev) => [newProject, ...prev]);
      setCurrentProjectId(projectId);
      setPrompt('');
      setIsPlanning(false);

      if (user) {
        try {
          const batch = writeBatch(db);
          batch.set(doc(db, 'projects', projectId), sanitizeProject(newProject, user.uid), { merge: true });
          
          Object.values(newNotes as Record<string, Note>).forEach(note => {
            batch.set(doc(db, 'notes', note.id), sanitizeNote(note, user.uid), { merge: true });
          });
          
          await batch.commit();
        } catch (error) {
          console.error("Error creating project in Firebase:", error);
        }
      }

      // 4. Trigger Content Generation for Children sequentially
      await generateChildrenContent(plan.title, plan.steps, childIds, newNotes);

    } catch (error) {
      console.error(error);
      setAlertMessage("An error occurred while creating the plan. Please try again.");
      setIsPlanning(false);
    }
  };

  const generateChildrenContent = async (
    projectTitle: string, 
    steps: any[], 
    nodeIds: string[],
    initialNotes: Record<string, Note>
  ) => {
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const noteId = nodeIds[i];
        
        // Skip if already generated (useful if restarting logic)
        // Use notesRef to get the most up-to-date state
        if (notesRef.current[noteId]?.status === GenerationStatus.COMPLETED) continue;

        const noteType = initialNotes[noteId]?.type || NoteType.TEXT;
        await regenerateNote(noteId, projectTitle, step.title, step.description, noteType);
    }
  };

  const regenerateNote = async (
      noteId: string, 
      projectTitle: string, 
      stepTitle: string, 
      stepDescription: string,
      type: NoteType
  ) => {
      setNotes((prev) => {
          if (!prev[noteId]) return prev;
          return {
              ...prev,
              [noteId]: { ...prev[noteId], status: GenerationStatus.GENERATING }
          };
      });

      if (user) {
          const currentNote = notesRef.current[noteId];
          if (currentNote) {
              setDoc(doc(db, 'notes', noteId), sanitizeNote({ ...currentNote, status: GenerationStatus.GENERATING }, user.uid), { merge: true }).catch(console.error);
          }
      }

      const project = projectsRef.current.find(p => p.id === currentProjectIdRef.current);
      const memories: StyleMemory[] = projects
        .filter(p => p.summary)
        .slice(0, 5)
        .map(p => ({
          id: p.id,
          userId: user?.uid || 'guest',
          projectName: p.title,
          styleKeywords: [],
          summary: p.summary!,
          timestamp: p.createdAt
        }));

      try {
          const content = await generateStepContent(projectTitle, stepTitle, stepDescription, type, memories);
          
          if (user) {
              const currentNote = notesRef.current[noteId];
              if (currentNote) {
                  setDoc(doc(db, 'notes', noteId), sanitizeNote({ ...currentNote, content, status: GenerationStatus.COMPLETED }, user.uid), { merge: true }).catch(console.error);
              }
          }

          setNotes((prev) => {
              if (!prev[noteId]) return prev;
              return {
                  ...prev,
                  [noteId]: { 
                      ...prev[noteId], 
                      content, 
                      status: GenerationStatus.COMPLETED 
                  }
              };
          });
      } catch (error) {
          if (user) {
              const currentNote = notesRef.current[noteId];
              if (currentNote) {
                  setDoc(doc(db, 'notes', noteId), sanitizeNote({ ...currentNote, status: GenerationStatus.ERROR }, user.uid), { merge: true }).catch(console.error);
              }
          }

          setNotes((prev) => {
              if (!prev[noteId]) return prev;
              return {
                  ...prev,
                  [noteId]: { 
                      ...prev[noteId], 
                      status: GenerationStatus.ERROR 
                  }
              };
          });
      }
  }

  const handleRetryNote = React.useCallback(async (noteId: string) => {
      const note = notesRef.current[noteId];
      if (!note || !currentProjectIdRef.current) return;
      const project = projectsRef.current.find(p => p.id === currentProjectIdRef.current);
      if(!project) return;
      
      await regenerateNote(noteId, project.title, note.title, note.title, note.type);
  }, []);

  const handleExportProject = React.useCallback(async () => {
      if(!currentProjectId) return;
      setIsExportingMarkdown(true);
      try {
          const project = projects.find(p => p.id === currentProjectId);
          if(!project) return;
          
          const rootNote = notes[project.rootNoteId];
          if(!rootNote) return;

          const category = categories.find(c => c.id === project.categoryId);
          let markdownContent = `---\ntitle: ${project.title}\ncreated: ${new Date(project.createdAt).toISOString()}\nauthor: ${project.creatorEmail || 'Mind Notebook User'}\ncategory: ${category ? category.name : 'General'}\ntags: [mind-notebook, project${category ? `, ${category.name.toLowerCase()}` : ''}]\n---\n\n# ${project.title}\n\n`;
          
          if (project.summary) {
              markdownContent += `> **Project Summary:** ${project.summary}\n\n`;
              markdownContent += `--- \n\n`;
          }
          
          const processNote = (noteId: string, level: number): string => {
              const note = notes[noteId];
              if (!note || note.status !== GenerationStatus.COMPLETED) return "";
              
              let content = "";
              const prefix = "#".repeat(Math.min(level + 1, 6)); // Max 6 levels for Markdown headers
              content += `${prefix} ${note.title}\n\n`;
              
              if (note.type === NoteType.IMAGE) {
                  content += `![${note.title}](Image data left as link to avoid large file size)\n\n`;
              } else {
                  content += `${note.content}\n\n`;
              }
              
              if (note.tags && note.tags.length > 0) {
                  content += `**Tags:** ${note.tags.map(t => `\`${t}\``).join(', ')}\n\n`;
              }

              if (note.attachments && note.attachments.length > 0) {
                  content += `**Attachments:** ${note.attachments.map(a => `[${a.name}](${a.url.startsWith('data:') ? 'Base64 Data' : a.url})`).join(', ')}\n\n`;
              }
              
              content += `---\n\n`;
              
              if (note.children && note.children.length > 0) {
                  note.children.forEach(childId => {
                      content += processNote(childId, level + 1);
                  });
              }
              
              return content;
          };

          // Start processing from the root note, but we already added the project title as H1
          // So we start root note as H2 or just its content if it's the "Cover"
          markdownContent += processNote(project.rootNoteId, 1);

          const blob = new Blob([markdownContent], { type: 'text/markdown' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${project.title.replace(/\s+/g, '_')}.md`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
      } catch (error) {
          console.error("Export failed:", error);
          setAlertMessage("An error occurred during export.");
      } finally {
          setIsExportingMarkdown(false);
      }
  }, [currentProjectId, projects, notes]);

  const handleTranscription = async (base64Audio: string) => {
    setIsTranscribing(true);
    try {
        const text = await transcribeAudio(base64Audio);
        if (text.trim()) {
            setPrompt(prev => prev ? prev + " " + text : text);
        }
    } catch (error) {
        console.error("Transcription error:", error);
        setAlertMessage("An error occurred during transcription.");
    } finally {
        setIsTranscribing(false);
    }
  };

  const saveTemplate = () => {
    if (!newTemplate.name || !newTemplate.prompt) return;
    const template: AITemplate = {
        id: Date.now().toString(),
        ...newTemplate
    };
    const updated = [...aiTemplates, template];
    setAiTemplates(updated);
    localStorage.setItem('ai_templates', JSON.stringify(updated));
    setNewTemplate({ name: '', prompt: '', icon: '🤖' });
  };

  const deleteTemplate = (id: string) => {
    const updated = aiTemplates.filter(t => t.id !== id);
    setAiTemplates(updated);
    localStorage.setItem('ai_templates', JSON.stringify(updated));
  };

  const handleShareProject = async () => {
    if (!currentProjectId || !shareEmail.trim()) return;
    setIsSharing(true);
    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', shareEmail.trim().toLowerCase()));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            setAlertMessage('No user found with this email address.');
            setIsSharing(false);
            return;
        }
        
        const targetUserDoc = snapshot.docs[0];
        const targetUserId = targetUserDoc.id;
        const project = projects.find(p => p.id === currentProjectId);
        if (!project) return;
        
        if (project.creatorId !== user?.uid) {
            setAlertMessage('Only the project owner can share.');
            setIsSharing(false);
            return;
        }

        const updatedCollaborators = Array.from(new Set([...(project.collaborators || []), targetUserId]));
        
        await setDoc(doc(db, 'projects', currentProjectId), { 
            collaborators: updatedCollaborators 
        }, { merge: true });
        
        setAlertMessage(`${shareEmail} successfully added to the project!`);
        setShareEmail('');
        setShowShareModal(false);
    } catch (error) {
        console.error("Sharing error:", error);
        setAlertMessage('An error occurred during sharing.');
    } finally {
        setIsSharing(false);
    }
  };

  const handleExportPDF = async () => {
    if(!currentProjectId) return;
    const project = projects.find(p => p.id === currentProjectId);
    if(!project) return;

    const element = document.getElementById('project-content');
    if (!element) return;

    setIsExportingPDF(true);

    element.classList.add('pdf-export-mode');
    const style = document.createElement('style');
    style.innerHTML = `
      .pdf-export-mode .hide-in-pdf {
        display: none !important;
      }
      .pdf-export-mode pre {
        white-space: pre-wrap !important;
        word-break: break-word !important;
        overflow-x: hidden !important;
        border-radius: 4px !important;
      }
      .pdf-export-mode .break-inside-avoid {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        margin-bottom: 24px !important;
      }
      .pdf-export-mode {
        padding: 20px !important;
        background-color: #0b1120 !important;
      }
    `;
    document.head.appendChild(style);

    const opt: any = {
      margin:       15,
      filename:     `${project.title.replace(/\s+/g, '_')}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#0b1120', windowWidth: 1024 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak:    { mode: ['css', 'legacy'] }
    };

    try {
      await html2pdf().set(opt).from(element).save();
    } catch (error) {
      console.error("PDF Export failed:", error);
      setAlertMessage("An error occurred during PDF export.");
    } finally {
      element.classList.remove('pdf-export-mode');
      document.head.removeChild(style);
      setIsExportingPDF(false);
    }
  };

  const handleExportHTML = React.useCallback(() => {
    if(!currentProjectId) return;
    const project = projects.find(p => p.id === currentProjectId);
    if(!project) return;

    const element = document.getElementById('project-content');
    if (!element) return;

    // Clone the element to remove hide-in-pdf elements
    const clone = element.cloneNode(true) as HTMLElement;
    const hiddenElements = clone.querySelectorAll('.hide-in-pdf');
    hiddenElements.forEach(el => el.remove());

    // Get all styles
    let styles = '';
    for (let i = 0; i < document.styleSheets.length; i++) {
        try {
            const sheet = document.styleSheets[i];
            if (sheet.cssRules) {
                for (let j = 0; j < sheet.cssRules.length; j++) {
                    styles += sheet.cssRules[j].cssText + '\n';
                }
            }
        } catch (e) {
            console.warn("Could not read stylesheet", e);
        }
    }

    const htmlContent = `
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${project.title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        slate: {
                            800: '#1e293b',
                            900: '#0f172a',
                            950: '#020617',
                        }
                    }
                }
            }
        }
    </script>
    <style>
        ${styles}
        body { background-color: #020617; color: #f8fafc; padding: 2rem; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"; }
        .prose { max-width: 65ch; }
        .markdown-body { color: #cbd5e1; }
        .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4 { color: #f8fafc; }
        .markdown-body p { margin-bottom: 1rem; }
        .markdown-body ul { list-style-type: disc; padding-left: 1.5rem; margin-bottom: 1rem; }
        .markdown-body ol { list-style-type: decimal; padding-left: 1.5rem; margin-bottom: 1rem; }
        .markdown-body pre { background-color: #0d1117; padding: 1rem; border-radius: 0.375rem; overflow-x: auto; margin-bottom: 1rem; }
        .markdown-body code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
        .markdown-body img { max-width: 100%; height: auto; border-radius: 0.5rem; }
        .markdown-body blockquote { border-left-width: 4px; border-color: #6366f1; padding-left: 1rem; font-style: italic; color: #94a3b8; margin-bottom: 1rem; }
        .markdown-body hr { border-color: #334155; margin-top: 1.5rem; margin-bottom: 1.5rem; }
        .markdown-body a { color: #818cf8; text-decoration: underline; }
        .cursor-grab { cursor: default; }
    </style>
</head>
<body class="bg-slate-950 text-slate-200">
    <div class="max-w-4xl mx-auto">
        ${clone.innerHTML}
    </div>
</body>
</html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title.replace(/\s+/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [currentProjectId, projects]);

  const handleRegenerateImage = React.useCallback(async (noteId: string, feedback: string) => {
    const note = notesRef.current[noteId];
    if (!note || !currentProjectIdRef.current) return;
    const project = projectsRef.current.find(p => p.id === currentProjectIdRef.current);
    if(!project) return;

    setNotes((prev) => ({
        ...prev,
        [noteId]: { ...prev[noteId], status: GenerationStatus.GENERATING }
    }));

    try {
        const prompt = feedback ? `${note.title} (Feedback: ${feedback})` : note.title;
        const content = await generateStepContent(project.title, note.title, prompt, NoteType.IMAGE);
        
        const newNotes = {
            ...notesRef.current,
            [noteId]: { 
                ...notesRef.current[noteId], 
                content, 
                status: GenerationStatus.COMPLETED 
            }
        };
        
        setNotes(newNotes);
        
        if (user) {
            setDoc(doc(db, 'notes', noteId), sanitizeNote(newNotes[noteId], user.uid), { merge: true }).catch(console.error);
        }
    } catch (error) {
        const newNotes = {
            ...notesRef.current,
            [noteId]: { 
                ...notesRef.current[noteId], 
                status: GenerationStatus.ERROR 
            }
        };
        
        setNotes(newNotes);
        
        if (user) {
            setDoc(doc(db, 'notes', noteId), sanitizeNote(newNotes[noteId], user.uid), { merge: true }).catch(console.error);
        }
    }
  }, [user]);

  const handleAddAttachment = React.useCallback((noteId: string, attachment: Attachment) => {
    const note = notesRef.current[noteId];
    if (!note) return;
    
    const newNotes = {
      ...notesRef.current,
      [noteId]: {
        ...note,
        attachments: [...(note.attachments || []), attachment]
      }
    };
    
    setNotes(newNotes);
    
    if (user) {
        setDoc(doc(db, 'notes', noteId), sanitizeNote(newNotes[noteId], user.uid), { merge: true }).catch(console.error);
    }
  }, [user]);

  const handleRemoveAttachment = React.useCallback((noteId: string, attachmentId: string) => {
    const note = notesRef.current[noteId];
    if (!note) return;
    
    const newNotes = {
      ...notesRef.current,
      [noteId]: {
        ...note,
        attachments: (note.attachments || []).filter(a => a.id !== attachmentId)
      }
    };
    
    setNotes(newNotes);
    
    if (user) {
        setDoc(doc(db, 'notes', noteId), sanitizeNote(newNotes[noteId], user.uid), { merge: true }).catch(console.error);
    }
  }, [user]);

  const handleUpdateNote = React.useCallback((noteId: string, updates: Partial<Note> | string) => {
    const currentNote = notesRef.current[noteId];
    if (!currentNote) return;

    const newNotes = { ...notesRef.current };
    
    let newContent = typeof updates === 'string' ? updates : (updates.content ?? currentNote.content);
    
    // Parse for [[Note Title]]
    const linkRegex = /\[\[(.*?)\]\]/g;
    const matches = [...newContent.matchAll(linkRegex)].map(m => m[1]);
    
    const newLinkedIds = new Set(currentNote.linkedNoteIds || []);
    
    // Find matching notes in the same project
    Object.values(newNotes as Record<string, Note>).forEach(n => {
      if (n.projectId === currentNote.projectId && n.id !== noteId) {
        if (matches.includes(n.title)) {
          newLinkedIds.add(n.id);
          // Add backlink
          newNotes[n.id] = {
            ...n,
            linkedNoteIds: Array.from(new Set([...(n.linkedNoteIds || []), noteId]))
          };
        }
      }
    });

    const updatedFields = typeof updates === 'string' ? { content: updates } : updates;

    newNotes[noteId] = { 
      ...currentNote, 
      ...updatedFields,
      linkedNoteIds: Array.from(newLinkedIds)
    };

    setNotes(newNotes);

    if (user) {
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'notes', noteId), sanitizeNote(newNotes[noteId], user.uid), { merge: true });
        
        // Update backlinks in Firebase
        Object.values(newNotes as Record<string, Note>).forEach(n => {
          if (n.projectId === currentNote.projectId && n.id !== noteId && matches.includes(n.title)) {
            batch.set(doc(db, 'notes', n.id), sanitizeNote(newNotes[n.id], user.uid), { merge: true });
          }
        });
        
        batch.commit().catch(console.error);
      } catch (error) {
        console.error("Error updating note in Firebase:", error);
      }
    }
  }, [user]);

  const handleAddTag = React.useCallback((noteId: string, tag: string) => {
    if (!tag || !tag.trim()) return;
    const note = notesRef.current[noteId];
    if (!note) return;
    
    const newNotes = {
      ...notesRef.current,
      [noteId]: {
        ...note,
        tags: Array.from(new Set([...(note.tags || []), tag.trim().toLowerCase()]))
      }
    };
    
    setNotes(newNotes);
    
    if (user) {
        setDoc(doc(db, 'notes', noteId), sanitizeNote(newNotes[noteId], user.uid), { merge: true }).catch(console.error);
    }
  }, [user]);

  const handleRemoveTag = React.useCallback((noteId: string, tag: string) => {
    const note = notesRef.current[noteId];
    if (!note) return;
    
    const newNotes = {
      ...notesRef.current,
      [noteId]: {
        ...note,
        tags: (note.tags || []).filter(t => t !== tag)
      }
    };
    
    setNotes(newNotes);
    
    if (user) {
        setDoc(doc(db, 'notes', noteId), sanitizeNote(newNotes[noteId], user.uid), { merge: true }).catch(console.error);
    }
  }, [user]);

  const handleDeleteNote = React.useCallback((noteId: string) => {
    const note = notesRef.current[noteId];
    if (!note) return;

    let parentToUpdate: Note | null = null;
    let linkedNotesToUpdate: Note[] = [];

    const newNotes = { ...notesRef.current };
    
    if (note.parentId) {
      const parent = newNotes[note.parentId];
      if (parent) {
        newNotes[note.parentId] = {
          ...parent,
          children: parent.children.filter(id => id !== noteId)
        };
        parentToUpdate = newNotes[note.parentId];
      }
    } else {
      // Fallback for older data without parentId
      const project = projectsRef.current.find(p => p.id === note.projectId);
      if (project) {
        const rootNote = newNotes[project.rootNoteId];
        if (rootNote && rootNote.children.includes(noteId)) {
          newNotes[project.rootNoteId] = {
            ...rootNote,
            children: rootNote.children.filter(id => id !== noteId)
          };
          parentToUpdate = newNotes[project.rootNoteId];
        }
      }
    }
    
    // Clean up backlinks to prevent memory leaks and dangling references
    Object.keys(newNotes).forEach(id => {
        const n = newNotes[id];
        if (n.linkedNoteIds && n.linkedNoteIds.includes(noteId)) {
            newNotes[id] = {
                ...n,
                linkedNoteIds: n.linkedNoteIds.filter(linkedId => linkedId !== noteId)
            };
            linkedNotesToUpdate.push(newNotes[id]);
        }
    });

    delete newNotes[noteId];
    setNotes(newNotes);

    // Immediate local storage sync for guest users
    if (!user) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ 
            projects, 
            notes: newNotes, 
            categories 
        }));
    }

    if (user) {
      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'notes', noteId));
        
        if (parentToUpdate) {
            batch.set(doc(db, 'notes', parentToUpdate.id), { ...parentToUpdate, userId: user.uid }, { merge: true });
        }
        
        linkedNotesToUpdate.forEach(n => {
            batch.set(doc(db, 'notes', n.id), { ...n, userId: user.uid }, { merge: true });
        });
        
        batch.commit().catch(console.error);
      } catch (error) {
        console.error("Error deleting note from Firebase:", error);
      }
    }
  }, [user, projects, categories]);

  const handleNavigateToNote = React.useCallback((noteId: string) => {
    const element = document.getElementById(`note-${noteId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('ring-4', 'ring-indigo-500', 'transition-all', 'duration-500');
      setTimeout(() => {
        element.classList.remove('ring-4', 'ring-indigo-500');
      }, 2000);
    }
  }, []);

  const getNoteTitle = React.useCallback((noteId: string) => {
    return notesRef.current[noteId]?.title || '';
  }, []);

  const handleAddNoteToProject = () => {
    if (!currentProjectId) return;
    const project = projects.find(p => p.id === currentProjectId);
    if (!project) return;
    const rootNote = notesRef.current[project.rootNoteId];
    if (!rootNote) return;

    const newNoteId = crypto.randomUUID();
    const newNote: Note = {
      id: newNoteId,
      projectId: currentProjectId,
      parentId: project.rootNoteId,
      title: 'New Note',
      content: 'Write your note here...',
      type: NoteType.TEXT,
      status: GenerationStatus.COMPLETED,
      children: [],
      timestamp: Date.now(),
    };

    const newNotes = {
      ...notesRef.current,
      [project.rootNoteId]: {
        ...notesRef.current[project.rootNoteId],
        children: [...(notesRef.current[project.rootNoteId].children || []), newNoteId]
      },
      [newNoteId]: newNote
    };
    
    setNotes(newNotes);
    
    if (user) {
        try {
            const batch = writeBatch(db);
            batch.set(doc(db, 'notes', project.rootNoteId), { ...newNotes[project.rootNoteId], userId: user.uid }, { merge: true });
            batch.set(doc(db, 'notes', newNoteId), { ...newNotes[newNoteId], userId: user.uid }, { merge: true });
            batch.commit().catch(console.error);
        } catch (error) {
            console.error("Error adding note to project in Firebase:", error);
        }
    }
  };

  const handleGenerateNewStep = async () => {
    if (!prompt.trim() || !currentProjectId) return;
    
    setIsPlanning(true);
    const project = projects.find(p => p.id === currentProjectId);
    if (!project) return;
    const rootNote = notes[project.rootNoteId];
    if (!rootNote) return;

    try {
      const newNoteId = crypto.randomUUID();
      const newNote: Note = {
        id: newNoteId,
        projectId: currentProjectId,
        parentId: project.rootNoteId,
        title: prompt.substring(0, 200) || 'New Step',
        content: '',
        type: NoteType.TEXT,
        status: GenerationStatus.GENERATING,
        children: [],
        timestamp: Date.now(),
      };

      const newNotes = {
        ...notesRef.current,
        [project.rootNoteId]: {
          ...notesRef.current[project.rootNoteId],
          children: [...(notesRef.current[project.rootNoteId].children || []), newNoteId]
        },
        [newNoteId]: newNote
      };

      setNotes(newNotes);
      
      if (user) {
          try {
              const batch = writeBatch(db);
              batch.set(doc(db, 'notes', project.rootNoteId), sanitizeNote(newNotes[project.rootNoteId], user.uid), { merge: true });
              batch.set(doc(db, 'notes', newNoteId), sanitizeNote(newNotes[newNoteId], user.uid), { merge: true });
              await batch.commit();
          } catch (error) {
              console.error("Error updating notes in Firebase:", error);
          }
      }

      const currentPrompt = prompt;
      setPrompt('');
      setIsPlanning(false);

      const content = await generateStepContent(project.title, currentPrompt, currentPrompt, NoteType.TEXT);
      
      const finalNotes = {
        ...notesRef.current,
        [newNoteId]: {
          ...notesRef.current[newNoteId],
          content,
          status: GenerationStatus.COMPLETED
        }
      };
      
      setNotes(finalNotes);

      if (user) {
          setDoc(doc(db, 'notes', newNoteId), sanitizeNote(finalNotes[newNoteId], user.uid), { merge: true }).catch(console.error);
      }

    } catch (error) {
      console.error(error);
      setAlertMessage("An error occurred while creating the step.");
      setIsPlanning(false);
    }
  };

  const handleDragEnd = React.useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !currentProjectId) return;

    const project = projects.find(p => p.id === currentProjectId);
    if (!project) return;

    const rootNote = notesRef.current[project.rootNoteId];
    if (!rootNote) return;

    const oldIndex = rootNote.children.indexOf(active.id as string);
    const newIndex = rootNote.children.indexOf(over.id as string);

    const newChildrenOrder = arrayMove(rootNote.children, oldIndex, newIndex);

    const newNotes = {
      ...notesRef.current,
      [project.rootNoteId]: {
        ...notesRef.current[project.rootNoteId],
        children: newChildrenOrder
      }
    };
    
    setNotes(newNotes);
    
    if (user) {
        setDoc(doc(db, 'notes', project.rootNoteId), sanitizeNote(newNotes[project.rootNoteId], user.uid), { merge: true }).catch(console.error);
    }
  }, [currentProjectId, projects, user]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDeleteProject = React.useCallback((e: React.MouseEvent | React.PointerEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      setProjectToDelete(id);
  }, []);

  const confirmDeleteProject = React.useCallback(async () => {
      if (!projectToDelete) return;
      
      const updatedProjects = projects.filter(p => p.id !== projectToDelete);
      setProjects(updatedProjects);
      if(currentProjectId === projectToDelete) setCurrentProjectId(null);
      
      // Cleanup notes associated with the deleted project to prevent memory leaks
      const newNotes = { ...notesRef.current };
      Object.keys(newNotes).forEach(noteId => {
          if (newNotes[noteId].projectId === projectToDelete) {
              delete newNotes[noteId];
          }
      });
      setNotes(newNotes);

      // Immediate local storage sync for guest users
      if (!user) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ 
              projects: updatedProjects, 
              notes: newNotes, 
              categories 
          }));
      }

      // Delete from Firebase
      if (user) {
        try {
          const batch = writeBatch(db);
          batch.delete(doc(db, 'projects', projectToDelete));
          
          Object.keys(notesRef.current).forEach(noteId => {
            if (notesRef.current[noteId].projectId === projectToDelete) {
              batch.delete(doc(db, 'notes', noteId));
            }
          });
          
          await batch.commit();
        } catch (error) {
          console.error("Error deleting project from Firebase:", error);
        }
      }
      
      setProjectToDelete(null);
  }, [projectToDelete, currentProjectId, user, projects, categories]);

  const cancelDeleteProject = React.useCallback(() => {
      setProjectToDelete(null);
  }, []);

  const [showFeedbackModal, setShowFeedbackModal] = React.useState(false);
  const [feedbackText, setFeedbackText] = React.useState('');

  const handleFeedbackSubmit = () => {
    if (!feedbackText.trim()) return;
    
    // Save to local storage
    const existingFeedback = JSON.parse(localStorage.getItem('mindspark_feedback') || '[]');
    const newFeedback = {
        id: crypto.randomUUID(),
        text: feedbackText,
        date: new Date().toISOString()
    };
    localStorage.setItem('mindspark_feedback', JSON.stringify([...existingFeedback, newFeedback]));
    
    console.log('Feedback submitted:', newFeedback);
    
    setFeedbackText('');
    setShowFeedbackModal(false);
    setAlertMessage('Your feedback has been saved successfully. Thank you!');
  };

  const renderSearchResults = () => {
    const query = searchQuery.toLowerCase();
    const matchingNotes = Object.values(notes as Record<string, Note>).filter(note => 
      note.title.toLowerCase().includes(query) || 
      note.content.toLowerCase().includes(query) ||
      (note.tags && note.tags.some(tag => tag.toLowerCase().includes(query)))
    );

    return (
      <div className="w-full max-w-4xl mx-auto pb-32">
        <h2 className="text-2xl font-bold mb-6 text-white">Search Results: "{searchQuery}"</h2>
        {matchingNotes.length === 0 ? (
          <p className="text-slate-400">No matching notes found.</p>
        ) : (
          <div className="space-y-6">
            {matchingNotes.map(note => {
              const project = projects.find(p => p.id === note.projectId);
              return (
                <div key={note.id} className="relative">
                  <div 
                    title={project?.title}
                    className="mb-2 text-xs text-indigo-400 font-medium truncate"
                  >
                    {project?.title || 'Unknown Notebook'} {note.type === NoteType.ROOT ? '(Main Note)' : ''}
                  </div>
                  <NoteCard 
                    note={note} 
                    isRoot={note.type === NoteType.ROOT}
                    onUpdate={handleUpdateNote}
                    onDelete={handleDeleteNote}
                    onAddAttachment={handleAddAttachment}
                    onRemoveAttachment={handleRemoveAttachment}
                    onAddTag={handleAddTag}
                    onRemoveTag={handleRemoveTag}
                    getNoteTitle={getNoteTitle}
                    onNavigateToNote={handleNavigateToNote}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderProjectNotes = () => {
    if (!currentProjectId) return null;
    const project = projects.find(p => p.id === currentProjectId);
    if (!project) return null;

    const rootNote = notes[project.rootNoteId];
    if (!rootNote) return null;

    return (
        <div id="project-content" className="w-full max-w-4xl mx-auto pb-48 pt-4">
             {/* Project Header & Controls */}
             <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 hide-in-pdf px-2">
                  {/* View Tabs */}
                  <div className="flex bg-slate-800/50 p-1 rounded-xl border border-white/5 w-fit">
                      <button 
                        onClick={() => setProjectView('content')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${projectView === 'content' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        Content
                      </button>
                      <button 
                        onClick={() => setProjectView('flowchart')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${projectView === 'flowchart' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        Flowchart
                      </button>
                  </div>

                  <div className="flex items-center gap-3">
                      {/* Project Category Selector */}
                      <select 
                          value={project.categoryId || ''}
                          className="bg-slate-800 text-slate-300 text-[10px] px-3 py-1.5 rounded-md border border-slate-700 focus:outline-none focus:border-indigo-500 font-bold uppercase tracking-wider"
                          onChange={(e) => {
                              const newCategoryId = e.target.value;
                              const newProjects = projects.map(p => {
                                  if (p.id === project.id) {
                                      const updated = { ...p };
                                      if (newCategoryId) {
                                          updated.categoryId = newCategoryId;
                                      } else {
                                          delete updated.categoryId;
                                      }
                                      return updated;
                                  }
                                  return p;
                              });
                              
                              setProjects(newProjects);
                              
                              if (user) {
                                  const updatedProject = newProjects.find(p => p.id === project.id);
                                  if (updatedProject) {
                                      const firestoreData: any = sanitizeProject(updatedProject, user.uid);
                                      if (!newCategoryId) {
                                          firestoreData.categoryId = deleteField();
                                      }
                                      setDoc(doc(db, 'projects', project.id), firestoreData, { merge: true }).catch(console.error);
                                  }
                              }
                          }}
                      >
                          <option value="">NO CATEGORY</option>
                          {categories.map(cat => (
                              <option key={cat.id} value={cat.id}>{cat.name.toUpperCase()}</option>
                          ))}
                      </select>

                      {/* Collaboration Avatars */}
                      <div className="flex -space-x-2">
                          <div className="w-7 h-7 rounded-full bg-indigo-500 border-2 border-slate-900 flex items-center justify-center text-[10px] text-white font-bold ring-2 ring-indigo-500/20" title={user?.email || ''}>
                              {user?.email?.[0].toUpperCase() || 'U'}
                          </div>
                          {project.collaborators?.map(cId => {
                              const profile = collaboratorProfiles[cId];
                              return (
                                  <div 
                                      key={cId} 
                                      className="w-7 h-7 rounded-full bg-slate-700 border-2 border-slate-900 flex items-center justify-center text-[10px] text-slate-300 font-bold overflow-hidden" 
                                      title={profile?.email || 'Participant'}
                                  >
                                      {profile?.photoURL ? (
                                          <img src={profile.photoURL} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                          (profile?.email?.[0] || '?').toUpperCase()
                                      )}
                                  </div>
                              );
                          })}
                          <button 
                            onClick={() => setShowShareModal(true)}
                            className="w-7 h-7 rounded-full bg-slate-800 border-2 border-slate-900 border-dashed flex items-center justify-center text-slate-400 hover:text-white hover:border-indigo-500 transition-colors" 
                            title="Invite"
                          >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                  <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
                              </svg>
                          </button>
                      </div>
                  </div>
             </div>

             {projectView === 'flowchart' ? (
                 <FlowchartView notes={notes} projectTitle={project.title} rootNoteId={project.rootNoteId} />
             ) : (
                 <>
                     {/* Root Note (Cover) */}
                     <div className="mb-8">
                {project.originalPrompt && (
                    <div className="mb-4 hide-in-pdf">
                        <button 
                            onClick={() => setShowOriginalPrompt(!showOriginalPrompt)}
                            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 transition-transform duration-300 ${showOriginalPrompt ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                            Original Prompt {showOriginalPrompt ? 'Hide' : 'Show'}
                        </button>
                        
                        <AnimatePresence>
                            {showOriginalPrompt && (
                                <motion.div 
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden mt-3"
                                >
                                    <div className="p-4 rounded-2xl bg-slate-800/50 border border-white/5 relative group">
                                        <p className="text-xs text-slate-400 leading-relaxed italic whitespace-pre-wrap">
                                            "{project.originalPrompt}"
                                        </p>
                                        <button 
                                            onClick={() => {
                                                navigator.clipboard.writeText(project.originalPrompt || '');
                                                setAlertMessage('Prompt copied to clipboard!');
                                            }}
                                            className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                                            title="Copy"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 110 4h-2M8 11h7m-7 4h7" />
                                            </svg>
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
                <NoteCard 
                    note={rootNote} 
                    isRoot={true} 
                    onExport={handleExportProject}
                    isExporting={isExportingMarkdown}
                    onUpdate={handleUpdateNote}
                    onAddAttachment={handleAddAttachment}
                    onRemoveAttachment={handleRemoveAttachment}
                    onAddTag={handleAddTag}
                    onRemoveTag={handleRemoveTag}
                    getNoteTitle={getNoteTitle}
                    onNavigateToNote={handleNavigateToNote}
                />
                <div className="mt-4 flex flex-wrap justify-end gap-2 hide-in-pdf">
                    <button 
                        onClick={handleExportProject}
                        disabled={isExportingMarkdown}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${isExportingMarkdown ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'}`}
                    >
                        {isExportingMarkdown ? (
                            <svg className="animate-spin h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                            </svg>
                        )}
                        {isExportingMarkdown ? 'Preparing Markdown...' : 'Download Markdown (.md)'}
                    </button>
                    <button 
                        onClick={handleExportHTML}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                        Download as HTML
                    </button>
                    <button 
                        onClick={handleExportPDF}
                        disabled={isExportingPDF}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${isExportingPDF ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'}`}
                    >
                        {isExportingPDF ? (
                            <svg className="animate-spin h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" />
                            </svg>
                        )}
                        {isExportingPDF ? 'Preparing PDF...' : 'Download as PDF'}
                    </button>
                </div>
             </div>

             {/* Children Notes (Steps) */}
             <DndContext 
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragEnd={handleDragEnd}
             >
                <SortableContext 
                    items={rootNote.children}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="space-y-8">
                        {rootNote.children.map((childId, index) => {
                            const note = notes[childId];
                            if(!note) return null;
                            return (
                                <SortableNote
                                    key={childId}
                                    childId={childId}
                                    index={index}
                                    note={note}
                                    onRetry={handleRetryNote}
                                    onUpdate={handleUpdateNote}
                                    onDelete={handleDeleteNote}
                                    onRegenerateImage={handleRegenerateImage}
                                    onAddAttachment={handleAddAttachment}
                                    onRemoveAttachment={handleRemoveAttachment}
                                    onAddTag={handleAddTag}
                                    onRemoveTag={handleRemoveTag}
                                    getNoteTitle={getNoteTitle}
                                    onNavigateToNote={handleNavigateToNote}
                                />
                            )
                        })}
                    </div>
                </SortableContext>
             </DndContext>
             <div className="mt-8 flex justify-center hide-in-pdf">
                 <button 
                     onClick={handleAddNoteToProject}
                     className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-700 border-dashed"
                 >
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                         <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                     </svg>
                     Add New Step
                 </button>
             </div>
             <div ref={notesEndRef} />
                 </>
             )}
        </div>
    );
  };

  return (
    <div className="flex h-screen bg-[#0B0F19] text-slate-100 overflow-hidden font-sans selection:bg-indigo-500/30">
      
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed md:static inset-y-0 left-0 z-50 w-72 glass-dark border-r border-white/5 flex flex-col shrink-0 transform transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-6 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 group cursor-pointer" onClick={() => { setCurrentProjectId(null); setPrompt(''); setSearchQuery(''); setIsMobileMenuOpen(false); }}>
                    <div className="w-11 h-11 bg-white rounded-2xl flex items-center justify-center shadow-lg shadow-white/10 group-hover:scale-110 transition-transform duration-500">
                        <svg className="w-6 h-6 text-[#0B0F19]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2L20 2v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                    </div>
                    <div>
                        <h1 className="text-lg font-black text-white tracking-tight leading-none">MindSpark</h1>
                        <p className="text-[9px] text-indigo-400/60 font-black uppercase tracking-[0.3em] mt-1">AI Workspace</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setIsSettingsModalOpen(true)}
                        className="p-2 rounded-xl transition-all duration-300 bg-white/5 text-slate-400 hover:bg-white/10"
                        title="Settings"
                    >
                        <Settings className="h-5 w-5" />
                    </button>
                    <button 
                        onClick={() => setIsCalendarView(!isCalendarView)}
                        className={`p-2 rounded-xl transition-all duration-300 bg-white/5 text-slate-400 hover:bg-white/10`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    </button>
                    {user ? (
                        <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        </button>
                    ) : (
                        <button onClick={handleLogin} className="p-2 text-indigo-400 hover:text-white hover:bg-indigo-500/10 rounded-xl transition-all">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        </button>
                    )}
                </div>
            </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-10">
            {/* Search */}
            <div className="relative group px-1">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
                <input 
                    type="text" 
                    placeholder="Search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#161B26] text-slate-200 text-xs pl-11 pr-4 py-3.5 rounded-2xl border border-white/5 focus:outline-none focus:border-indigo-500/30 transition-all font-medium"
                />
                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                    <kbd className="text-[10px] font-black text-slate-700 bg-white/5 px-2 py-1 rounded-lg border border-white/5">⌘ K</kbd>
                </div>
            </div>

            {/* Categories */}
            <div>
                <div className="flex items-center justify-between mb-6 px-2">
                    <div className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M4 6h16M4 12h16M4 18h16"></path></svg>
                        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Categories</h2>
                    </div>
                    <button 
                        onClick={() => setIsCreatingCategory(true)}
                        className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                </div>
                
                {isCreatingCategory && (
                    <div className="mb-6 p-5 bg-white/[0.03] rounded-[2rem] border border-white/5 space-y-4 animate-fadeIn relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none" />
                        <div className="relative z-10 space-y-3">
                            <h3 className="text-[9px] font-black text-indigo-400 uppercase tracking-widest px-1">New Category</h3>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={newCategoryName}
                                    onChange={(e) => setNewCategoryName(e.target.value)}
                                    placeholder="Collection name..."
                                    className="w-full bg-[#0B0F19] text-slate-200 text-xs p-3 rounded-xl border border-white/10 focus:border-indigo-500/50 focus:outline-none transition-all"
                                    onKeyDown={async (e) => {
                                        if (e.key === 'Enter' && newCategoryName.trim()) {
                                            const newCategory = { id: crypto.randomUUID(), name: newCategoryName.trim(), color: (document.getElementById('cat-color') as HTMLInputElement)?.value || '#6366f1' };
                                            setCategories(prev => [...prev, newCategory]);
                                            if (user) {
                                                try {
                                                    await setDoc(doc(db, 'categories', newCategory.id), sanitizeCategory(newCategory, user.uid), { merge: true });
                                                } catch (error) {
                                                    console.error("Error creating category in Firebase:", error);
                                                }
                                            }
                                            setNewCategoryName('');
                                            setIsCreatingCategory(false);
                                        } else if (e.key === 'Escape') {
                                            setIsCreatingCategory(false);
                                            setNewCategoryName('');
                                        }
                                    }}
                                    autoFocus
                                />
                                <div className="relative group/color">
                                    <input 
                                        type="color" 
                                        id="cat-color"
                                        defaultValue="#6366f1"
                                        className="w-10 h-10 rounded-xl cursor-pointer bg-[#0B0F19] border border-white/10 p-1 transition-all group-hover/color:border-white/20"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                                <button 
                                    onClick={() => {
                                        setIsCreatingCategory(false);
                                        setNewCategoryName('');
                                    }}
                                    className="text-slate-500 hover:text-slate-300 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={async () => {
                                        if (newCategoryName.trim()) {
                                            const newCategory = { id: crypto.randomUUID(), name: newCategoryName.trim(), color: (document.getElementById('cat-color') as HTMLInputElement)?.value || '#6366f1' };
                                            setCategories(prev => [...prev, newCategory]);
                                            if (user) {
                                                try {
                                                    await setDoc(doc(db, 'categories', newCategory.id), sanitizeCategory(newCategory, user.uid), { merge: true });
                                                } catch (error) {
                                                    console.error("Error creating category in Firebase:", error);
                                                }
                                            }
                                            setNewCategoryName('');
                                            setIsCreatingCategory(false);
                                        }
                                    }}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/20"
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                
                <div className="space-y-2">
                    <button
                        onClick={() => setSelectedCategoryId(null)}
                        className={`w-full text-left px-5 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-4 ${!selectedCategoryId ? 'bg-white/5 text-white shadow-sm border border-white/10' : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.02]'}`}
                    >
                        <div className={`w-2.5 h-2.5 rounded-full ${!selectedCategoryId ? 'bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.8)]' : 'bg-slate-800'}`}></div>
                        All Projects
                    </button>
                    {categories.map(cat => (
                        <div key={cat.id} className="group relative flex items-center">
                            <button
                                onClick={() => setSelectedCategoryId(cat.id)}
                                className={`flex-1 text-left px-5 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-4 ${selectedCategoryId === cat.id ? 'bg-white/5 text-white shadow-sm border border-white/10' : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.02]'}`}
                            >
                                <div className="w-2.5 h-2.5 rounded-full" style={{ 
                                    backgroundColor: cat.color,
                                    boxShadow: selectedCategoryId === cat.id ? `0 0 12px ${cat.color}CC` : 'none'
                                }}></div>
                                {cat.name}
                            </button>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm('Are you sure you want to delete this category?')) {
                                        setCategories(prev => prev.filter(c => c.id !== cat.id));
                                        if (user) {
                                            deleteDoc(doc(db, 'categories', cat.id)).catch(console.error);
                                        }
                                    }
                                }}
                                className="absolute right-3 opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Notebooks */}
            <div>
                <div className="flex items-center justify-between mb-6 px-2">
                    <div className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Notebooks</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => {
                                const today = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short' }).toUpperCase();
                                setSearchQuery(prev => prev === today ? '' : today);
                            }}
                            className={`text-[9px] font-black px-2 py-1 rounded-lg border transition-all ${searchQuery === new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short' }).toUpperCase() ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400' : 'bg-white/5 border-white/5 text-slate-500 hover:text-slate-300'}`}
                            title="Filter Today"
                        >
                            TODAY
                        </button>
                        <span className="text-[10px] text-slate-500 font-black px-2.5 py-1 bg-white/5 rounded-lg border border-white/5">
                            {projects.length}
                        </span>
                    </div>
                </div>
                <div className="space-y-1">
                    {projects.length === 0 ? (
                        <div className="px-4 py-10 text-center border border-dashed border-white/5 rounded-[2rem] bg-white/[0.01]">
                            <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.2em]">No projects yet</p>
                        </div>
                    ) : (
                        projects
                            .filter(p => !selectedCategoryId || p.categoryId === selectedCategoryId)
                            .filter(p => {
                                const titleMatch = p.title.toLowerCase().includes(searchQuery.toLowerCase());
                                const dateMatch = new Date(p.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }).toUpperCase().includes(searchQuery.toUpperCase());
                                return titleMatch || dateMatch;
                            })
                            .map(p => (
                                <div key={p.id} className="group relative">
                                    <button
                                        onClick={() => { setCurrentProjectId(p.id); setIsMobileMenuOpen(false); }}
                                        className={`w-full text-left px-4 py-3 rounded-2xl text-xs transition-all flex items-center gap-4 ${currentProjectId === p.id ? 'bg-[#161B26] text-white' : 'text-slate-400 hover:text-slate-200'}`}
                                    >
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-500 ${currentProjectId === p.id ? 'bg-[#232936] text-slate-400' : 'bg-[#1A1D26] text-slate-600'}`}>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div title={p.title} className="font-bold truncate tracking-tight">{p.title}</div>
                                            <div className="text-[9px] text-slate-600 mt-1 font-black uppercase tracking-[0.15em]">
                                                {new Date(p.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }).toUpperCase()}
                                            </div>
                                        </div>
                                    </button>
                                    <button 
                                        onClick={(e) => {
                                            e.preventDefault();
                                            handleDeleteProject(e, p.id);
                                        }}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>
                            ))
                    )}
                </div>
            </div>
        </div>
        
        <div className="p-6 border-t border-white/5 bg-white/[0.01]">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)] animate-pulse"></div>
                    <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">System Online</span>
                </div>
                <button 
                    onClick={() => setShowFeedbackModal(true)}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-black uppercase tracking-[0.2em] transition-colors"
                >
                    Feedback
                </button>
            </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full relative w-full">
        
        {/* Mobile Header */}
        <div className="md:hidden p-4 border-b border-white/5 bg-[#0B0F19]/80 backdrop-blur-xl flex justify-between items-center shrink-0 z-20 sticky top-0">
             <div className="flex items-center gap-3">
                 <button 
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="p-2.5 -ml-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition-all"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                 </button>
                 <div className="flex items-center gap-3">
                     <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                         </svg>
                     </div>
                     <h1 className="text-base font-black text-white tracking-tight">MindSpark</h1>
                 </div>
             </div>
             <div className="flex items-center gap-2">
                 {projects.length > 0 && (
                     <select 
                        onChange={(e) => setCurrentProjectId(e.target.value)} 
                        value={currentProjectId || ''}
                        className="bg-white/[0.03] text-[10px] font-black uppercase tracking-widest p-2.5 rounded-xl border border-white/5 max-w-[120px] text-slate-300 outline-none focus:border-indigo-500/50 transition-all"
                     >
                         <option value="" disabled className="bg-[#0B0F19]">Select Notebook</option>
                         {projects.map(p => <option key={p.id} value={p.id} className="bg-[#0B0F19]">{p.title}</option>)}
                     </select>
                 )}
                 <button 
                    onClick={() => { setCurrentProjectId(null); setPrompt(''); }}
                    className="p-2.5 bg-indigo-600 text-white rounded-xl transition-all shadow-lg shadow-indigo-600/20 active:scale-90"
                    title="New Notebook"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                 </button>
             </div>
        </div>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-12 pb-60 md:pb-80 scroll-smooth bg-[#0B0F19] relative">
            {/* Subtle background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5 pointer-events-none" />
            
            <div className="relative z-10 max-w-5xl mx-auto">
                {searchQuery ? (
                    renderSearchResults()
                ) : !currentProjectId && !isPlanning ? (
                    <>
                        <div className="min-h-[60vh] md:min-h-[70vh] flex flex-col items-center justify-center text-center p-6 animate-fadeIn">
                            <motion.div 
                                initial={{ opacity: 0, y: 40 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
                                className="space-y-12"
                            >
                                <div className="relative mb-10 inline-block">
                                    <div className="absolute -inset-8 bg-indigo-500/20 blur-3xl rounded-full animate-pulse"></div>
                                    <div className="relative w-32 h-32 bg-gradient-to-br from-[#1F2937] to-[#0F1117] rounded-[2.5rem] flex items-center justify-center text-6xl border border-white/10 shadow-2xl shadow-indigo-500/20 transform hover:scale-110 transition-all duration-700 rotate-3 hover:rotate-0">
                                        ✨
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <h2 className="text-6xl md:text-8xl font-black bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/40 tracking-tighter leading-[0.9]">
                                        Free Your<br/>Mind
                                    </h2>
                                    <p className="max-w-2xl mx-auto text-slate-500 text-lg md:text-2xl font-medium leading-relaxed">
                                        Take the first step to turn your ideas into reality.
                                        Let AI plan every detail for you.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12 max-w-4xl mx-auto">
                                    {[
                                        { title: 'Game Scenario', icon: '🎮', prompt: 'Create original story and character outlines for an RPG game.' },
                                        { title: 'Business Plan', icon: '🚀', prompt: 'Prepare a 12-month business plan for a sustainable fashion startup.' },
                                        { title: 'System Architecture', icon: '💻', prompt: 'Design the system architecture and database schema for a real-time chat app.' }
                                    ].map((item, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setPrompt(item.prompt)}
                                            className="group p-6 rounded-[2rem] bg-white/[0.02] border border-white/5 hover:border-indigo-500/30 transition-all duration-500 text-left hover:-translate-y-2"
                                        >
                                            <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform duration-500">
                                                {item.icon}
                                            </div>
                                            <h3 className="text-sm font-black text-white tracking-tight uppercase tracking-[0.1em]">{item.title}</h3>
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        </div>
                            
                        <div className="w-full max-w-5xl">
                            <div className="mb-10 flex flex-wrap justify-center gap-4 px-4 pb-2">
                                {["HEALTH", "TECHNOLOGY", "HOBBIES"].map(catName => {
                                    const cat = categories.find(c => c.name.toUpperCase() === catName) || { id: catName, name: catName };
                                    const isSelected = activeTemplateCategory === cat.name;
                                    return (
                                        <button 
                                            key={cat.id}
                                            onClick={() => setActiveTemplateCategory(cat.name)}
                                            className={`px-8 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 border ${isSelected ? 'bg-white/10 text-white border-white/20' : 'bg-white/5 text-slate-500 border-white/5 hover:bg-white/10 hover:text-slate-300'}`}
                                        >
                                            {cat.name}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="bg-[#161B26]/30 border-2 border-indigo-500/20 rounded-[2.5rem] p-12 transition-all hover:border-indigo-500/40 relative">
                                <div className="flex items-center justify-between mb-10 relative z-10">
                                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.4em] flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]"></span>
                                        DISCOVER TRENDS
                                    </h3>
                                    <button 
                                        onClick={() => setShowTemplateManager(true)}
                                        className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-[0.2em] transition-colors"
                                    >
                                        MANAGE TEMPLATES
                                    </button>
                                </div>
                                
                                <div className="relative min-h-[300px] z-10">
                                    <AnimatePresence mode="wait">
                                        <motion.div 
                                            key={activeTemplateCategory + templatePage}
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -20 }}
                                            className="grid grid-cols-1 md:grid-cols-3 gap-8"
                                        >
                                            {currentTemplates.map((template, idx) => (
                                                <motion.button 
                                                    key={template.title}
                                                    whileHover={{ y: -8 }}
                                                    onClick={() => setPrompt(template.prompt)}
                                                    className={`group p-8 rounded-[2rem] transition-all duration-500 text-left relative overflow-hidden h-[300px] flex flex-col ${idx === 1 ? 'bg-indigo-500/10 border-2 border-indigo-500/30' : 'bg-white/[0.02] border border-white/5 hover:bg-white/[0.04]'}`}
                                                >
                                                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-8 shadow-inner ${idx === 1 ? 'bg-indigo-500 text-white' : 'bg-white/5 text-white/60 group-hover:bg-indigo-500/20'}`}>
                                                        {template.icon === '📝' && (
                                                            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                                        )}
                                                        {template.icon === '🛒' && (
                                                            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                                                        )}
                                                        {template.icon === '📱' && (
                                                            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>
                                                        )}
                                                        {template.icon !== '📝' && template.icon !== '🛒' && template.icon !== '📱' && template.icon}
                                                    </div>
                                                    <h4 className="font-black text-white mb-4 text-2xl tracking-tight leading-tight">
                                                        {template.title}
                                                    </h4>
                                                    <p className="text-slate-500 text-sm leading-relaxed group-hover:text-slate-400 transition-colors">
                                                        {template.desc}
                                                    </p>
                                                </motion.button>
                                            ))}
                                        </motion.div>
                                    </AnimatePresence>
                                </div>
                                
                                <div className="mt-12 flex justify-center">
                                    <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <motion.div 
                                            className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,1)]"
                                            initial={{ x: "-100%" }}
                                            animate={{ x: "0%" }}
                                            transition={{ duration: 1.5, repeat: Infinity, repeatType: "reverse" }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                ) : isCalendarView ? (
                    <div className="max-w-6xl mx-auto py-10 px-4">
                        <CalendarView 
                            notes={notes} 
                            projects={projects} 
                            onNavigateToNote={handleNavigateToNote} 
                            onFilterDate={(dateStr) => {
                                setSearchQuery(dateStr);
                                setIsMobileMenuOpen(true); // Open sidebar on mobile to see filtered results
                            }}
                        />
                    </div>
                ) : (
                    renderProjectNotes()
                )}
            
            {isPlanning && (
                <div className="flex flex-col items-center justify-center p-12 space-y-4">
                    <LoadingSpinner />
                    <span className="text-indigo-300 font-medium animate-pulse">Experts are assigning tasks...</span>
                </div>
            )}
            </div>
        </div>

        {/* Input Area */}
        <div className="p-8 md:p-12 pb-16 absolute bottom-0 w-full z-30">
            <div className="max-w-4xl mx-auto">
                <div className="bg-[#161B26]/80 backdrop-blur-3xl rounded-[2.5rem] p-4 border-2 border-white/5 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] flex items-center gap-4 group hover:border-white/10 transition-all duration-500">
                    <button className="hidden md:flex p-4 text-slate-500 hover:text-indigo-400 transition-colors gap-2 items-center text-[10px] font-black uppercase tracking-[0.2em]">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
                        Get Inspired
                    </button>
                    <div className="flex-1 relative">
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={currentProjectId ? "Add a new step to this project..." : "What would you like to plan?"}
                            className="w-full bg-transparent text-white rounded-2xl p-4 min-h-[60px] max-h-[250px] focus:outline-none resize-none placeholder:text-slate-600 text-base md:text-lg font-medium"
                            disabled={isPlanning || isBoosting || isTranscribing}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    currentProjectId ? handleGenerateNewStep() : handleCreateProject();
                                }
                            }}
                        />
                    </div>
                    <div className="flex items-center gap-3 pr-2">
                        <button
                            onClick={currentProjectId ? handleGenerateNewStep : handleCreateProject}
                            disabled={isPlanning || isBoosting || !prompt.trim()}
                            className={`px-8 py-4 rounded-[1.2rem] font-black transition-all duration-500 flex items-center gap-3 hover:scale-105 active:scale-95 ${
                                isPlanning || !prompt.trim()
                                ? 'bg-white/5 text-slate-700 cursor-not-allowed'
                                : 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/30'
                            }`}
                        >
                            <span className="text-[10px] uppercase tracking-[0.3em] font-black">START</span>
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7"></path></svg>
                        </button>
                    </div>
                </div>
                <div className="mt-8 flex items-center justify-center gap-16 opacity-30">
                    <div className="flex items-center gap-4">
                        <div className="bg-white/10 px-2 py-1 rounded-lg border border-white/5 text-[9px] text-slate-400 font-bold">ENTER</div>
                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em]">Quick Send</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="bg-white/10 px-2 py-1 rounded-lg border border-white/5 text-[9px] text-slate-400 font-bold">SHIFT ↵</div>
                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em]">New Line</span>
                    </div>
                </div>
            </div>
        </div>

      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl" 
            onClick={() => setIsSettingsModalOpen(false)}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-lg bg-[#161B26] border border-white/10 rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] overflow-hidden mx-4" 
              onClick={e => e.stopPropagation()}
            >
              <div className="p-8 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                    <Settings className="h-5 w-5" />
                  </div>
                  <h2 className="text-xl font-black text-white tracking-tight">Settings</h2>
                </div>
                <button 
                  onClick={() => setIsSettingsModalOpen(false)}
                  className="p-2 text-slate-500 hover:text-white transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="p-8 space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Gemini API Key</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-indigo-400 transition-colors">
                      <Key className="h-5 w-5" />
                    </div>
                    <input 
                      type="password"
                      value={userGeminiKey}
                      onChange={(e) => setUserGeminiKey(e.target.value)}
                      placeholder="Paste your key here..."
                      className="w-full bg-[#0B0F19] text-slate-200 text-sm pl-12 pr-4 py-4 rounded-2xl border border-white/5 focus:outline-none focus:border-indigo-500/30 transition-all font-medium"
                    />
                  </div>
                  <p className="text-[10px] text-slate-600 font-medium leading-relaxed">
                    Your key is stored locally in your browser and used to make AI requests. 
                    Get one for free at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">Google AI Studio</a>.
                  </p>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    onClick={() => {
                        localStorage.setItem('user_gemini_api_key', userGeminiKey);
                        setIsSettingsModalOpen(false);
                    }}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-xl shadow-indigo-600/20 active:scale-95"
                  >
                    Save Changes
                  </button>
                  <button 
                    onClick={() => {
                        setUserGeminiKey('');
                        localStorage.removeItem('user_gemini_api_key');
                    }}
                    className="px-6 bg-white/5 hover:bg-red-500/10 text-slate-400 hover:text-red-400 border border-white/5 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Command Palette Modal */}
      <AnimatePresence>
        {isCommandPaletteOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-slate-950/40 backdrop-blur-md" 
            onClick={() => setIsCommandPaletteOpen(false)}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-2xl bg-[#1A1D26] border border-white/10 rounded-3xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] overflow-hidden mx-4" 
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center px-6 py-5 border-b border-white/5 bg-white/[0.02]">
                <div className="mr-4 text-indigo-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input 
                  type="text" 
                  value={commandQuery}
                  onChange={e => setCommandQuery(e.target.value)}
                  placeholder="Search project or note..."
                  className="w-full bg-transparent text-slate-100 text-lg placeholder:text-slate-500 focus:outline-none"
                  autoFocus
                />
                <div className="flex items-center gap-2 ml-4">
                  <span className="text-[10px] font-bold text-slate-500 border border-white/10 rounded-lg px-2 py-1 bg-white/5 uppercase tracking-widest">ESC</span>
                </div>
              </div>
              
              <div className="max-h-[60vh] overflow-y-auto p-3 custom-scrollbar">
                <div className="space-y-1">
                  {projects.filter(p => p.title.toLowerCase().includes(commandQuery.toLowerCase())).map(p => (
                    <motion.button 
                      key={p.id}
                      whileHover={{ x: 4, backgroundColor: "rgba(255, 255, 255, 0.03)" }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => {
                        setCurrentProjectId(p.id);
                        setIsCommandPaletteOpen(false);
                        setCommandQuery('');
                      }}
                      className="w-full text-left px-4 py-3 rounded-2xl flex items-center gap-4 transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-200 truncate">{p.title}</div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Project Notebook</div>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </motion.button>
                  ))}

                  {Object.values(notes as Record<string, Note>).filter(n => n.parentId && n.title.toLowerCase().includes(commandQuery.toLowerCase())).map(n => (
                    <motion.button 
                      key={n.id}
                      whileHover={{ x: 4, backgroundColor: "rgba(255, 255, 255, 0.03)" }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => {
                        setCurrentProjectId(n.projectId);
                        setIsCommandPaletteOpen(false);
                        setCommandQuery('');
                        setTimeout(() => handleNavigateToNote(n.id), 100);
                      }}
                      className="w-full text-left px-4 py-3 rounded-2xl flex items-center gap-4 transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-200 truncate">{n.title}</div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">
                          Note • {projects.find(p => p.id === n.projectId)?.title}
                        </div>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </motion.button>
                  ))}
                </div>

                {projects.filter(p => p.title.toLowerCase().includes(commandQuery.toLowerCase())).length === 0 && 
                 Object.values(notes as Record<string, Note>).filter(n => n.parentId && n.title.toLowerCase().includes(commandQuery.toLowerCase())).length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <div className="text-sm font-medium">No results found</div>
                    <div className="text-xs mt-1">Try a different keyword.</div>
                  </div>
                )}
              </div>
              
              <div className="px-6 py-4 bg-white/[0.02] border-t border-white/5 flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="bg-white/10 px-1.5 py-0.5 rounded border border-white/5">↑↓</span> Navigate
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="bg-white/10 px-1.5 py-0.5 rounded border border-white/5">ENTER</span> Select
                  </span>
                </div>
                <div>MindSpark v1.0</div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Share Project Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#0F1117] border border-white/10 rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl relative"
          >
            <div className="mb-8">
                <h3 className="text-2xl font-black text-white tracking-tight">Share Project</h3>
                <p className="text-slate-400 text-sm mt-1">Enter the email address of the person you want to collaborate with.</p>
            </div>

            <div className="space-y-4">
                <div className="relative">
                    <input 
                        type="email" 
                        placeholder="Email address..."
                        value={shareEmail}
                        onChange={(e) => setShareEmail(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleShareProject()}
                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-white focus:border-indigo-500 outline-none transition-all pr-12"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                        <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                      </svg>
                    </div>
                </div>

                <div className="flex gap-3 pt-2">
                    <button 
                        onClick={() => setShowShareModal(false)}
                        className="flex-1 px-4 py-4 rounded-2xl text-sm font-black text-slate-400 hover:bg-white/5 transition-all"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleShareProject}
                        disabled={isSharing}
                        className="flex-[2] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
                    >
                        {isSharing ? <LoadingSpinner /> : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M15 8a3 3 0 11-6 0 3 3 0 016 0zM1 13.313V6h5v1H1v6.313zM15 11.242a4.996 4.996 0 01-1.003-.233L10.003 14H1l8 4 8-4h-2z" />
                            </svg>
                            Send Invite
                          </>
                        )}
                    </button>
                </div>
            </div>

            <div className="mt-8 border-t border-white/5 pt-6">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Current Participants</h4>
                <div className="space-y-3">
                   <div className="flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-bold text-white">
                            {user?.email?.[0].toUpperCase()}
                         </div>
                         <div>
                            <div className="text-xs font-bold text-white">{user?.email}</div>
                            <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-tighter">Project Owner</div>
                         </div>
                      </div>
                   </div>
                   {projects.find(p => p.id === currentProjectId)?.collaborators?.map(cId => {
                      const profile = collaboratorProfiles[cId];
                      return (
                        <div key={cId} className="flex items-center justify-between group">
                           <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 overflow-hidden">
                                 {profile?.photoURL ? <img src={profile.photoURL} alt="" /> : (profile?.email?.[0] || '?').toUpperCase()}
                              </div>
                              <div>
                                 <div className="text-xs font-bold text-slate-200">{profile?.email || 'Loading...'}</div>
                                 <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Participant</div>
                              </div>
                           </div>
                        </div>
                      )
                   })}
                </div>
            </div>
          </motion.div>
        </div>
      )}
      {projectToDelete && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#0F1117] border border-white/10 rounded-[2rem] p-8 max-w-sm w-full shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-red-500/50" />
            <h3 className="text-xl font-black text-white mb-3 tracking-tight">Delete Notebook</h3>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">
              Are you sure you want to delete this notebook? This action cannot be undone and all notes inside will be deleted.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={(e) => { e.stopPropagation(); cancelDeleteProject(); }}
                className="px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); confirmDeleteProject(); }}
                className="px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all border border-red-500/20"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Template Manager Modal */}
      {showTemplateManager && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#0F1117] border border-white/10 rounded-[2.5rem] p-8 max-w-2xl w-full shadow-2xl max-h-[80vh] overflow-hidden flex flex-col"
          >
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h3 className="text-2xl font-black text-white tracking-tight">AI Template Management</h3>
                    <p className="text-slate-400 text-sm mt-1">Create your own custom AI prompt templates.</p>
                </div>
                <button onClick={() => setShowTemplateManager(false)} className="p-3 bg-white/5 rounded-2xl text-slate-400 hover:text-white transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>

            <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar flex-1">
                <div className="bg-white/5 border border-white/5 rounded-3xl p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <input 
                            type="text" 
                            placeholder="Template Name"
                            value={newTemplate.name}
                            onChange={(e) => setNewTemplate({...newTemplate, name: e.target.value})}
                            className="bg-black/40 border border-white/5 rounded-2xl px-4 py-3 text-white focus:border-indigo-500 outline-none transition-all"
                        />
                        <input 
                            type="text" 
                            placeholder="Icon (Emoji)"
                            value={newTemplate.icon}
                            onChange={(e) => setNewTemplate({...newTemplate, icon: e.target.value})}
                            className="bg-black/40 border border-white/5 rounded-2xl px-4 py-3 text-white focus:border-indigo-500 outline-none transition-all"
                        />
                    </div>
                    <textarea 
                        placeholder="AI Prompt..."
                        value={newTemplate.prompt}
                        onChange={(e) => setNewTemplate({...newTemplate, prompt: e.target.value})}
                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-4 py-3 text-white focus:border-indigo-500 outline-none transition-all min-h-[100px] resize-none"
                    />
                    <button 
                        onClick={saveTemplate}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-indigo-600/20"
                    >
                        Save Template
                    </button>
                </div>

                <div className="space-y-3">
                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">My Saved Templates</h4>
                    {aiTemplates.length === 0 ? (
                        <div className="text-center py-8 text-slate-600 text-sm italic">You haven't added any custom templates yet.</div>
                    ) : (
                        aiTemplates.map(t => (
                            <div key={t.id} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between group">
                                <div className="flex items-center gap-4">
                                    <span className="text-2xl">{t.icon}</span>
                                    <div>
                                        <div className="text-white font-bold">{t.name}</div>
                                        <div className="text-slate-500 text-xs truncate max-w-[300px]">{t.prompt}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => { setPrompt(t.prompt); setShowTemplateManager(false); }}
                                        className="px-4 py-2 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white rounded-xl text-xs font-black transition-all"
                                    >
                                        Use
                                    </button>
                                    <button 
                                        onClick={() => deleteTemplate(t.id)}
                                        className="p-2 text-slate-600 hover:text-red-400 transition-all"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Alert Modal */}
      {alertMessage && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-100 mb-2">Warning</h3>
            <p className="text-slate-400 text-sm mb-6">
              {alertMessage}
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setAlertMessage(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-500 text-white hover:bg-indigo-600 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-100 mb-2">Feedback / Bug Report</h3>
            <p className="text-slate-400 text-sm mb-4">
              Share your feedback or any bugs you encountered with us.
            </p>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              className="w-full bg-slate-900 text-slate-200 p-3 rounded-lg border border-slate-700 focus:border-indigo-500 focus:outline-none min-h-[120px] text-sm mb-4"
              placeholder="Your message..."
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowFeedbackModal(false); setFeedbackText(''); }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleFeedbackSubmit}
                disabled={!feedbackText.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;