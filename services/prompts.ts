
// services/prompts.ts
import { getVoiceListString } from '../config/voices';

export const getContentPlanPrompt = (count: number): string => `
You are an expert in creating content for a YouTube channel in the genre of historical thriller with elements of mystery and Lovecraftian style.

**Task:** Create a detailed content plan for ${count} videos for a YouTube channel.

**Genre and Style:**
- Plausible historical thriller
- Howard Lovecraft style (atmosphere of cosmic horror, mysteries beyond comprehension, ancient forces)
- We take real historical events/locations and wrap them in a mystical, engaging story
- Balance between facts and fiction — 70% real history, 30% mystical interpretation
- Atmospheric storytelling with elements of suspense

**Target Audience:**
- Adult audience 35-65+ years from Tier 1 countries (USA, Canada, UK, Australia)
- Interested in history, mystery, puzzles
- Prefer long content with deep immersion

**Language:** English (American variant)

**Video Format:**
- Duration: 20-40 minutes
- Format: dialogue-podcast with AI voice-over (2 voices)
- Visuals: 5-10 atmospheric pictures with historical locations/artifacts
- Delivery style: investigative, with elements of dramatization

**Geographic Focus:** Mystical locations in the USA and North America

**Requirements for the content plan for each video:**
1.  **title** (intriguing, with an element of mystery, up to 60 characters)
2.  **description** (2-3 sentences for YouTube description)
3.  **historicalFact** (what we take as a basis)
4.  **lovecraftianTwist** (how we wrap it in Lovecraft's style)
5.  **scriptStructure** (array of strings):
    - Introduction (setting up the intrigue)
    - Historical context (facts, dates, characters)
    - Unexplained details (oddities, coincidences, mysteries)
    - Mystical theory (our interpretation)
    - Conclusion (open-ended with a question)
6.  **tags** (list of keywords for SEO)
7.  **sources** (list of references to historical documents, archives, books)
8.  **visuals** (description of 5-7 key images)
9.  **dialogueTone** (dynamics between the two hosts)

**Thematic directions for selection:**
- Abandoned and cursed places
- Vanished expeditions and colonies
- Mysterious artifacts and findings
- Strange historical incidents
- Ancient Native American legends with a real basis
- Unexplained mass phenomena
- Secret government experiments of the past

**Additional requirements:**
- Each video must be unique in its theme
- Stories should not overlap
- Maintain a consistent channel style
- Focus on little-known stories (avoid beaten topics)
- Balance between horror and fascination
- Ethics: do not ridicule tragedies, do not use recent events

**Create a content plan for ${count} videos according to these parameters.**

**Return the result as a SINGLE VALID JSON OBJECT in \`\`\`json ... \`\`\`.**

**JSON Structure:**
{
  "ideas": [
    {
      "title": "Video 1: [Title]",
      "description": "[text]",
      "historicalFact": "[basic event]",
      "lovecraftianTwist": "[mystical interpretation]",
      "scriptStructure": ["[plan item 1]", "[plan item 2]"],
      "tags": ["[list]"],
      "sources": ["[3-5 links]"],
      "visuals": ["[list of images]"],
      "dialogueTone": "[description of dialogue dynamics]"
    }
  ]
}
`;

