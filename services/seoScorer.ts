
import { ProductRow } from "../types";

export interface SeoAnalysis {
    score: number;
    issues: string[];
}

export const calculateSeoScore = (row: ProductRow): SeoAnalysis => {
    let score = 0;
    const issues: string[] = [];
    
    const keyword = (row.rank_math_focus_keyword || '').toLowerCase().trim();
    
    // If no keyword is set, we can't really score it high
    if (!keyword) {
        return { 
            score: 10, 
            issues: ["Missing Focus Keyword. Cannot score properly."] 
        }; 
    }

    const title = (row.rank_math_title || row.name || '').toLowerCase();
    const desc = (row.rank_math_description || '').toLowerCase();
    const slug = (row.slug || '').toLowerCase();
    const content = (row.description || '').toLowerCase(); // HTML content

    function escapeRegExp(string: string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
    }

    // --- 1. Basic SEO (Approx 45 points) ---

    // Keyword in Title (Exact: 10, Partial: 5)
    if (title.includes(keyword)) {
        score += 10;
    } else if (title.includes(keyword.replace(/ /g, '-'))) {
        score += 5;
        issues.push("Title: Keyword partial match only.");
    } else {
        issues.push("Title: Focus keyword missing.");
    }

    // Keyword in Meta Description
    if (desc.includes(keyword)) {
        score += 10;
    } else {
        issues.push("Meta Desc: Focus keyword missing.");
    }
    
    // Keyword in URL
    const urlSafeKeyword = keyword.replace(/ /g, '-');
    if (slug.includes(keyword) || slug.includes(urlSafeKeyword) || slug.includes(encodeURIComponent(keyword))) {
        score += 10;
    } else {
        issues.push("URL: Focus keyword missing.");
    }
    
    // Keyword in Content intro (first 10%)
    const cleanContent = content.replace(/<[^>]*>/g, ' '); // Strip HTML
    const first10Percent = cleanContent.substring(0, Math.max(150, Math.ceil(cleanContent.length * 0.1)));
    if (first10Percent.includes(keyword)) {
        score += 15;
    } else {
        issues.push("Content: Keyword missing in the first 10%.");
    }

    // --- 2. Additional (Approx 30 points) ---

    // Keyword in H2/H3/H4
    if ((content.includes(`<h2`) || content.includes(`<h3`)) && content.includes(keyword)) {
        score += 10;
    } else {
        issues.push("Content: Keyword missing in H2/H3/H4 subheadings.");
    }
    
    // Keyword Density (Target 0.5% - 3.5%) - Slightly wider range for Hebrew
    const words = cleanContent.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    // Simple count
    const keywordCount = (cleanContent.match(new RegExp(escapeRegExp(keyword), 'gi')) || []).length;
    
    if (wordCount > 0) {
        const density = (keywordCount / wordCount) * 100;
        if (density >= 0.5 && density <= 3.5) {
            score += 10;
        } else if (density > 0) {
            score += 5; // Partial points if exists but off density
            if (density < 0.5) issues.push(`Density: Too low (${density.toFixed(1)}%). Target 0.5%-3.5%.`);
            if (density > 3.5) issues.push(`Density: Too high (${density.toFixed(1)}%). Avoid stuffing.`);
        } else {
            issues.push("Density: Keyword not found in content body.");
        }
    } else {
        issues.push("Content: No text found.");
    }

    // URL Length (Short is better)
    if (slug.length < 85) { // Increased slightly for Hebrew slugs
        score += 5;
    } else {
        issues.push("URL: Too long (>85 chars).");
    }

    // Content Length - Adjusted for Product Pages
    if (wordCount > 200) {
        score += 5;
    } else {
        issues.push(`Content: Too short (${wordCount} words). Target 200+.`);
    }

    if (wordCount > 300) {
        score += 5; // Bonus
    }

    // --- 3. Title Readability (Approx 15 points) ---

    // Keyword at start of title (First 50% of string)
    if (title.indexOf(keyword) === 0 || title.indexOf(keyword) < title.length / 2) {
        score += 10;
    } else {
        issues.push("Title: Keyword should be near the beginning.");
    }
    
    // Has a number in title (Power technique)
    if (/\d/.test(title)) {
        score += 5;
    } else {
        issues.push("Title: Add a number (e.g. year, quantity) for CTR.");
    }

    // --- 4. Content Readability (Approx 10 points) ---
    
    // Uses lists (ul/ol)
    if (content.includes('<ul') || content.includes('<ol')) {
        score += 5;
    } else {
        issues.push("Content: Add bullet points/lists.");
    }
    
    // Uses short paragraphs (Bonus check) or images
    if (content.includes('<img') || row.image) {
        score += 5;
    } else {
        issues.push("Content: Add images/media.");
    }

    return { score: Math.min(100, score), issues };
};
