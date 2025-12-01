// services/prompts.ts
import { getVoiceListString } from '../config/voices';

/**
 * RETENTION ANCHORS SYSTEM
 * 
 * Назначение: Обеспечить удержание внимания аудитории 50+ на протяжении 40-50 минут
 * 
 * Принцип работы:
 * - Каждые 8-10 минут AI должен вставить один из типов "якорей"
 * - Якоря располагаются естественно в повествовании, не выглядят искусственно
 * - Каждый якорь дает зрителю четкую причину продолжать просмотр
 * 
 * Целевые метрики:
 * - Снижение drop-off rate на отметках 15, 25, 35 минут
 * - Увеличение average view duration с 19 мин до 30+ мин
 */
export const getRetentionAnchorsInstructions = (): string => `
**RETENTION STRUCTURE FOR 40-50 MINUTE VIDEO (50+ AUDIENCE):**

This is CRITICAL for keeping viewers engaged. Your video MUST follow this structure:

**MINUTE 0-2: HOOK ANCHOR (Opening Impact)**
Purpose: Grab attention immediately, create urgency to keep watching
Technique: Start with the most shocking/intriguing element
Examples:
- "In 1952, twelve Air Force pilots vanished. Their planes were found... but they weren't inside."
- "A photograph taken in 1889 shows something that shouldn't exist yet."
- "What if everything you know about [event] is backwards?"

DO: Start with mystery/contradiction
DON'T: Start with background information

---

**MINUTE 8-10: FIRST REVELATION ANCHOR**
Purpose: Reward viewer for watching first segment, prove video has substance
Technique: Reveal first surprising fact that contradicts common knowledge
Examples:
- "Official records say X, but declassified documents show Y..."
- "For 70 years, historians believed [A]. Then in 2019, a researcher found [B]..."
- "The testimony everyone cites? It was edited. Here's the original version..."

DO: Use specific dates, documents, sources
DON'T: Give vague "some say" claims

---

**MINUTE 18-20: PATTERN RECOGNITION ANCHOR**
Purpose: Show this isn't isolated incident - there's a bigger picture
Technique: Connect 2-3 seemingly unrelated events
Examples:
- "This wasn't the first time. In 1967... then again in 1983... same pattern."
- "Three witnesses, different locations, same exact description. Coincidence?"
- "Look at these dates: [list]. They're all exactly 11 years apart."

DO: Use visual/temporal patterns
DON'T: Make conspiracy theory leaps

---

**MINUTE 28-30: AUTHORITY ANCHOR (Expert Validation)**
Purpose: Re-establish credibility, give intellectual permission to keep watching
Technique: Reference credible expert, institution, or newly available evidence
Examples:
- "Dr. [Name], professor at [Institution] for 40 years, stated in 2022..."
- "The Smithsonian finally opened these archives in 2020, revealing..."
- "A peer-reviewed study published in [Journal] confirms what witnesses said..."

DO: Use real credentials, institutions, publication dates
DON'T: Quote anonymous "experts"

---

**MINUTE 38-40: EMOTIONAL STAKES ANCHOR**
Purpose: Make it personal, show human impact
Technique: Tell individual story of someone affected
Examples:
- "For Mary Thompson, 67, who witnessed this as a child, it never left her..."
- "John's family has kept this secret for three generations. Until now."
- "The last surviving member of the expedition is 89 now. This is what he told us..."

DO: Use specific ages, names, personal details
DON'T: Make it melodramatic

---

**MINUTE 45-48: THE FINAL TWIST ANCHOR**
Purpose: Pay off the investment, give satisfying revelation
Technique: Present unexpected evidence or connection that reframes everything
Examples:
- "But here's what changes everything: in 2023, a researcher found [X]..."
- "The answer was in the one place no one looked: [unexpected source]..."
- "This detail, overlooked for decades, explains it all..."

DO: Make it genuinely surprising but logical in hindsight
DON'T: Invent evidence

---

**MINUTE 48-50: OPEN LOOP ANCHOR (Next Video Tease)**
Purpose: Convert viewer into subscriber, promise more value
Technique: Connect to related mystery for next episode
Examples:
- "This connects to an even stranger case we'll explore next week..."
- "But one question remains unanswered - and that's where our next investigation begins..."
- "The same pattern appeared in [Location] in [Year]. That story is next."

DO: Make clear this is part of larger series
DON'T: Make vague "stay tuned" promise

---

**CRITICAL RULES:**
1. These anchors must feel NATURAL in the narrative flow
2. Each anchor should be a GENUINE payoff, not cheap tricks
3. Space them 8-10 minutes apart (not exactly, but roughly)
4. Each provides RATIONAL reason to keep watching (appeals to intellect, not just emotion)
5. Use specific facts, dates, names - this audience values accuracy
`;