export const getBlueprintPrompt = (topic: string, knowledgeBaseText: string, creativeFreedom: boolean, language: string): string => {
    const sourceInstruction = knowledgeBaseText
        ? `Use STRICTLY AND ONLY the provided text ("Knowledge Base") as the SOLE source of facts. Do not use Google Search or invent facts.`
        : `Use Google Search to gather facts and information on the topic.`;

    const styleInstruction = creativeFreedom
        ? `**Style Requirements (Creative Freedom & YouTube Optimization):**
    - **Atmosphere & Style:** DO NOT mention authors like King or Lovecraft. Instead, EMBODY their style. Create a dark, mysterious atmosphere filled with psychological tension, cosmic dread, and the fear of the unknown. Weave a chilling, fictional tale using the provided facts as a foundation.
    - **Opening Hook:** The very first lines of the script MUST be a powerful 'hook' designed to grab the viewer's attention immediately.
    - **Audience Engagement:** Throughout the script, organically weave in calls to action (CTAs).`
        : `**Style Requirements (Documentary & YouTube Optimization):**
    - **Atmosphere:** Create a serious, informative, and objective tone.
    - **Narrative:** Strictly adhere to the facts. Structure the narrative like a high-quality documentary.`;
    
    const voiceList = getVoiceListString();

    const knowledgeBaseBlock = knowledgeBaseText
        ? `\n\n**Knowledge Base (Sole Source of Facts):**\n---\n${knowledgeBaseText}\n---`
        : "";

    return `You are an AI screenwriter and YouTube producer. Your task is to create a complete package of materials for a compelling YouTube video on the topic: "${topic}".
    
    **CRITICAL INSTRUCTION: Generate all text content STRICTLY in the following language: ${language}.**
    **EXCEPTION: All search keywords (for images, music, and SFX) MUST be in English.**

    ${sourceInstruction}
    ${styleInstruction}

    **AVAILABLE VOICES:**
    Select the most appropriate voice ID for each character from this list:
    ${voiceList}

    **General Task Requirements:**
    1.  **Characters:** Create two unique characters (e.g., "Skeptic & Believer", "Host & Historian"). 
        - **Crucial:** Assign a 'suggestedVoiceId' from the list above that perfectly matches their personality and gender.
    2.  **YouTube Assets:** Create YouTube-optimized text assets.
    3.  **Script:** Write the script for the FIRST CHAPTER (approx 7-8 mins). **Total text volume: 8500-9500 chars.**
        - **DIALOGUE MODE:** This must be a REAL dialogue. Short exchanges, reactions, interruptions, questions. Avoid long monologues (max 3-4 sentences per turn). It should feel like a live conversation.
    4.  **Sound Design:** Add 3-5 relevant SFX cues.
    5.  **Visuals:** Provide 3 English prompts for image generation for this chapter.

    Return the result as a SINGLE VALID JSON OBJECT in \`\`\`json ... \`\`\`.

    **JSON Structure:**
    {
      "youtubeTitleOptions": [ "Array of 3-5 clickable titles in ${language}" ],
      "description": "Detailed description in ${language} with CTA.",
      "seoKeywords": ["list", "of", "tags", "in", "${language}"],
      "visualSearchPrompts": [ "3 unique English prompts for Chapter 1 visuals" ],
      "characters": [
        { "name": "Name 1", "description": "Description in ${language}", "suggestedVoiceId": "VoiceID_From_List" },
        { "name": "Name 2", "description": "Description in ${language}", "suggestedVoiceId": "VoiceID_From_List" }
      ],
      "chapter": {
        "title": "Chapter 1 Title in ${language}",
        "musicSearchKeywords": "English keywords for music",
        "script": [
          { "speaker": "SFX", "text": "SFX description", "searchKeywords": "English keywords for SFX" },
          { "speaker": "Name 1", "text": "Dialogue text in ${language}..." },
          { "speaker": "Name 2", "text": "Response in ${language}..." }
        ]
      }
    }${knowledgeBaseBlock}`;
};


export const getQuickTestBlueprintPrompt = (topic: string, language: string): string => `
You are an AI screenwriter creating a quick test package for a YouTube video on the topic: "${topic}".
    
**CRITICAL INSTRUCTION: Generate all user-facing text content STRICTLY in ${language}. All API keywords MUST be in English.**

Your task is to generate a minimal set of assets for a short, 1-minute video. The script's total text volume must be around 800-900 characters.
    
**Return the result as a SINGLE VALID JSON OBJECT in \`\`\`json ... \`\`\`.**

**JSON Structure:**
{
  "youtubeTitleOptions": [ "A single, catchy title in ${language}" ],
  "description": "Short description in ${language}.",
  "seoKeywords": ["tags", "in", "${language}"],
  "visualSearchPrompts": [ "ONE detailed English prompt for image." ],
  "characters": [
    { "name": "Host", "description": "Male host.", "suggestedVoiceId": "Puck" },
    { "name": "Expert", "description": "Female expert.", "suggestedVoiceId": "Zephyr" }
  ],
  "chapter": {
    "title": "Quick Test: ${topic}",
    "musicSearchKeywords": "English keywords",
    "script": [
      { "speaker": "Host", "text": "Opening line in ${language}..." },
      { "speaker": "SFX", "text": "SFX description", "searchKeywords": "English SFX keywords" },
      { "speaker": "Expert", "text": "Response in ${language}..." }
    ]
  }
}`;

