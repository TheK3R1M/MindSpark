import { GoogleGenAI, Type, Schema } from "@google/genai";
import { ProjectPlan, NoteType, StyleMemory } from "../types";

const getAI = () => {
    const userKey = localStorage.getItem('user_gemini_api_key');
    const apiKey = userKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn("Gemini API Key is missing. Please set it in Settings.");
    }
    return new GoogleGenAI({ apiKey: apiKey || 'dummy-key' });
};

// Helper to compress base64 images to avoid Firestore 1MB limit
const resizeBase64Image = (base64Str: string, maxWidth = 800, maxHeight = 800): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => resolve(base64Str);
  });
};

// System instruction for the planner
const PLANNER_SYSTEM_INSTRUCTION = `
You are the chief architect of the "MindSpark" system.
Analyze the user's complex request and plan it like a task distribution for an expert team.

YOUR TASK:
1. Determine 4-8 steps required for the project.
2. Assign an "Expert Agent" (assignedAgent) and their "Role" (agentRole) for each step. 
3. Steps should follow each other and be in a logical flow.

STYLE GUIDE (MEMORY):
If any past styles or preferences are provided to you, keep this tone and approach in your planning.

AGENT ASSIGNMENT RULES:
- Determine specific experts based on the project type (Software Developer, Designer, Writer, Analyst, Strategist, etc.).
- Determine the 'type' property of each step based on the content: 'text', 'code', 'image'.
- Provide the answer strictly in JSON format. Use English language.
`;

// Schema for structured JSON output
const planSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "A creative and engaging main title for the project" },
    summary: { type: Type.STRING, description: "A short, motivating summary of what this notebook is about." },
    steps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Title of the step" },
          description: { type: Type.STRING, description: "A short summary of what will be done in this step." },
          type: { type: Type.STRING, enum: ["text", "code", "image"], description: "Content type" },
          assignedAgent: { type: Type.STRING, description: "Name of the expert agent taking the task (e.g., 'Code Architect')" },
          agentRole: { type: Type.STRING, description: "Specific role and responsibility assigned to the agent in this step." },
        },
        required: ["title", "description", "type", "assignedAgent", "agentRole"],
      },
    },
  },
  required: ["title", "summary", "steps"],
};

const isQuotaError = (error: any): boolean => {
  const errorStr = JSON.stringify(error).toLowerCase();
  return (
    error?.status === 'RESOURCE_EXHAUSTED' ||
    error?.code === 429 ||
    errorStr.includes('429') ||
    errorStr.includes('resource_exhausted') ||
    errorStr.includes('quota exceeded') ||
    errorStr.includes('limit reached')
  );
};