/**
 * CHARACTER DESIGN FOR 50+ AUDIENCE
 */
const getCharacterDesignInstructions = (): string => `
**CHARACTER DESIGN FOR 50+ AUDIENCE (TIER 1 COUNTRIES):**

You are creating characters for a mature, educated, English-speaking audience aged 50-70 from USA, Canada, UK, Australia.

This audience:
- Has decades of life experience
- Values expertise and credibility
- Detects fake authority instantly
- Appreciates intellectual depth
- Dislikes being talked down to
- Prefers reflection over reaction

---

**CHARACTER 1: "THE RESEARCHER" (Primary Authority)**

**Demographics (implied, never stated):**
- Age range: 55-70
- Background: Academic, investigative, or professional expertise
- Nationality: American, British, Canadian, or Australian (native English speaker)

**Voice Characteristics:**
- Tone: Measured, thoughtful, professorial yet approachable
- Pace: Deliberate, unhurried (speaks to think, not just to fill silence)
- Vocabulary: Sophisticated but accessible (no jargon without explanation)

**Speech Patterns (use these structures):**
1. Experience references:
   - "In my [number] years of studying this..."
   - "Back in [decade], when I first encountered..."
   - "I've examined over [number] cases, and this one stands out because..."

2. Source citations:
   - "According to declassified documents from [institution]..."
   - "Dr. [Name], who worked at [place] for [timeframe], stated..."
   - "A peer-reviewed study in [Journal] found..."

3. Intellectual humility:
   - "We still don't fully understand why..."
   - "The evidence suggests, but doesn't prove..."
   - "I'll admit, this puzzles me too..."

4. Reflective thinking:
   - "Let me think about how to explain this..." [pause]
   - "That's an excellent question. Consider this..."
   - "When you put it that way, yes, there is a contradiction..."

**What this character DOES:**
✅ Provides specific dates, names, locations
✅ References archival sources
✅ Acknowledges uncertainty where it exists
✅ Builds arguments step by step
✅ Uses analogies to complex concepts

**What this character NEVER does:**
❌ Says "trust me" without evidence
❌ Uses slang or internet speak
❌ Makes absolute claims without sourcing
❌ Dismisses questions as stupid
❌ Hurries through explanations

---

**CHARACTER 2: "THE SKEPTICAL ANALYST" (Audience Proxy)**

**Demographics (implied, never stated):**
- Age range: 50-65
- Background: Educated generalist, curious mind
- Role: Represents viewer's thought process

**Voice Characteristics:**
- Tone: Curious, questioning, respectfully challenging
- Pace: Slightly faster than Researcher (shows engagement)
- Vocabulary: Intelligent layperson (asks for clarification when needed)

**Speech Patterns (use these structures):**
1. Clarifying questions:
   - "Wait, let me make sure I understand..."
   - "So you're saying that [summary]. Do I have that right?"
   - "Help me connect the dots here..."

2. Voicing doubts:
   - "But how do we explain [contradiction]?"
   - "Couldn't this also be [alternative explanation]?"
   - "I'm having trouble reconciling [A] with [B]..."

3. Summarizing for audience:
   - "So the key point is..."
   - "What we know for sure is..."
   - "Let me see if I can recap this..."

4. Expressing genuine curiosity:
   - "That's fascinating. What led you to that conclusion?"
   - "I've never thought about it that way..."
   - "That raises an interesting question..."

**What this character DOES:**
✅ Asks "obvious" questions viewers might have
✅ Requests clarification without embarrassment
✅ Proposes alternative explanations
✅ Summarizes complex points in simpler terms
✅ Expresses appropriate skepticism

**What this character NEVER does:**
❌ Accepts claims at face value
❌ Sounds unintelligent or confused
❌ Interrupts rudely
❌ Uses dismissive language ("whatever", "no way")
❌ Pretends to understand when doesn't

---

**DIALOGUE DYNAMICS:**

**Pacing for 50+ Comprehension:**
- Sentence pause: 0.8-1.5 seconds (longer than Gen Z content)
- Between speakers: 1-2 seconds
- Before revelation: 2-3 seconds
- After major point: 3-5 seconds for reflection

**Turn-taking rhythm:**
Short-Medium-Short-Long pattern example:

Researcher: "The file was opened in 2019." [SHORT - 1 sentence]
[1.5 second pause]

Analyst: "That's recent. What prompted them to declassify it after all this time?" [MEDIUM - 2 sentences]
[2 second pause]

Researcher: "Excellent question." [SHORT - reaction]
[1 second pause]

Researcher: "In 2017, a FOIA request was filed by a researcher at Columbia. It took two years to process, and when it finally came through, what they found was... unexpected. The original investigation had been misclassified for 70 years - not because it was sensitive, but because of a filing error. Once corrected, there was no legal reason to keep it sealed." [LONG - detailed explanation, 4 sentences]
[4 second pause for impact]

Analyst: "A filing error. Seventy years of mystery... because of bureaucracy." [MEDIUM - reflective summary]

**Intellectual Respect:**
- Both characters are intelligent
- They collaborate, not compete
- Disagreement is respectful: "I see your point, though I'd interpret it differently..."
- They model critical thinking for audience

**Age-Appropriate References:**
- DO reference: Historical events from 1950s-2000s, classic literature, established science
- DON'T reference: TikTok trends, memes, current slang, pop culture younger than 2010

**Example of GOOD dialogue:**

Researcher: "Let me walk you through the timeline. 1947: the incident occurs. 1952: the first official investigation, but the files are sealed. 1983: a researcher requests access under FOIA, denied. 2019: finally declassified. Notice the pattern?"

Analyst: "Thirty-one years between the incident and first investigation. Another thirty-one years before someone tries to access it. Then thirty-six more years until release. Is there significance to those intervals?"

Researcher: "That's what I wondered too. But when you dig into the bureaucratic history of these agencies, you realize... it's likely just how long it takes for institutional memory to fade. The people who knew why it was sensitive retire, die, move on. Eventually, no one remembers why it was secret in the first place."

Analyst: "So the conspiracy isn't a cover-up. It's organizational inertia."

Researcher: "Precisely. Though that doesn't explain what actually happened in 1947. That's where it gets interesting..."

**Why this works for 50+:**
- Specific dates create credibility
- Analyst asks intelligent questions
- Researcher explains reasoning, not just facts
- Thoughtful pacing allows comprehension
- No condescension, no hype
- Treats viewers as peers

---

**INTEGRATION INTO SCRIPT:**

When generating dialogue, ensure:

1. **Opening (First 2 minutes):**
   - Researcher presents intriguing hook
   - Analyst reacts with genuine curiosity (not fake surprise)

2. **Body (Minutes 3-45):**
   - Alternate between evidence presentation and questioning
   - Use Analyst to voice viewer doubts
   - Researcher provides sources and reasoning

3. **Closing (Final 5 minutes):**
   - Both characters reflect on implications
   - Acknowledge what remains unknown
   - Tease next episode naturally

**Quality check:**
Read the dialogue aloud. Does it sound like two intelligent people in their 50s-60s having a genuine conversation? Or does it sound like a script for younger viewers? Adjust accordingly.
`;

