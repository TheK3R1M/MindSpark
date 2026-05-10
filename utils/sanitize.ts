import { Note, Project, NoteType, GenerationStatus } from '../types';

export const sanitizeProject = (p: any, userId: string): Project & { userId: string } => ({
    id: String(p.id || crypto.randomUUID()),
    userId: String(userId),
    title: String(p.title || 'İsimsiz Proje').substring(0, 100),
    rootNoteId: String(p.rootNoteId || crypto.randomUUID()),
    createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
    creatorId: String(p.creatorId || userId),
    creatorEmail: String(p.creatorEmail || ''),
    collaborators: Array.isArray(p.collaborators) ? p.collaborators.map(String) : [],
    ...(p.summary ? { summary: String(p.summary).substring(0, 1000) } : {}),
    ...(p.originalPrompt ? { originalPrompt: String(p.originalPrompt).substring(0, 5000) } : {}),
    ...(p.categoryId ? { categoryId: String(p.categoryId) } : {})
});

export const sanitizeNote = (n: any, userId: string): Note & { userId: string } => ({
    id: String(n.id || crypto.randomUUID()),
    userId: String(userId),
    projectId: String(n.projectId || crypto.randomUUID()),
    ...(n.parentId ? { parentId: String(n.parentId) } : { parentId: null }),
    title: String(n.title || 'İsimsiz Not').substring(0, 200),
    content: String(n.content || '').substring(0, 1000000),
    type: ['ROOT', 'TEXT', 'CODE', 'IMAGE'].includes(n.type) ? n.type : NoteType.TEXT,
    status: ['IDLE', 'PLANNING', 'GENERATING', 'COMPLETED', 'ERROR'].includes(n.status) ? n.status : GenerationStatus.IDLE,
    children: Array.isArray(n.children) ? n.children.map(String).slice(0, 1000) : [],
    timestamp: typeof n.timestamp === 'number' ? n.timestamp : Date.now(),
    lastEditedBy: String(n.lastEditedBy || userId),
    lastEditedAt: typeof n.lastEditedAt === 'number' ? n.lastEditedAt : Date.now(),
    ...(Array.isArray(n.attachments) ? { attachments: n.attachments.slice(0, 100) } : {}),
    ...(Array.isArray(n.tags) ? { tags: n.tags.map(String).slice(0, 50) } : {}),
    ...(Array.isArray(n.linkedNoteIds) ? { linkedNoteIds: n.linkedNoteIds.map(String).slice(0, 100) } : {}),
    ...(n.agentRole ? { agentRole: String(n.agentRole).substring(0, 100) } : {}),
    ...(n.assignedAgent ? { assignedAgent: String(n.assignedAgent).substring(0, 50) } : {})
});

export const sanitizeCategory = (c: any, userId: string) => ({
    id: String(c.id || crypto.randomUUID()),
    userId: String(userId),
    name: String(c.name || 'İsimsiz Kategori').substring(0, 50),
    color: String(c.color || '#6366f1').substring(0, 20)
});
