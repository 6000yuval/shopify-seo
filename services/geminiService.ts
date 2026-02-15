
import { GoogleGenAI } from "@google/genai";
import { OptimizationMode, AIConfig } from "../types";

export interface BatchItem {
  text: string;
  mode: OptimizationMode;
  columnName?: string;
}

export interface BlogPost {
  title: string;
  content_html: string;
  tags: string[];
  excerpt: string;
  meta_description: string;
}

// System instructions based on "High-End Shopify SEO Playbook" research
const SYSTEM_INSTRUCTION_STANDARD = `Role: World-Class Direct Response Copywriter & UI Designer (Hebrew).
Target Audience: Israeli Impulse Buyers.
Tone: Confident, Exciting, Urgent, Reassuring. 

*** CORE TASK: GENERATE HIGH-CONVERSION HTML ***
When mode is 'HTML_CONTENT', you MUST use the following specific Design Template.
You must analyze the product to choose a matching Color Palette.

*** COLOR PALETTES (Pick One based on Product) ***
1. **Blue (Tech/General/Boys)**: Primary: #3a7abf | Light: #bde2ff | Gradient: linear-gradient(135deg,#f6fbff 0%,#e6f4ff 100%) | Secondary: #4a9ed9
2. **Pink/Purple (Beauty/Female)**: Primary: #ff5c97 | Light: #ffd6e7 | Gradient: linear-gradient(135deg, #ffd6e7 0%, #c8e9ff 100%) | Secondary: #d63031
3. **Cyan/Clean (Health/Hygiene)**: Primary: #0096a3 | Light: #bce5eb | Gradient: linear-gradient(135deg,#fafafa 0%,#f0f7f9 100%) | Secondary: #1c4b57
4. **Green (Nature/Eco)**: Primary: #27ae60 | Light: #a9dfbf | Gradient: linear-gradient(135deg,#f0f9e8 0%,#e8f8f5 100%) | Secondary: #1e8449
5. **Orange (Kids/Fun)**: Primary: #e67e22 | Light: #fad7a0 | Gradient: linear-gradient(135deg,#fef9e7 0%,#fdebd0 100%) | Secondary: #d35400

*** MANDATORY HTML TEMPLATE (Do not deviate from this structure) ***

<div style="font-family: 'Heebo',Arial,sans-serif; direction: rtl; text-align: right; line-height: 1.8; color: #1d1d1d; max-width: 760px; margin: auto; padding: 18px;">
  <!-- HERO -->
  <section style="background: {{GRADIENT}}; padding: 22px; border-radius: 12px; text-align: center; margin-bottom: 22px;">
    <h2 style="margin: 0; font-size: 24px; font-weight: 800; color: {{PRIMARY}};">{{PRODUCT_TITLE}}</h2>
    <p style="margin: 10px 0 0; font-size: 15.5px; color: #2b3b31;">{{SALES_HOOK_PARAGRAPH}}</p>
  </section>

  <!-- BENEFITS -->
  <section style="background: #fff; padding: 18px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.06); margin-bottom: 18px;">
    <h3 style="margin: 0 0 10px; color: {{PRIMARY}}; font-size: 18px; border-bottom: 2px solid {{LIGHT}}; padding-bottom: 6px;">יתרונות עיקריים</h3>
    <ul style="list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; font-size: 15px;">
       <!-- Loop for 4-5 benefits. Icons: 💎, ✨, ✅, 🛡️, 💧 -->
       <li>{{ICON}} <strong>{{BENEFIT_TITLE}}</strong> – {{BENEFIT_EXPLANATION}}</li>
    </ul>
  </section>

  <!-- WHY CHOOSE US -->
  <section style="background: #fff; padding: 18px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.06); margin-bottom: 18px;">
    <h3 style="margin: 0 0 10px; color: {{PRIMARY}}; font-size: 18px; border-bottom: 2px solid {{LIGHT}}; padding-bottom: 6px;">למה לבחור במוצר הזה?</h3>
    <p style="font-size: 15px; color: #333;">{{PERSUASIVE_PARAGRAPH}}</p>
  </section>

  <!-- COMPARISON TABLE -->
  <section style="margin-bottom: 18px;">
    <h3 style="margin: 0 0 10px; color: {{PRIMARY}}; font-size: 18px; border-bottom: 2px solid {{LIGHT}}; padding-bottom: 6px;">השוואה מול מתחרים</h3>
    <div style="overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid {{LIGHT}}; border-radius: 8px;">
      <table style="min-width: 520px; width: 100%; border-collapse: collapse; font-size: 14.5px;">
        <tbody>
          <tr style="background: {{LIGHT}};">
            <th style="padding: 8px; border-bottom: 1px solid {{LIGHT}};">מאפיין</th>
            <th style="padding: 8px; border-bottom: 1px solid {{LIGHT}};">שלנו ✅</th>
            <th style="padding: 8px; border-bottom: 1px solid {{LIGHT}};">אחרים ❌</th>
          </tr>
          <!-- 3-4 Comparison Rows. Use background: #f9f9f9 for alternating rows if desired, or keep white. -->
          <tr>
            <td style="padding: 8px;">{{FEATURE_1}}</td>
            <td style="padding: 8px;">✔️ {{US_1}}</td>
            <td style="padding: 8px;">❌ {{THEM_1}}</td>
          </tr>
          <!-- More rows... -->
        </tbody>
      </table>
    </div>
  </section>

  <!-- TECH SPECS -->
  <section style="background: #fff; padding: 18px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.06);">
    <h3 style="margin: 0 0 10px; color: {{PRIMARY}}; font-size: 18px;">מפרט טכני</h3>
    <ul style="list-style: none; padding: 0; margin: 0; font-size: 14.5px;">
      <li>• {{SPEC_1}}</li>
      <li>• {{SPEC_2}}</li>
      <!-- ... -->
    </ul>
  </section>

  <!-- TRUST FOOTER -->
  <div style="background: #2f3640; color: #fff; padding: 16px; border-radius: 12px; text-align: center; margin-top: 20px;">
    <p style="margin: 0; font-weight: bold;">🚚 משלוח מהיר | 🔒 תשלום מאובטח | 📞 שירות לקוחות בעברית</p>
  </div>

  <!-- JSON-LD SCHEMA -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": "{{PRODUCT_TITLE}}",
    "description": "{{SHORT_DESC}}",
    "offers": { "@type": "Offer", "availability": "https://schema.org/InStock" },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "{{RANDOM_4.7_TO_4.9}}",
      "reviewCount": "{{RANDOM_45_TO_120}}"
    }
  }
  </script>
</div>

*** OTHER FIELDS INSTRUCTIONS ***
- **SEO_KEYWORD**: Find High Intent keyword. No "Price"/"Buy".
- **PROFESSIONAL (Title)**: {Keyword} + {Feature}. CRITICAL: MUST START WITH KEYWORD. Do NOT include "Kleerix" or brand name. Max 60 chars.
- **SEO_HIGH (Meta)**: {Keyword} + {Benefit} + {USP} + {CTA}. Do NOT include "Kleerix" or brand name. Max 155 chars.
- **SEO_SLUG**: Hebrew only, hyphenated. Do NOT include "Kleerix".

*** OUTPUT FORMAT ***
- Return ONLY a raw JSON Array of strings: ["result1", "result2", ...]
- NO Markdown blocks (\`\`\`json). Just the raw array.
`;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to safely find property ignoring case
const getCaseInsensitive = (obj: any, keys: string[]) => {
    if (!obj) return undefined;
    const objKeys = Object.keys(obj);
    for (const k of keys) {
        // Exact match
        if (obj[k]) return obj[k];
        // Lowercase match
        const found = objKeys.find(ok => ok.toLowerCase() === k.toLowerCase());
        if (found) return obj[found];
    }
    return undefined;
};