export const getNextChapterPrompt = (topic: string, podcastTitle: string, characters: { name: string, description: string }[], previousSummary: string, chapterIndex: number, knowledgeBaseText: string, creativeFreedom: boolean, language: string): string => {
    const characterDescriptions = characters.map(c => `- ${c.name}: ${c.description}`).join('\n');
    
    const styleInstruction = creativeFreedom
        ? "Continue the story in a captivating and atmospheric style. Deepen the mystery."
        : "Continue in a strict documentary style.";
    
    const sourceInstruction = knowledgeBaseText
        ? "Rely STRICTLY on the provided 'Knowledge Base'."
        : "";
        
    const knowledgeBaseBlock = knowledgeBaseText
        ? `\n\n**Knowledge Base (Source of Facts):**\n---\n${knowledgeBaseText}\n---`
        : "";

    return `You are a master of suspense, an AI screenwriter continuing a long-form podcast.

    Podcast Topic: "${topic}"
    Podcast Title: "${podcastTitle}"
    Characters:
    ${characterDescriptions}
    Summary of previous chapters:
    ${previousSummary}

    **CRITICAL INSTRUCTION: Generate all text content STRICTLY in ${language}. All search keywords MUST be in English.**

    Your task: write the script for the NEXT, ${chapterIndex + 1}-th chapter.
    - **Script Length:** Approx 7-8 minutes. **Total text volume: 8500-9500 characters.**
    - **Sound Design:** Add 3-5 relevant SFX cues.
    - **Visuals:** Provide 3 English prompts for images.
    - **DIALOGUE MODE:** Maintain a dynamic, interactive conversation. Short turns. NO long lectures.
    - ${styleInstruction}
    ${sourceInstruction}
    
    Return the result as a SINGLE VALID JSON OBJECT in \`\`\`json ... \`\`\`.
    Structure: {
        "title": "Chapter Title in ${language}",
        "musicSearchKeywords": "English music keywords",
        "visualSearchPrompts": ["Prompt 1", "Prompt 2", "Prompt 3"],
        "script": [
            { "speaker": "SFX", "text": "SFX description", "searchKeywords": "English SFX keywords" },
            { "speaker": "${characters[0].name}", "text": "Dialogue in ${language}..." }
        ]
    }${knowledgeBaseBlock}`;
};

export const getRegenerateTextPrompt = (topic: string, creativeFreedom: boolean, language: string): string => `
You are a YouTube marketing expert. Create new, engaging text materials for a video on: "${topic}".
    
**CRITICAL INSTRUCTION: Generate all text content STRICTLY in ${language}.**
    
Style: ${creativeFreedom ? "Fictional, mystical, intriguing." : "Documentary, strict, informative."}

Return the result as a SINGLE VALID JSON OBJECT in \`\`\`json ... \`\`\`.

**JSON Structure:**
{
  "youtubeTitleOptions": ["Array of 3-5 new titles in ${language}."],
  "description": "New detailed description in ${language} with CTA.",
  "seoKeywords": ["new", "list", "of", "tags", "in", "${language}"]
}`;

export const getThumbnailConceptsPrompt = (topic: string, language: string): string => `
You are an expert in creating viral, high-CTR YouTube thumbnails.
Topic: "${topic}". 

**TASK:** Propose 3 **DISTINCTLY DIFFERENT** design concepts. They MUST NOT look alike.
1.  **Concept 1:** High contrast, bold, shocking colors (e.g., Yellow/Black). Font: Impact, Anton.
2.  **Concept 2:** Mysterious, atmospheric, serif fonts, dark palette (e.g., Red/DarkBlue). Font: Playfair Display, Roboto Slab.
3.  **Concept 3:** Modern, minimal, clean sans-serif, neon accents. Font: Montserrat, Bebas Neue.

**CRITICAL INSTRUCTION: For 'fontFamily', suggest specific Google Fonts (e.g., 'Anton', 'Bebas Neue', 'Playfair Display'). Response must be in ${language}.**

Return the result as a SINGLE VALID JSON OBJECT in \`\`\`json ... \`\`\`.

**JSON Structure:**
{
  "concepts": [
    {
      "name": "Unique name for concept 1",
      "fontFamily": "Anton",
      "fontSize": 100,
      "textColor": "#FFFF00",
      "shadowColor": "#000000",
      "overlayOpacity": 0.3,
      "textTransform": "uppercase",
      "strokeColor": "#000000",
      "strokeWidth": 12,
      "gradientColors": null
    },
    {
      "name": "Unique name for concept 2",
      "fontFamily": "Playfair Display",
      "fontSize": 90,
      "textColor": "#FFFFFF",
      "shadowColor": "#550000",
      "overlayOpacity": 0.6,
      "textTransform": "none",
      "strokeColor": "transparent",
      "strokeWidth": 0,
      "gradientColors": null
    },
    {
      "name": "Unique name for concept 3",
      "fontFamily": "Montserrat",
      "fontSize": 110,
      "textColor": "#00FFFF",
      "shadowColor": "transparent",
      "overlayOpacity": 0.4,
      "textTransform": "uppercase",
      "strokeColor": "#000000",
      "strokeWidth": 5,
      "gradientColors": ["#00FFFF", "#FF00FF"]
    }
  ]
}`;

export const getMusicKeywordsPrompt = (topic: string): string => `
Analyze the mood of: "${topic}". Generate a search query for Jamendo.

Instructions:
1.  Identify primary mood and genre.
2.  Combine into 2-3 English keywords.
3.  Return ONLY the comma-separated English keywords.

Example: dark, ambient, cinematic
        
Text: "${topic}"
Keywords:`;

export const getSfxKeywordsPrompt = (description: string): string => `
Analyze sound effect description: "${description}".
Generate 2-3 English search keywords for Freesound.org.
Focus on core sound.

Example: "Heavy door creak": heavy door creak

Description: "${description}"
Keywords:`;
