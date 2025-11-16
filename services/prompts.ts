// services/prompts.ts

export const prompts = {
  jsonCorrection: (malformedJson: string) => `
    The following text is a malformed JSON response from an API. Please correct any syntax errors (like trailing commas, missing brackets, or unescaped quotes) and return ONLY the valid JSON object. Do not include any explanatory text or markdown formatting like \`\`\`json.

    Malformed JSON:
    ${malformedJson}`,

  youtubeBlueprint: (
    topic: string,
    duration: number,
    style: string,
    characterPrompt: string,
    sourceInstruction: string,
    language: string
  ) => `
    Create a detailed plan for a ${duration}-minute YouTube podcast about "${topic}".
    The output must be a single valid JSON object in \`\`\`json ... \`\`\`.
    The language for all generated text must be: ${language}.
    The podcast should be in the style of ${style}.
    ${sourceInstruction}

    **IMPORTANT YOUTUBE INTEGRATION:**
    1.  **Hook:** Start the script of the first chapter with a strong, intriguing hook (1-2 sentences) to grab the viewer's attention immediately.
    2.  **Call to Action:** In the final chapter, include a natural-sounding call to action asking viewers to "like the video," "subscribe to the channel," and "click the notification bell for more content."
    3.  **Outro:** End the script with an outro that suggests watching another video on the channel about a related topic.

    The JSON must have this exact structure:
    {
      "youtubeTitleOptions": ["Clickable Title 1", "SEO-Friendly Title 2", "Intriguing Title 3"],
      "description": "A 2-3 paragraph SEO-optimized description for the YouTube video.",
      "seoKeywords": ["keyword1", "keyword2", "keyword3"],
      ${characterPrompt}
      "chapters": [
        {
          "title": "Title of Chapter 1",
          "script": [
            { "speaker": "CharacterName", "text": "The first line of dialogue or narration (this must be the hook)." },
            { "speaker": "SFX", "text": "Sound of wind and rain", "searchTags": "wind, rain, storm" }
          ],
          "imagePrompts": [
            "A detailed, cinematic prompt for an AI image generator for the first scene.",
            "A detailed prompt for the second scene.",
            "A detailed prompt for the third scene."
          ]
        }
      ]
    }`,

  nextChapter: (
    topic: string,
    mainTitle: string,
    context: string,
    chapterIndex: number,
    style: string,
    sourceInstruction: string,
    language: string,
    isFinalChapter: boolean
  ) => {
    let youtubeIntegration = `Maintain an engaging narrative style. In the middle of the script, you can naturally ask viewers to "share their thoughts in the comments below."`;
    if (isFinalChapter) {
        youtubeIntegration = `This is the final chapter. Conclude the main story, and then naturally include a call to action for viewers to "like, subscribe, and click the bell for more mysteries." Finish with an outro suggesting a related video topic for them to watch next on the channel.`;
    }

    return `
      You are writing a multi-part podcast about "${topic}". The main title is "${mainTitle}".
      You have already written ${chapterIndex} chapters.
      Context of previous chapters:\n${context}\n
      Now, write the script for Chapter ${chapterIndex + 1}. Continue the story logically.
      The style is: ${style}. The language is: ${language}.
      ${sourceInstruction}
      
      **YouTube Integration:** ${youtubeIntegration}

      The output must be a single valid JSON object in \`\`\`json ... \`\`\` with this exact structure:
      {
        "title": "Title of Chapter ${chapterIndex + 1}",
        "script": [
          { "speaker": "Narrator or Expert", "text": "Line of dialogue." },
          { "speaker": "SFX", "text": "Description of a sound effect", "searchTags": "relevant, search, tags" }
        ],
        "imagePrompts": [
          "Detailed AI image prompt for scene 1.",
          "Detailed AI image prompt for scene 2.",
          "Detailed AI image prompt for scene 3."
        ]
      }`;
    },

  sfxKeywords: (description: string) => `
    For the following sound effect description, generate a simple, effective search query of 2-3 English keywords for a sound library like Freesound.org.
    
    Description: "${description}"
    
    Return ONLY the comma-separated keywords.
    
    Example for "A heavy wooden door creaking open": 
    door, wood, creak
    
    Keywords:`,
    
  batchSfxKeywords: (sfxDescriptions: string[]) => `
    For each of the following ${sfxDescriptions.length} sound effect descriptions, generate a simple, effective search query of 2-3 English keywords for a sound library like Freesound.org.

    Descriptions:
    ${sfxDescriptions.map((d, i) => `${i + 1}. "${d}"`).join('\n')}

    Return the result as a SINGLE VALID JSON OBJECT in \`\`\`json ... \`\`\`.

    **JSON Structure:**
    {
      "keywords": [
        "keywords for description 1",
        "keywords for description 2",
        ...
      ]
    }`,

  thumbnailDesigns: (topic: string, language: string) => `
    Create 4 diverse, high-CTR YouTube thumbnail design concepts for a video about "${topic}". The language is ${language}.
    Inspired by top creators like MrBeast, Vox, and popular documentary channels.
    Return a single valid JSON array in \`\`\`json ... \`\`\`.
    Each object must have this structure:
    {
      "name": "Style Name (e.g., 'MrBeast High Contrast')",
      "fontFamily": "A suitable font from Google Fonts (e.g., 'Impact', 'Bebas Neue')",
      "fontSize": 120,
      "textColor": "#FFFF00",
      "shadowColor": "rgba(0,0,0,0.8)",
      "overlayOpacity": 0.3,
      "strokeColor": "#000000",
      "strokeWidth": 15,
      "gradientColors": ["#FFFF00", "#FFD700"],
      "textTransform": "uppercase"
    }`,

  musicTags: (scriptText: string) => `
    Analyze the mood, tempo, and theme of the following text.
    Generate 3 diverse sets of search tags for finding background music on a service like Jamendo.
    Each set should be a few keywords. Focus on instrument, mood, and genre.
    
    Text: "${scriptText.substring(0, 1000)}..."
    
    Return a single valid JSON object in \`\`\`json ... \`\`\`.
    { "tag_sets": [ "tagset 1", "tagset 2", "tagset 3" ] }`,
    
  simplifyForStock: (aiPrompt: string) => `
    Simplify this AI image generation prompt for stock photo search.
    Remove technical terms: cinematic, hyperrealistic, 8k, ultra-detailed, dramatic lighting, etc.
    Keep only: main objects, atmosphere, colors.
    Output only the simplified query, nothing else.
    
    AI Prompt: "${aiPrompt}"
    
    Simplified query:`,

  translateToEnglish: (query: string) => `Translate to English (output only translation): "${query}"`,
};
