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
        ? `**Style Requirements (Lovecraftian Realism & YouTube Optimization):**
    - **Atmosphere & Tone:** Create an atmosphere of COSMIC DREAD and psychological tension. Write in the spirit of H.P. Lovecraft — never name him, but embody his style. Focus on:
      * The insignificance of humanity before ancient, incomprehensible forces
      * Psychological terror, not gore
      * Gradual revelation of disturbing truths
      * Realistic, grounded setting that makes the horror more believable
      * Subtle hints at something wrong, building to overwhelming dread
    - **Narrative Approach:** Present the historical facts FIRST as solid ground. Then slowly, carefully introduce unexplained details, anomalies, and patterns. Let the horror emerge naturally from contradictions in the evidence.
    - **Opening Hook (CRITICAL):** The first 3 dialogue exchanges MUST grab attention immediately:
      * Open with a shocking fact, unsettling quote, or disturbing question
      * Create immediate tension or curiosity
      * Make the viewer want to know what happened next
    - **YouTube Engagement (Woven Throughout):**
      * After establishing intrigue (3-4 min mark): "If you're already feeling the weight of this mystery, hit that subscribe button — we go deep into stories like this every week"
      * Mid-point tension release (12-15 min): "What do YOU think happened here? Drop your theories in the comments below"
      * Before final revelation (18-20 min): "If this story is pulling you in, you'll want to see our next episode on [related topic] — link in the description"
      * Closing CTA: "Thanks for joining us in the darkness. Until next time, stay curious... and stay safe."
    - **Keep it REAL:** No fantasy elements, no magic. Everything must have a plausible, realistic explanation... except for the one thing that CAN'T be explained. That's where the true horror lives.`
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
    1.  **Characters:** Create two unique characters (e.g., "Host & Researcher", "Skeptic & Historian"). 
        - **Crucial:** Assign a 'suggestedVoiceId' from the list above that perfectly matches their personality and gender.
        - For Lovecraftian style: one should be more analytical/skeptical, the other more open to disturbing possibilities
    2.  **YouTube Assets:** Create YouTube-optimized text assets.
    3.  **Script:** Write the script for the FIRST CHAPTER (approx 7-8 mins). **Total text volume: 8500-9500 chars.**
        - **DIALOGUE MODE:** This must be a REAL, dynamic conversation:
          * Short exchanges (2-3 sentences max per turn)
          * Natural reactions and interruptions
          * Questions that pull the listener deeper
          * Building tension through pacing
          * One character often challenges or questions the other
        - **Structure the chapter to END at a natural break point** — a cliffhanger, revelation, or transition moment that makes sense
        - **Each chapter should feel COMPLETE while leaving questions unanswered**
    4.  **Sound Design:** Add 3-5 ATMOSPHERIC SFX cues (creaking, wind, distant sounds, footsteps, paper rustling).
    5.  **Visuals:** Provide 3 English prompts for HORIZONTAL, REALISTIC images (historical photos, locations, artifacts, documents).

    Return the result as a SINGLE VALID JSON OBJECT in \`\`\`json ... \`\`\`.

    **JSON Structure:**
    {
      "youtubeTitleOptions": [ "Array of 3-5 clickable titles in ${language}" ],
      "description": "Detailed description in ${language} with CTA.",
      "seoKeywords": ["list", "of", "tags", "in", "${language}"],
      "visualSearchPrompts": [ "3 unique English prompts for HORIZONTAL Chapter 1 visuals (e.g., 'abandoned asylum hallway 1950s america', 'vintage medical records old paper', 'foggy forest path new england')" ],
      "characters": [
        { "name": "Name 1", "description": "Description in ${language}", "suggestedVoiceId": "VoiceID_From_List" },
        { "name": "Name 2", "description": "Description in ${language}", "suggestedVoiceId": "VoiceID_From_List" }
      ],
      "chapter": {
        "title": "Chapter 1 Title in ${language}",
        "musicSearchKeywords": "English keywords specifically for dark, atmospheric music (e.g., 'dark ambient cinematic horror', 'eerie atmospheric drone', 'unsettling orchestral tension')",
        "script": [
          { "speaker": "Name 1", "text": "Opening hook in ${language}..." },
          { "speaker": "Name 2", "text": "Response in ${language}..." },
          { "speaker": "SFX", "text": "SFX description (e.g., 'distant creaking door')", "searchKeywords": "English keywords for SFX (e.g., 'creaking door old wood')" }
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
  "visualSearchPrompts": [ "ONE detailed English prompt for HORIZONTAL image (e.g., 'abandoned hospital corridor dark atmosphere')." ],
  "characters": [
    { "name": "Host", "description": "Male host.", "suggestedVoiceId": "Puck" },
    { "name": "Expert", "description": "Female expert.", "suggestedVoiceId": "Zephyr" }
  ],
  "chapter": {
    "title": "Quick Test: ${topic}",
    "musicSearchKeywords": "dark atmospheric ambient (English keywords)",
    "script": [
      { "speaker": "Host", "text": "Opening line in ${language}..." },
      { "speaker": "SFX", "text": "SFX description", "searchKeywords": "English SFX keywords (e.g., 'wind howling')" },
      { "speaker": "Expert", "text": "Response in ${language}..." }
    ]
  }
}`;

