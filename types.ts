export enum NoteType {
  ROOT = 'ROOT',
  TEXT = 'TEXT',
  CODE = 'CODE',
  IMAGE = 'IMAGE',
}

export enum GenerationStatus {
  IDLE = 'IDLE',
  PLANNING = 'PLANNING',
  GENERATING = 'GENERATING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface NoteStep {
  title: string;
  description: string;
  type: 'text' | 'code' | 'image';
  agentRole?: string;
  assignedAgent?: string;
}

export interface ProjectPlan {
  title: string;
  summary: string;
  steps: NoteStep[];
}

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface Attachment {
  id: string;
  type: 'image' | 'audio' | 'file';
  url: string; // Base64 data URL
  name: string;
}

export interface Note {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  content: string; // Markdown or Image URL
  type: NoteType;
  status: GenerationStatus;
  children: string[]; // IDs of children
  timestamp: number;
  attachments?: Attachment[];
  tags?: string[];
  linkedNoteIds?: string[];
  isTask?: boolean;
  isCompleted?: boolean;
  dueDate?: number;
  agentRole?: string;
  assignedAgent?: string;
  lastEditedBy?: string;
  lastEditedAt?: number;
}

export interface StyleMemory {
  id: string;
  userId: string;
  projectName: string;
  styleKeywords: string[];
  summary: string;
  timestamp: number;
}

export interface AITemplate {
  id: string;
  name: string;
  prompt: string;
  icon: string;
}

export interface Project {
  id: string;
  title: string;
  summary?: string;
  originalPrompt?: string;
  rootNoteId: string;
  createdAt: number;
  categoryId?: string;
  creatorId: string;
  creatorEmail?: string;
  collaborators?: string[]; // Array of user IDs
}
