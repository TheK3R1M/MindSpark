---
title: MindSpark
emoji: 🧠
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
app_port: 7860
---

# 🧠 MindSpark (AI Notebook)

**MindSpark** is a next-generation AI-powered note-taking and project management platform that transforms your complex ideas into structured, actionable, and detailed project plans.

Powered by Google Gemini models (Gemini 2.5 Flash, Gemini 3 Flash Preview, and Image), this platform takes a simple idea and turns it into a professional workflow.

---

## 🎯 Purpose of the Application

Whether you want to write a novel, develop a new mobile app, start a business, or design an RPG game, you might not know "where to start." **The main goal of MindSpark is to eliminate this starting barrier and act as your "Board of Directors" while bringing your vision to life.**

You just express your idea (or tell it with your voice). MindSpark:
1. **Breaks down** the steps needed to reach your goal.
2. Assigns a **Virtual Agent** (e.g., Database Architect, Fiction Writer, UI/UX Designer) for each step as an expert in that task.
3. Produces the **text, code, or vision image** you need through these agents in seconds.

---

## ✨ Key Features

### 🕵️‍♂️ Dynamic Expert Agent Mechanism
A virtual team of experts is automatically established based on your project type. Tasks don't just stay as a list; they are assigned to agents with roles like *System Architect*, *Content Strategist*, or *Art Director*. You can see which agent took on that job in each note.

### 🪄 Prompt Boost & Voice Input
Struggling to express your idea?
- **Voice to Text:** Just record your idea by speaking. AI transcribes it.
- **Boost:** Transform a short sentence like "I want to make a game" into a rich, technical, and creative command with one click.

### 📦 Automatic Content and Asset Generation
AI generates content planned for each step:
- **Text:** Detailed tutorials, stories, strategies.
- **Code:** Actionable software architectures and code blocks.
- **Image:** High-quality AI-drawn concept art that Comic solidifies your idea.

### ☁️ Cloud Sync and Offline Support
- Log in with your Google account and sync all your projects to the cloud via **Firebase**.
- Even when working offline, your browser memory (Local Storage) keeps your projects safe.

### 📋 Drag, Drop, and Manage
Change the priorities of tasks (steps) with drag-and-drop, mark completed ones, add new tags, files, or audio recordings.

### 📥 Export
Download your massive project file as a highly readable **PDF** document or a developer-friendly **Markdown (.md)** file.

---

## 🚀 How It Works?

1. **Ignite Your Idea:** Type or speak "I want to design a sci-fi base desktop board game" in the box on the main screen.
2. **AI Planning:** The intelligence behind it divides this huge idea into logical steps (e.g., Universe rules, Characters, Game mechanics, Design, etc.) and assigns them to agents.
3. **Production:** MindSpark writes text, generates code, and draws images sequentially according to the content of each step.
4. **Iteration:** Review the results, add your own notes, redraw images by giving feedback, or add new steps.

---

## 🛠️ Tech Stack
* **Frontend:** React 19, TypeScript, Vite
* **Styling & UI:** Tailwind CSS, Framer Motion (Animations), Lucide React (Icons)
* **AI:** `@google/genai` (Gemini 2.5 Flash, Gemini 3 Preview, Gemini 3 Flash Image)
* **Backend / Database:** Firebase (Auth, Firestore)
* **Desktop & File Capabilities:** Vite PWA, dnd-kit (Drag-and-Drop), html2pdf.js / jspdf (PDF Export)

---

## ⚖️ License
This project is licensed under the **MIT License**. 

**What does this mean?**
- You can use, modify, and distribute this project freely.
- The original copyright notice and permission notice must be included in all copies or substantial portions of the software.

---

> *Big ideas deserve great starts. With MindSpark, none of your ideas will remain just a dream.*