export const getNextChapterPrompt = (topic: string, podcastTitle: string, characters: { name: string, description: string }[], previousSummary: string, chapterIndex: number, knowledgeBaseText: string, creativeFreedom: boolean, language: string): string => {
    const characterDescriptions = characters.map(c => `- ${c.name}: ${c.description}`).join('\n');
    
    const styleInstruction = creativeFreedom
        ? `**Continue the Lovecraftian narrative:**
        - Maintain the atmosphere of cosmic dread and psychological tension
        - Build on the mysteries established in previous chapters
        - Deepen the sense that something fundamental is wrong
        - Add new disturbing details or contradictions
        - Move the story forward while preserving the horror
        - **CRITICAL: This chapter must END at a natural stopping point** — complete its narrative arc while leaving larger mysteries unresolved
        - **The chapter should feel like a complete segment**, not like it was cut mid-sentence
        - Use pacing: slow reveals, building tension, moments of realization`
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
    - **Sound Design:** Add 3-5 ATMOSPHERIC SFX cues (creaking, wind, footsteps, distant sounds).
    - **Visuals:** Provide 3 English prompts for HORIZONTAL realistic images (historical locations, documents, artifacts).
    - **DIALOGUE MODE:** Maintain a dynamic, interactive conversation. Short turns (2-3 sentences). Natural reactions.
    - **STRUCTURE:** This chapter should have a COMPLETE narrative arc with a clear ending point (cliffhanger, revelation, or transition). It should NOT feel cut off mid-thought.
    - ${styleInstruction}
    ${sourceInstruction}
    
    Return the result as a SINGLE VALID JSON OBJECT in \`\`\`json ... \`\`\`.
    Structure: {
        "title": "Chapter Title in ${language}",
        "musicSearchKeywords": "English keywords for dark atmospheric music (e.g., 'dark ambient horror tension')",
        "visualSearchPrompts": ["HORIZONTAL English prompt 1 (e.g., 'old abandoned building interior')", "Prompt 2", "Prompt 3"],
        "script": [
            { "speaker": "${characters[0].name}", "text": "Dialogue in ${language}..." },
            { "speaker": "SFX", "text": "SFX description", "searchKeywords": "English SFX keywords (e.g., 'creaking floorboards old house')" }
        ]
    }${knowledgeBaseBlock}`;
};

export const getRegenerateTextPrompt = (topic: string, creativeFreedom: boolean, language: string): string => `
You are a YouTube marketing expert. Create new, engaging text materials for a video on: "${topic}".
    
**CRITICAL INSTRUCTION: Generate all text content STRICTLY in ${language}.**
    
Style: ${creativeFreedom ? "Lovecraftian thriller — atmospheric, mysterious, psychologically unsettling. Make the viewer WANT to know what dark secret lies beneath." : "Documentary, strict, informative."}

Return the result as a SINGLE VALID JSON OBJECT in \`\`\`json ... \`\`\`.

**JSON Structure:**
{
  "youtubeTitleOptions": ["Array of 3-5 new CLICKABLE titles in ${language} that create curiosity and dread"],
  "description": "New detailed description in ${language} with CTA. ${creativeFreedom ? 'Set the dark atmosphere immediately.' : 'Professional and informative.'}",
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
You are a music curator for atmospheric, Lovecraftian horror content. 

Analyze the mood and theme of: "${topic}"

Your task is to generate 3-5 SPECIFIC English search keywords for finding background music on Jamendo that matches this Lovecraftian aesthetic:
- Dark, brooding, atmospheric
- Cinematic and immersive
- Tension-building
- Orchestral, ambient, or drone
- NO upbeat, happy, or energetic music
- NO metal or aggressive genres

Focus on descriptive mood words combined with genre tags.

**Examples of GOOD keywords:**
- "dark ambient cinematic horror"
- "eerie atmospheric drone"
- "ominous orchestral tension"
- "unsettling soundscape mystery"
- "creepy ambient experimental"

**Examples of BAD keywords:**
- "horror" (too generic)
- "scary music" (too vague)
- "rock" (wrong genre)

Based on the topic "${topic}", generate the PERFECT music search keywords.

**Return ONLY the keywords as a comma-separated list in English. No explanations.**

Keywords:`;

export const getSfxKeywordsPrompt = (description: string): string => `
Analyze sound effect description: "${description}".
Generate 2-3 SPECIFIC English search keywords for Freesound.org that will find the exact atmospheric sound effect needed.

Focus on:
- Core sound object (door, wind, footsteps, etc.)
- Material/texture (wood, metal, paper, etc.)
- Quality/atmosphere (old, creaking, distant, etc.)

**Example:** "Heavy door creak" → "heavy door creak wood old"

Description: "${description}"
Keywords:`;