export class AIService {
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
  }

  public updateConfig(newConfig: AIConfig) {
    this.config = newConfig;
  }

  private extractValidJson(text: string): string {
    // Remove markdown code blocks and whitespace
    let clean = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    
    // Find the outer bounds of JSON (Object or Array)
    const firstBrace = clean.indexOf('{');
    const firstBracket = clean.indexOf('[');
    
    let start = -1;
    let end = -1;
    
    // Check if it starts as an Object or Array
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        start = firstBrace;
        end = clean.lastIndexOf('}');
    } else if (firstBracket !== -1) {
        start = firstBracket;
        end = clean.lastIndexOf(']');
    }

    // Extract the substring if bounds found
    if (start !== -1 && end !== -1 && end > start) {
        clean = clean.substring(start, end + 1);
    } else {
        // Fallback: if no brackets found but text exists, wrap in brackets (rare edge case for single strings)
        if (clean.length > 0 && !clean.startsWith('{') && !clean.startsWith('[')) {
             return "{}"; // Safe fail
        }
    }
    
    return clean;
  }

  async translateBatch(items: BatchItem[]): Promise<string[]> {
    if (items.length === 0) return [];

    const promptText = `Task: Process these items for Shopify Israel.
    
    INPUT DATA:
    ${JSON.stringify(items, null, 2)}
    
    INSTRUCTIONS:
    - For 'HTML_CONTENT': Generate the full 'Heebo' design template provided in the system prompt. Pick the best color palette for the product. Do NOT include "Kleerix" in the text.
    - For 'SEO_*' fields: Follow the formulas. Do NOT include "Kleerix" or brand name.
    - For 'PROFESSIONAL': Ensure title starts with focus keyword.
    - For 'FACTUAL': Direct translation.
    
    Return ONLY valid JSON Array of strings.`;

    // Use Flash for simple batch translations
    return this.executeAiCall(promptText, SYSTEM_INSTRUCTION_STANDARD, true, "gemini-3-flash-preview");
  }

  async generateProductBlogs(productName: string, productUrl: string, imageUrl: string, count: number = 3): Promise<BlogPost[]> {
    // 2026 HIGH-END SEO STYLING (The "Pillar" Look)
    const STYLES = {
        // TOC: Table of Contents
        TOC_BOX: "background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 40px; font-size: 0.95em;",
        TOC_HEADER: "font-weight: 800; margin-bottom: 12px; font-size: 1.1em; color: #1e293b;",
        TOC_LIST: "list-style: none; padding: 0; margin: 0; columns: 1; @media(min-width:600px){columns:2;}",
        TOC_LINK: "color: #3b82f6; text-decoration: none; font-weight: 500; display: block; margin-bottom: 8px;",
        
        // Content Elements
        PRO_TIP_BOX: "background-color: #f0fdf4; border-right: 4px solid #22c55e; padding: 20px 24px; border-radius: 8px; margin: 32px 0; font-size: 1.05em; color: #14532d;",
        TABLE: "width: 100%; border-collapse: collapse; margin: 30px 0; font-size: 0.95em; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;",
        TH: "background-color: #f1f5f9; padding: 12px 16px; text-align: right; font-weight: 700; color: #334155;",
        TD: "padding: 12px 16px; border-top: 1px solid #e2e8f0; color: #475569;",
        
        // CTA
        BTN_CTA: "background: linear-gradient(135deg, #111 0%, #333 100%); color: #fff; padding: 16px 36px; border-radius: 50px; font-weight: 700; text-decoration: none; display: inline-block; margin-top: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: transform 0.2s;",
        
        // Image
        IMG_CONTAINER: "margin: 0 0 40px 0; width: 100%; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.06);"
    };
    
    const imageInstruction = imageUrl 
      ? `<div style="${STYLES.IMG_CONTAINER}"><img src="${imageUrl}" alt="${productName}" style="width:100%; height:auto; display:block;"></div>` 
      : ``;

    const prompt = `
    Role: Senior SEO Content Director for a High-End Israeli Brand.
    Language: Hebrew (Modern, Sophisticated, Native).
    Product: "${productName}"
    Target URL: "${productUrl}"
    Goal: Write ${count} DISTINCT, LONG-FORM "Pillar" Blog Posts (~1200+ words HTML depth).

    *** STRATEGY: THE "PRODUCT-FIRST" CONTENT ECOSYSTEM ***
    You are not just writing a blog; you are building an entryway for a customer who has a problem.
    You MUST adhere to the "Trojan Horse" angles. Choose a distinct angle for each post:
    1. **The "How-To"**: Teach a skill/routine where the product is the tool.
    2. **The "Comparison"**: Compare the product category to alternatives.
    3. **The "Best List"**: List top solutions, positioning this product as the smart choice.
    4. **The "Deep Review"**: A hands-on, transparent analysis.

    *** REQUIRED STRUCTURE (MANDATORY HTML) ***

    1. **H1 Title**: Must contain the High-Commercial Intent Keyword. Do NOT include brand name "Kleerix".
    
    2. **Meta Data (Crucial & Mandatory)**:
       - **meta_description**: MAX 155 chars. Formula: {Keyword} + {Benefit} + {USP} + {CTA}. Do NOT include "Kleerix".
       - **excerpt**: A compelling summary for the blog feed.

    3. **Table of Contents (TOC)**:
       - Create a box (<div style="${STYLES.TOC_BOX}">) with a title ("תוכן העניינים") and an HTML list of anchor links to the sections below.

    4. **The Hook (Intro)**:
       - Validate the user's struggle immediately.
       - **LINKING RULE (STRICT)**: You MUST link to the product page ("${productUrl}") within the first 100 words using the *High-Intent Keyword* as anchor text. 
       - **URL VALIDATION**: The link href MUST be exactly "${productUrl}". Do NOT use relative paths like "/products/...". Use the full provided URL.

    5. **The "Education" (H2)**:
       - Deep dive into the *science* or *causes* of the problem. Demonstrate E-E-A-T (Expertise).
       - Use "Did You Know?" facts.

    6. **The "Pivot" to Product (H2)**:
       - Introduce "${productName}" as the ultimate tool/solution.
       - Use the "Feature -> Benefit" model.
       - **MANDATORY**: Use a "Pro Tip" Box: <div style="${STYLES.PRO_TIP_BOX}">💡 **טיפ של מומחים:** [Insert Tip]</div>

    7. **Comparison / Alternatives (H2)**:
       - "Why choose ${productName} over [Alternative]?"
       - Use an HTML Table (<table style="${STYLES.TABLE}">) to compare features.

    8. **How to Use / Routine (H2)**:
       - Step-by-step practical guide.

    9. **FAQ (H2)**:
       - 5 Common Questions (Target "People Also Ask").

    10. **Conclusion & CTA**:
       - Summarize the key takeaways.
       - **BUTTON**: <div style="text-align:center; margin: 40px 0;"><a href="${productUrl}" style="${STYLES.BTN_CTA}">לרכישת המוצר המקורי &larr;</a></div>
       - **IMPORTANT**: Button href MUST be "${productUrl}".

    11. **JSON-LD Schema**:
        - Article, FAQPage, Product (with reviews).

    *** CRITICAL RULES ***
    - **Length**: Be EXTREMELY detailed (1200+ words). Do not summarize. Write the full guide.
    - **Internal Linking**: Insert 2-3 contextual links to "${productUrl}" throughout the text (not just the button).
    - **No Markdown**: Output raw HTML only.
    - **Brand Name**: Do NOT mention "Kleerix" unless absolutely necessary for context, but prefer "the brand" or "our product".

    OUTPUT FORMAT:
    JSON Object: { "posts": [ { "title": "...", "content_html": "...", "tags": [], "excerpt": "...", "meta_description": "..." } ] }
    `;

    const systemInstruction = "You are an Elite SEO Editor. You write comprehensive, long-form content. You never output Markdown.";
    
    // Use Pro for complex structure generation and reasoning
    const result = await this.executeAiCall(prompt, systemInstruction, true, "gemini-3-pro-preview");
    
    // Robust Normalization
    let rawPosts: any[] = [];
    
    if (Array.isArray(result)) {
        rawPosts = result;
    } else if (typeof result === 'object' && result !== null) {
        const posts = getCaseInsensitive(result, ['posts', 'articles', 'blogs']);
        if (Array.isArray(posts)) {
            rawPosts = posts;
        } else if (result.title || result.Title) {
            rawPosts = [result];
        } else {
            const values = Object.values(result);
            const foundArray = values.find(v => Array.isArray(v));
            if (foundArray) {
                rawPosts = foundArray as any[];
            }
        }
    }

    if (rawPosts.length === 0) {
        console.warn("AI returned structure that could not be parsed as blog posts:", result);
        return [];
    }
        
    // Map and Validate
    const finalPosts = rawPosts.map((item: any) => {
        const title = getCaseInsensitive(item, ['title', 'headline', 'name']);
        const content = getCaseInsensitive(item, ['content_html', 'contentHtml', 'body', 'html', 'content', 'text']);
        const tags = getCaseInsensitive(item, ['tags', 'keywords']);
        const excerpt = getCaseInsensitive(item, ['excerpt', 'summary', 'description', 'short']);
        const metaDesc = getCaseInsensitive(item, ['meta_description', 'metaDescription', 'seo_description', 'meta', 'description']);

        return {
            title: title || "פוסט ללא כותרת",
            content_html: content || "", 
            tags: Array.isArray(tags) ? tags : [],
            excerpt: excerpt || "",
            meta_description: metaDesc || excerpt || ""
        };
    }).filter(post => post.content_html.length > 20); 

    return finalPosts.slice(0, count);
  }

  private async executeAiCall(promptText: string, systemInstruction: string, isArray: boolean, modelName: string = "gemini-3-flash-preview"): Promise<any> {
    const maxRetries = 3;
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (this.config.provider === 'openai') {
            return await this.callOpenAI(promptText, systemInstruction);
        } else {
            return await this.callGemini(promptText, systemInstruction, isArray, modelName);
        }
      } catch (error: any) {
        lastError = error;
        const errorStr = JSON.stringify(error).toLowerCase();
        const isTransient = errorStr.includes('429') || errorStr.includes('500') || errorStr.includes('503');
        
        if (isTransient && attempt < maxRetries) {
          const waitTime = 3000 * Math.pow(2, attempt); 
          console.warn(`Transient error (${error.message}). Retrying in ${waitTime}ms...`);
          await delay(waitTime);
          continue;
        }
        break;
      }
    }
    throw new Error(lastError?.message || "AI Request failed.");
  }

  private async callGemini(promptText: string, systemInstruction: string, isArray: boolean, modelName: string) {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("Gemini API Key is missing. Please check environment variables.");

    const aiInstance = new GoogleGenAI({ apiKey });
    
    const response = await aiInstance.models.generateContent({
      model: modelName,
      contents: promptText,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        temperature: 0.5,
      },
    });

    const rawText = response.text || (isArray ? "[]" : "{}");
    const jsonText = this.extractValidJson(rawText);
    
    try {
        return JSON.parse(jsonText);
    } catch (e) {
        console.error("JSON Parse Error. Raw text:", rawText);
        throw new Error("Gemini returned invalid JSON.");
    }
  }

  private async callOpenAI(promptText: string, systemInstruction: string) {
    if (!this.config.openAiKey) throw new Error("OpenAI API Key is missing. Please check Settings.");

    const model = this.config.openAiModel || "gpt-4o";
    const isReasoning = model.startsWith("o1") || model.startsWith("gpt-5");

    const body: any = {
      model: model,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: promptText }
      ],
      response_format: { type: "json_object" }
    };

    if (!isReasoning) {
        body.temperature = 0.5;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.openAiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(`OpenAI Error: ${err.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    
    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) return parsed;
        const values = Object.values(parsed);
        const arrayVal = values.find(v => Array.isArray(v));
        if (arrayVal) return arrayVal;
        return parsed; 
    } catch (e) {
        throw new Error("OpenAI returned invalid JSON.");
    }
  }
}
