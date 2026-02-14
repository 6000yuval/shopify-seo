
import { ProductRow } from "../types";

export const calculateSeoScore = (row: ProductRow): number => {
    let score = 0;
    const keyword = (row.rank_math_focus_keyword || '').toLowerCase().trim();
    
    // If no keyword is set, we can't really score it high, but let's assume valid base content gives some points
    if (!keyword) return 10; 

    const title = (row.rank_math_title || row.name || '').toLowerCase();
    const desc = (row.rank_math_description || '').toLowerCase();
    const slug = (row.slug || '').toLowerCase();
    const content = (row.description || '').toLowerCase(); // HTML content

    function escapeRegExp(string: string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
    }

    // --- 1. Basic SEO (Approx 45 points) ---

    // Keyword in Title (Exact: 10, Partial: 5)
    if (title.includes(keyword)) score += 10;
    else if (title.includes(keyword.replace(/ /g, '-'))) score += 5;

    // Keyword in Meta Description
    if (desc.includes(keyword)) score += 10;
    
    // Keyword in URL
    const urlSafeKeyword = keyword.replace(/ /g, '-');
    if (slug.includes(keyword) || slug.includes(urlSafeKeyword) || slug.includes(encodeURIComponent(keyword))) {
        score += 10;
    }
    
    // Keyword in Content intro (first 10%)
    const cleanContent = content.replace(/<[^>]*>/g, ' '); // Strip HTML
    const first10Percent = cleanContent.substring(0, Math.ceil(cleanContent.length * 0.1));
    if (first10Percent.includes(keyword)) score += 15;

    // --- 2. Additional (Approx 30 points) ---

    // Keyword in H2/H3/H4
    if ((content.includes(`<h2`) || content.includes(`<h3`)) && content.includes(keyword)) {
        score += 10;
    }
    
    // Keyword Density (Target 0.5% - 2.5%)
    const words = cleanContent.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    // Simple count
    const keywordCount = (cleanContent.match(new RegExp(escapeRegExp(keyword), 'gi')) || []).length;
    
    if (wordCount > 0) {
        const density = (keywordCount / wordCount) * 100;
        if (density >= 0.5 && density <= 2.5) score += 10;
        else if (density > 0) score += 4; // Too low or too high
    }

    // URL Length (Short is better)
    if (slug.length < 75) score += 5;

    // Content Length
    if (wordCount > 250) score += 5;
    if (wordCount > 600) score += 5; // Bonus

    // --- 3. Title Readability (Approx 15 points) ---

    // Keyword at start of title (First 50% of string)
    if (title.indexOf(keyword) === 0 || title.indexOf(keyword) < title.length / 2) {
        score += 10;
    }
    
    // Has a number in title (Power technique)
    if (/\d/.test(title)) score += 5;

    // --- 4. Content Readability (Approx 10 points) ---
    
    // Uses lists (ul/ol)
    if (content.includes('<ul') || content.includes('<ol')) score += 5;
    
    // Uses short paragraphs (Bonus check) or images
    if (content.includes('<img') || row.image) score += 5;

    return Math.min(100, score);
};