/**
 * MICRO-CONCLUSION SYSTEM
 */
const getMicroConclusionInstructions = (): string => `
**MICRO-CONCLUSION SYSTEM (ESSENTIAL FOR 50+ RETENTION)**

Purpose: Prevent viewer fatigue, provide sense of progress, maintain engagement over 40-50 minutes.

Problem: In long-form content, viewers lose track of "what have I learned?" and "why am I still watching?"

Solution: Every 10 minutes, insert a 60-90 second MICRO-CONCLUSION segment.

---

**STRUCTURE OF A MICRO-CONCLUSION:**

**Step 1: SUMMARIZE (30 seconds)**
The Researcher character explicitly lists what has been established:

Template:
"Let's pause here and review what we've established in [this segment/the last ten minutes].

We've learned [number] key things:
1. [Fact/Finding A] - [source/evidence]
2. [Fact/Finding B] - [source/evidence]  
3. [Fact/Finding C] - [source/evidence]

These aren't theories. These are [documented facts/confirmed evidence/verified testimonies]."

Key phrases to use:
- "Let's take stock of what we know"
- "Let me summarize what we've established"
- "Here's what we've uncovered so far"
- "Let's consolidate our findings"

**Step 2: VALIDATE (15 seconds)**
The Analyst character confirms the value:

Template:
Analyst: "So [we're not just speculating / we have actual evidence / this is documented]."

Researcher: "[Exactly / Precisely / That's correct]. [Transition phrase]..."

This validates viewer's time investment.

**Step 3: PIVOT TO NEXT QUESTION (30 seconds)**
Open new mystery loop to maintain momentum:

Template:
"...because that raises an even [bigger question / more intriguing question / deeper mystery]:

If [established fact A] is true, and [established fact B] is true, then [why / how / what explains] [new question]?

That's what we need to [explore / investigate / uncover] next."

Key transition phrases:
- "But that raises a question..."
- "Which brings us to..."
- "That's where it gets really interesting..."
- "This is where the mystery deepens..."

---

**TIMING:**

Insert Micro-Conclusions at these approximate timestamps:

| Minute Mark | After Content Type |
|-------------|-------------------|
| 9-10 min    | Initial evidence gathering |
| 19-20 min   | Pattern identification |
| 29-30 min   | Expert analysis/authority anchor |
| 39-40 min   | Emotional stakes/personal stories |

Do NOT place at exactly 10, 20, 30, 40 - it will feel mechanical.
Place them naturally at end of a topic segment.

---

**TONE FOR 50+ AUDIENCE:**

DO:
✅ Use phrases like "Let's consolidate what we know"
✅ Number the findings (1, 2, 3) - helps memory retention
✅ Distinguish facts from theories explicitly
✅ Give credit to sources/evidence
✅ Acknowledge progress ("We've established...")
✅ Use transitional signposts ("Here's where we are...")

DON'T:
❌ Rush through - these are PAUSE moments
❌ Use vague summaries ("So yeah, lots of weird stuff")
❌ Skip validation step (viewer needs psychological payoff)
❌ Make it too long (max 90 seconds)
❌ Forget to open new loop (momentum dies)

---

**EXAMPLE MICRO-CONCLUSION (Full):**

[At 10-minute mark, after initial evidence presentation]

Researcher: "Alright, let's take stock of what we've established so far."

[1 second pause]

Researcher: "We started with a simple question: what happened in Roswell in July 1947?

But we've already uncovered three significant facts:

First, the Roswell Army Air Field issued a press release on July 8th stating they had recovered a 'flying disc.' Those were the exact words used. That's documented in the Roswell Daily Record.

Second, within 24 hours, that statement was retracted. General Ramey held a press conference claiming it was a weather balloon.

And third, multiple witnesses - including Major Jesse Marcel, the intelligence officer who retrieved the debris - later testified that what they saw didn't match any weather balloon or known aircraft of that era.

These aren't theories. These are documented facts, confirmed by newspaper archives and declassified military records."

[2 second pause]

Analyst: "So we're not starting with conspiracy theories. We're starting with contradictions in the official record itself."

[1 second pause]

Researcher: "Exactly. The story changed, and it changed fast."

[2 second pause]

Researcher: "Which raises our next question: Who ordered that retraction? And more importantly... why was it necessary?"

[3 second pause before transitioning to next segment]

**Analysis of this example:**

✅ Clear summary (3 numbered facts)
✅ Sources cited (Roswell Daily Record, declassified records)
✅ Facts vs. theories distinction
✅ Analyst validates ("not conspiracy theories")
✅ Pivot to new question (who ordered, why)
✅ Appropriate pauses for 50+ comprehension
✅ Total time: ~75 seconds

---

**INTEGRATION:**

When writing each chapter script:

1. Identify natural break points every ~10 minutes of content
2. At each break, insert a Micro-Conclusion following the 3-step structure
3. Ensure the "pivot question" logically leads into the next segment
4. Vary the language (don't use same phrases every time)

**Quality Check:**

After writing each Micro-Conclusion, ask:

1. Could a viewer explain what they learned if video paused here? (Yes = good)
2. Do they feel progress was made? (Yes = good)
3. Is there a clear reason to keep watching? (Yes = good)
4. Is it between 60-90 seconds? (Yes = good)

If all four are "yes," the Micro-Conclusion is effective.
`;

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
    
    // Get 50+ audience optimization instructions
    const retentionInstructions = getRetentionAnchorsInstructions();
    const characterInstructions = getCharacterDesignInstructions();
    const microConclusionInstructions = getMicroConclusionInstructions();

    return `You are an AI screenwriter and YouTube producer. Your task is to create a complete package of materials for a compelling YouTube video on the topic: "${topic}".
    
    **CRITICAL INSTRUCTION: Generate all text content STRICTLY in the following language: ${language}.**
    **EXCEPTION: All search keywords (for images, music, and SFX) MUST be in English.**

    ${sourceInstruction}
    ${styleInstruction}

    ${retentionInstructions}

    ${characterInstructions}

    ${microConclusionInstructions}

    **AVAILABLE VOICES:**
    Select the most appropriate voice ID for each character from this list:
    ${voiceList}

    **General Task Requirements:**
    1.  **Characters:** Create two unique characters following the "Researcher" and "Skeptical Analyst" archetypes described above.
        - **Crucial:** Assign a 'suggestedVoiceId' from the list above that perfectly matches their personality and gender.
        - Choose DEEPER, MORE MATURE voices (avoid young-sounding voices)
        - For Lovecraftian style: one should be more analytical/skeptical, the other more open to disturbing possibilities
        - Write character descriptions emphasizing EXPERIENCE, CREDIBILITY, and EXPERTISE (implied age 50-70)
    2.  **YouTube Assets:** Create YouTube-optimized text assets.
    3.  **Script:** Write the script for the FIRST CHAPTER (approx 7-8 mins). **Total text volume: 8500-9500 chars.**
        - **DIALOGUE MODE:** Follow the 50+ dialogue dynamics described above:
          * Thoughtful pacing with appropriate pauses (0.8-1.5 seconds between sentences)
          * Short-Medium-Short-Long turn-taking rhythm
          * Natural reactions with intellectual respect
          * Questions that model critical thinking
          * One character often challenges or questions the other respectfully
        - **RETENTION ANCHORS:** This first chapter MUST include:
          * HOOK ANCHOR (0-2 minutes): Open with shocking/intriguing element
          * FIRST REVELATION ANCHOR (8-10 minutes): Reward viewer with surprising fact
        - **MICRO-CONCLUSION:** At the 8-9 minute mark, include a micro-conclusion that summarizes what was learned and pivots to next chapter
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
    
    // Get 50+ audience optimization instructions
    const retentionInstructions = getRetentionAnchorsInstructions();
    const characterInstructions = getCharacterDesignInstructions();
    const microConclusionInstructions = getMicroConclusionInstructions();

    return `You are a master of suspense, an AI screenwriter continuing a long-form podcast.

    Podcast Topic: "${topic}"
    Podcast Title: "${podcastTitle}"
    Characters:
    ${characterDescriptions}
    Summary of previous chapters:
    ${previousSummary}

    **CRITICAL INSTRUCTION: Generate all text content STRICTLY in ${language}. All search keywords MUST be in English.**

    ${retentionInstructions}

    ${characterInstructions}

    ${microConclusionInstructions}

    Your task: write the script for the NEXT, ${chapterIndex + 1}-th chapter.
    - **Script Length:** Approx 7-8 minutes. **Total text volume: 8500-9500 characters.**
    - **Sound Design:** Add 3-5 ATMOSPHERIC SFX cues (creaking, wind, footsteps, distant sounds).
    - **Visuals:** Provide 3 English prompts for HORIZONTAL realistic images (historical locations, documents, artifacts).
    - **DIALOGUE MODE:** Follow the 50+ dialogue dynamics described above:
      * Thoughtful pacing with appropriate pauses (0.8-1.5 seconds between sentences)
      * Short-Medium-Short-Long turn-taking rhythm
      * Intellectual respect and critical thinking
      * Age-appropriate language and references (no slang, no memes)
    - **RETENTION ANCHOR:** Depending on which chapter this is (${chapterIndex + 1}), include the appropriate retention anchor:
      * Chapter 2-3 (~18-20 min total): Pattern Recognition Anchor
      * Chapter 4 (~28-30 min total): Authority Anchor (expert validation)
      * Chapter 5 (~38-40 min total): Emotional Stakes Anchor
      * Chapter 6 (~45-48 min total): Final Twist Anchor
      * Last chapter: Open Loop Anchor (tease next video)
    - **MICRO-CONCLUSION:** At the 8-9 minute mark of THIS chapter, include a micro-conclusion that:
      1. Summarizes what was covered in THIS chapter
      2. Validates the information presented
      3. Pivots to what will be explored in the NEXT chapter
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