export const boostPrompt = async (prompt: string): Promise<string> => {
  try {
    const response = await getAI().models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Rewrite and enrich the following text to be a perfect command (prompt) or a great project idea to be given to an AI assistant.
- If it's a short and simple idea, detail it and add depth.
- If it's complex and messy, structure and clarify it.
- Use a professional, inspiring, and highly effective language.
- Provide only the improved text, do not add any explanations before or after like "Here is the text:".

Original Text:
${prompt}`,
    });
    return response.text ? response.text.trim() : prompt;
  } catch (error) {
    console.error("Prompt boost error:", error);
    if (isQuotaError(error)) {
        return prompt; // Fallback to original prompt if quota hit
    }
    throw error;
  }
};

export const transcribeAudio = async (base64Audio: string): Promise<string> => {
  try {
    const response = await getAI().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        "Transcribe this audio recording into text. Return only the text, do not provide any other explanation. If the audio is not understandable, leave it blank.",
        {
          inlineData: {
            mimeType: "audio/webm",
            data: base64Audio
          }
        }
      ]
    });
    return response.text ? response.text.trim() : "";
  } catch (error) {
    console.error("Transcription error:", error);
    if (isQuotaError(error)) {
        throw new Error("AI system is very busy (Quota reached). Please try typing your input as text.");
    }
    throw error;
  }
};

export const createProjectPlan = async (userPrompt: string, memories: StyleMemory[] = []): Promise<ProjectPlan> => {
  try {
    const memoryContext = memories.length > 0 
      ? `\n\nPAST PREFERENCES AND MEMORY:\n${memories.map(m => `- Project: ${m.projectName}, Style: ${m.styleKeywords.join(', ')}, Summary: ${m.summary}`).join('\n')}\n\nPlease take these styles and tone into account.`
      : "";

    const response = await getAI().models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: userPrompt + memoryContext,
      config: {
        systemInstruction: PLANNER_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: planSchema
      },
    });

    if (!response.text) throw new Error("Plan could not be created.");
    return JSON.parse(response.text) as ProjectPlan;
  } catch (error) {
    console.error("Plan Error:", error);
    if (isQuotaError(error)) {
        throw new Error("System is very busy right now (Quota limit exceeded). Please try again in a few minutes or use a shorter description.");
    }
    throw error;
  }
};

export const generateStepContent = async (
  projectTitle: string,
  stepTitle: string,
  stepDescription: string,
  stepType: NoteType,
  memories: StyleMemory[] = []
): Promise<string> => {
  const memoryContext = memories.length > 0
    ? `\nPAST STYLE AND TONE:\n${memories.map(m => `- ${m.styleKeywords.join(', ')}`).join(', ')}\nPlease reflect this style and tone in this content as well.`
    : "";

  const contextPrompt = `
CONTEXT: We are working on a project named "${projectTitle}".
CURRENT TASK: "${stepTitle}"
TASK DETAIL: ${stepDescription}
${memoryContext}

YOUR MISSION:
Prepare a detailed, educational, and directly applicable content for this step in the "MindSpark" format.
When the user reads this page, they should have everything they need to complete this step.

If Type is 'TEXT':
- Explain the subject in depth.
- Increase readability using bullet points, lists, and bold text.
- Speak like a professional mentor.

If Type is 'CODE':
- Write the necessary code blocks.
- Explain what the codes do with comment lines or explanations.

Use Markdown format.
  `;

  try {
    if (stepType === NoteType.IMAGE) {
      const imagePrompt = `
        High quality concept art illustration of: ${stepTitle}.
        Context: ${stepDescription}.
        Project Theme: ${projectTitle}.
        Style: Digital art, highly detailed, cinematic lighting, intricate textures, atmospheric, professional composition, masterpiece, 8k resolution, concept art style.
        No text, no labels, no watermarks, high quality.
      `;
      
      try {
          const response = await getAI().models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [{ text: imagePrompt }] },
            config: {
              imageConfig: {
                aspectRatio: '16:9',
              },
            },
          });
          
          const parts = response.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.inlineData) {
              const base64 = `data:${part.inlineData.mimeType || 'image/jpeg'};base64,${part.inlineData.data}`;
              return await resizeBase64Image(base64);
            }
          }
      } catch (innerError) {
          console.error("Image generation failed:", innerError);
          if (isQuotaError(innerError)) {
              return "--- Image could not be generated (System Busy / Quota Limit) ---\n" + stepDescription;
          }
      }
      
      return "--- Image could not be generated ---\n" + stepDescription;
    } else if (stepType === NoteType.TEXT) {
      const textPromise = getAI().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: contextPrompt,
      }).catch(e => {
          console.error("Text content generation error:", e);
          if (isQuotaError(e)) {
              return { text: "Content could not be generated because the system is busy (Quota reached). Please try the 'Regenerate' option later." };
          }
          throw e;
      });

      const imagePrompt = `
        High quality concept art illustration of: ${stepTitle}.
        Context: ${stepDescription}.
        Project Theme: ${projectTitle}.
        Style: Digital art, highly detailed, cinematic lighting, concept art style, clean composition.
        No text, no labels, no watermarks, high quality.
      `;

      const imagePromise = getAI().models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: imagePrompt }] },
        config: {
          imageConfig: {
            aspectRatio: '16:9',
          },
        },
      }).catch(e => {
        console.error("Image generation failed for text note:", e);
        return null;
      });

      const [textResponse, imageResponse] = await Promise.all([textPromise, imagePromise]);
      let content = (textResponse as any).text || "Content could not be generated.";

      if (imageResponse) {
          const parts = imageResponse.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
              if (part.inlineData) {
                  const base64 = `data:${part.inlineData.mimeType || 'image/jpeg'};base64,${part.inlineData.data}`;
                  const resizedBase64 = await resizeBase64Image(base64);
                  content = `![${stepTitle}](${resizedBase64})\n\n` + content;
                  break;
              }
          }
      }
      return content;
    } else {
      // Code generation
      try {
          const response = await getAI().models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: contextPrompt,
          });
          return response.text || "Content could not be generated.";
      } catch (e) {
          if (isQuotaError(e)) {
              return "```\n// Code could not be generated due to system busy.\n// Please try again later.\n```";
          }
          throw e;
      }
    }
  } catch (error) {
    console.error("Content Gen Error:", error);
    if (isQuotaError(error)) {
        return "System is very busy right now. Please try this step again later by clicking 'Regenerate'.";
    }
    throw error;
  }
};

export const chatWithStep = async (
  projectTitle: string,
  noteTitle: string,
  noteContent: string,
  userQuestion: string,
  history: any[] = []
): Promise<string> => {
  try {
    const contents = [
        ...history.map(h => ({
            role: h.role === 'model' ? 'model' : 'user',
            parts: h.parts
        })),
        { role: 'user', parts: [{ text: userQuestion }] }
    ];

    const response = await getAI().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: contents,
        config: {
            systemInstruction: `You are an expert in the "MindSpark" project. 
            CONTEXT: We are in the "${noteTitle}" step within the "${projectTitle}" project.
            CONTENT OF THIS STEP:
            ${noteContent.substring(0, 1000)}...

            YOUR MISSION: To answer the user's questions about this step, deepen the content, or offer alternative suggestions. 
            - Provide short, concise, and technically deep answers. 
            - Be helpful, show the way. 
            - Use Markdown.`
        }
    });

    return response.text || "Sorry, an answer could not be generated.";
  } catch (error) {
    console.error("Step Chat Error:", error);
    if (isQuotaError(error)) {
        return "Sorry, the system is currently busy (Quota reached). Please ask again in a few minutes.";
    }
    throw error;
  }
};
