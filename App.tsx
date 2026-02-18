
import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { Upload, FileDown, AlertCircle, Loader2, Play, Info, Sparkles, Clock, Zap, Globe, Settings2, ShieldCheck, X, ChevronDown, LayoutTemplate, FileSpreadsheet, Keyboard, ShoppingCart, Link as LinkIcon, Search, Image as ImageIcon, CheckSquare, Square, LogOut, RefreshCw, Save, ArrowRightLeft, CheckCircle2, RotateCcw, Cpu, Undo2, Redo2, PenTool } from 'lucide-react';
import Papa from 'papaparse';
import { ProductRow, TranslationStatus, isRecommended, isTechnical, OptimizationMode, MODE_LABELS, StructureMode, AIConfig, COLUMN_LABELS_HE } from './types';
import { AIService } from './services/geminiService';
import { fetchShopifyProducts, updateShopifyProduct, ShopifyCredentials, fetchShopifyBlogs, createShopifyArticle } from './services/shopifyService';
import { calculateSeoScore } from './services/seoScorer';

// Default credentials - Clean init
const DEFAULT_CREDS: ShopifyCredentials = {
    shop: '',
    token: ''
};

export default function App() {
  // Main Data Source (The "Workspace")
  const [products, setProducts] = useState<ProductRow[]>([]); 
  const [originalProducts, setOriginalProducts] = useState<Record<string, ProductRow>>({}); // Last known server state
  const [immutableProducts, setImmutableProducts] = useState<Record<string, ProductRow>>({}); // Initial session state (Snapshot)
  
  // History State
  const [historyPast, setHistoryPast] = useState<ProductRow[][]>([]);
  const [historyFuture, setHistoryFuture] = useState<ProductRow[][]>([]);

  // Selection & Config
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allColumns, setAllColumns] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [columnModes, setColumnModes] = useState<Record<string, OptimizationMode>>({});
  const [blogCount, setBlogCount] = useState<number>(3);
  
  // App State
  const [status, setStatus] = useState<TranslationStatus>({ total: 0, completed: 0, isProcessing: false });
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Shopify Connection
  const [shopifyCreds, setShopifyCreds] = useState<ShopifyCredentials>(DEFAULT_CREDS);
  const [isConnected, setIsConnected] = useState(false);
  const [isShopifyLoading, setIsShopifyLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<Record<string, 'pending' | 'syncing' | 'synced' | 'error'>>({});
  const [searchTerm, setSearchTerm] = useState('');

  // AI Configuration
  const [aiConfig, setAiConfig] = useState<AIConfig>({
      provider: 'gemini',
      geminiKey: process.env.API_KEY || '',
      openAiKey: '',
      openAiModel: 'gpt-4o'
  });

  const aiServiceRef = useRef<AIService>(new AIService(aiConfig));

  // --- History Helpers ---

  const saveToHistory = () => {
    // Push current state to past, clear future
    setHistoryPast(prev => [...prev, JSON.parse(JSON.stringify(products))]);
    setHistoryFuture([]);
  };

  const handleUndo = () => {
    if (historyPast.length === 0) return;
    const previousState = historyPast[historyPast.length - 1];
    const newPast = historyPast.slice(0, historyPast.length - 1);
    
    setHistoryFuture(prev => [products, ...prev]);
    setProducts(previousState);
    setHistoryPast(newPast);
    setSuccessMsg("פעולה בוטלה (Undo)");
  };

  const handleRedo = () => {
    if (historyFuture.length === 0) return;
    const nextState = historyFuture[0];
    const newFuture = historyFuture.slice(1);

    setHistoryPast(prev => [...prev, products]);
    setProducts(nextState);
    setHistoryFuture(newFuture);
    setSuccessMsg("פעולה הוחזרה (Redo)");
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                handleRedo();
            } else {
                handleUndo();
            }
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
            e.preventDefault();
            handleRedo();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products, historyPast, historyFuture]);

  // --- Actions ---

  const handleShopifyConnect = async (e: React.FormEvent | null, credsToUse?: ShopifyCredentials) => {
    if (e) e.preventDefault();
    const creds = credsToUse || shopifyCreds;
    if (!creds.shop || !creds.token) return;

    // Sanitize shop url
    const cleanShop = creds.shop.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const cleanCreds = { ...creds, shop: cleanShop };

    setIsShopifyLoading(true);
    setError(null);
    try {
        const fetched = await fetchShopifyProducts(cleanCreds);
        
        // Save success creds
        localStorage.setItem('seo_shop_creds', JSON.stringify(cleanCreds));
        // Update state to match used creds (in case of auto-connect)
        setShopifyCreds(cleanCreds);

        // Initialize State
        setProducts(fetched);
        setHistoryPast([]);
        setHistoryFuture([]);
        
        // Snapshot original states
        const origMap: Record<string, ProductRow> = {};
        fetched.forEach(p => origMap[p.id] = { ...p });
        
        setOriginalProducts(origMap);
        setImmutableProducts({ ...origMap }); 

        // Setup Columns
        if (fetched.length > 0) {
            const keys = Object.keys(fetched[0]);
            const validKeys = keys.filter(k => k !== 'image' && k !== 'id' && k !== 'status' && k !== 'permalink');
            setAllColumns(validKeys);
            
            // Default selected columns: ALL info by default
            const defaults = validKeys.filter(k => 
                ['name', 'description', 'slug', 'rank_math_title', 'rank_math_description', 'rank_math_focus_keyword', 'selling_bullets', 'option1_name', 'option1_values', 'option2_name', 'option2_values', 'option3_name', 'option3_values'].includes(k)
            );
            setSelectedColumns(defaults);
            
            // Default Modes
            const modes: Record<string, OptimizationMode> = {};
            validKeys.forEach(k => modes[k] = detectDefaultMode(k));
            setColumnModes(modes);
        }

        setIsConnected(true);
    } catch (err: any) {
        setError(err.message);
    } finally {
        setIsShopifyLoading(false);
    }
  };

  const handleDisconnect = () => {
      setProducts([]);
      setHistoryPast([]);
      setHistoryFuture([]);
      setIsConnected(false);
  };

  const handleRevert = (id: string) => {
      saveToHistory(); // Save before revert
      const original = immutableProducts[id];
      const currentServer = originalProducts[id];
      if (!original) return;

      setProducts(prev => {
          const idx = prev.findIndex(p => p.id === id);
          if (idx === -1) return prev;
          const newArr = [...prev];
          newArr[idx] = { ...original };
          return newArr;
      });

      const isDirty = JSON.stringify(original) !== JSON.stringify(currentServer);
      setSyncStatus(prev => {
          const next = { ...prev };
          if (isDirty) {
              next[id] = 'pending';
          } else {
              delete next[id];
          }
          return next;
      });
  };

  // --- Initialization ---

  useEffect(() => {
    // Check for saved credentials, otherwise use defaults
    const savedShop = localStorage.getItem('seo_shop_creds');
    let credsToUse = DEFAULT_CREDS;

    if (savedShop) {
        try {
            credsToUse = JSON.parse(savedShop);
            setShopifyCreds(credsToUse);
        } catch (e) {}
    }

    // Auto-connect
    if (credsToUse.shop && credsToUse.token) {
        handleShopifyConnect(null, credsToUse);
    }

    // Load AI Config
    const savedAI = localStorage.getItem('seo_ai_config');
    if (savedAI) {
        try {
            const parsed = JSON.parse(savedAI);
            const merged = { 
                ...aiConfig, 
                ...parsed,
                geminiKey: parsed.geminiKey || process.env.API_KEY || ''
            };
            setAiConfig(merged);
            aiServiceRef.current.updateConfig(merged);
        } catch (e) { console.error("Bad ai config"); }
    }
  }, []);

  // Update Service when Config Changes
  useEffect(() => {
     aiServiceRef.current.updateConfig(aiConfig);
     localStorage.setItem('seo_ai_config', JSON.stringify(aiConfig));
  }, [aiConfig]);

  // --- Helpers ---

  const detectDefaultMode = (colName: string): OptimizationMode => {
    const c = colName.toLowerCase();
    
    if (c.includes('selling') || c.includes('bullets')) return 'SELLING_BULLETS';

    // Exact Matches for Options
    if (c.includes('option') || c.includes('value') || c.includes('שיוך')) return 'FACTUAL';

    if (c.includes('keyword')) return 'SEO_KEYWORD'; 
    if (c.includes('slug')) return 'SEO_SLUG';
    if (c.includes('rank') || c.includes('seo')) return 'SEO_HIGH';
    if (c.includes('description') && !c.includes('short')) return 'HTML_CONTENT';
    if (c.includes('short')) return 'SHORT_DESCRIPTION';
    if (c.includes('name') || c.includes('title')) {
        return 'PROFESSIONAL'; 
    }
    return 'FACTUAL';
  };

  // --- Selection Logic ---

  const toggleSelection = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedIds(newSet);
  };

  const toggleAll = () => {
      if (selectedIds.size === filteredProducts.length && filteredProducts.length > 0) {
          setSelectedIds(new Set());
      } else {
          const newSet = new Set(filteredProducts.map(p => p.id));
          setSelectedIds(newSet);
      }
  };

  // --- Core Action: Optimize ---

  const startOptimization = async () => {
    if (selectedIds.size === 0 || status.isProcessing) return;

    saveToHistory(); // Save before batch start

    setStatus({ total: selectedIds.size, completed: 0, isProcessing: true });
    setError(null);
    setSuccessMsg(null);

    const idsToProcess = Array.from(selectedIds);
    const newProducts = [...products];

    try {
        for (let i = 0; i < idsToProcess.length; i++) {
            const id = idsToProcess[i];
            if (!id) continue;

            const productIndex = newProducts.findIndex(p => p.id === id);
            if (productIndex === -1) continue;

            const row = newProducts[productIndex];
            
            // Build Batch Items
            const batchItems = selectedColumns.map(col => {
                const mode = columnModes[col] || 'FACTUAL';
                let content = row[col] || '';

                // --- Context Injection based on Research Playbook ---

                // 1. HTML Description: The "High-Conversion" Model (Heebo Template)
                if (mode === 'HTML_CONTENT') {
                     content = `CONTEXT: { Product: "${row.name}", CurrentKeyword: "${row.rank_math_focus_keyword || ''}" } SOURCE_CONTENT: ${content} \n\n MANDATORY: Generate High-End Designed HTML using the 'Heebo' template and Dynamic Color Palette defined in the System Instructions. STRICTLY NO MARKDOWN. Do NOT include "Kleerix" in text.`;
                }

                // 2. Slug: Hebrew Only
                if (mode === 'SEO_SLUG') {
                     content = `CONTEXT: { Product Name: "${row.name}", Keyword: "${row.rank_math_focus_keyword || ''}" } TASK: Generate Short HEBREW Slug (hyphenated). e.g. מוצר-שם-תכונה. Do NOT include brand name.`;
                }
                
                // 3. Focus Keyword: Commercial Intent Only (No Price)
                if (mode === 'SEO_KEYWORD') {
                    content = `CONTEXT: { Product: "${row.name}", Desc: "${row.short_description || ''}" } TASK: Generate 1 High Intent, Specific Commercial Keyword (3-4 words). Example: "מכשיר לחיזוק כף היד" (with 'ל'). Avoid generic terms. Do NOT use "מחיר" or "Buy".`;
                }

                // 4. Short Description / Meta: CTR Focused
                if (mode === 'SHORT_DESCRIPTION') {
                    if (!content || content.trim() === '') {
                        content = `CONTEXT: { Product: "${row.name}", Keyword: "${row.rank_math_focus_keyword || ''}" } TASK: Generate CTR-Focused Short Description (Benefit + CTA). Do NOT include "Kleerix".`;
                    }
                }

                // 5. SEO Meta Tags (Title/Desc): Strict Formulas
                if (mode === 'SEO_HIGH') {
                    const isTitle = col.includes('title');
                    const isDesc = col.includes('description');
                    const keyword = row.rank_math_focus_keyword || 'AUTO_DETECT'; 
                    
                    if (isTitle) {
                        content = `CONTEXT: { Product: "${row.name}", Keyword: "${keyword}" } TASK: Generate H1/Title. CRITICAL: The Title MUST start with the exact keyword phrase "${keyword}" character-for-character. Do NOT remove prepositions (like 'ל' or 'ב'). Formula: {Exact Keyword} - {Feature}. Max 60 chars.`;
                    } else if (isDesc) {
                        content = `CONTEXT: { Product: "${row.name}", Keyword: "${keyword}", Desc: "${row.short_description || ''}" } TASK: Generate Meta Description. Formula: {Keyword} + {Benefit} + {USP} + {CTA}. Do NOT include "Kleerix". Max 155 chars.`;
                    }
                }

                // 6. Professional Title (Product Name)
                if (mode === 'PROFESSIONAL') {
                     const keyword = row.rank_math_focus_keyword || '';
                     if (keyword) {
                        content = `CONTEXT: { Product: "${row.name}", Keyword: "${keyword}" } TASK: Generate Professional Product Title in Hebrew. 
                        CRITICAL RULE: The title MUST begin with the EXACT keyword phrase "${keyword}". 
                        Verbatim check: If keyword is "מכשיר לחיזוק", title MUST start with "מכשיר לחיזוק". It CANNOT be "מכשיר חיזוק". 
                        Do NOT drop the letter 'ל' or 'ב' or 'ה'. Copy-paste the keyword exactly.`;
                     } else {
                        content = `CONTEXT: { Product: "${row.name}" } TASK: Generate Professional Product Title in Hebrew. Formula: {Product Name} - {Main Feature}. Do NOT include "Kleerix".`;
                     }
                }

                // 7. Selling Bullets (New)
                if (mode === 'SELLING_BULLETS') {
                    content = `CONTEXT: { Product: "${row.name}", Keyword: "${row.rank_math_focus_keyword || ''}" } TASK: Write 5 short, punchy selling bullets (benefits) in Hebrew. Format: Plain text with bullets (•), one per line. Max 4 words per bullet. Focus on: Relief, Comfort, Innovation. Example:\n• הקלה מיידית בכאב\n• נוחות מקסימלית לכל היום`;
                }
                
                // 8. Factual (Options/Values) - UPDATED FOR HEBREW TRANSLATION
                if (mode === 'FACTUAL') {
                    if (col.startsWith('option') || col.includes('name') || col.includes('value')) {
                         content = `TASK: Translate these Product Option Names/Values to Hebrew. Examples: 'Small'->'קטן', 'Blue'->'כחול', 'Size'->'מידה', 'Color'->'צבע'. Maintain comma separation strictly. Input: "${content}"`;
                    } else if (col.includes('שיוך')) {
                         content = `TASK: Translate these Product Option Names/Values to Hebrew. Input: "${content}"`;
                    } else {
                         content = `TASK: Translate to Hebrew. Preserve numbers. Input: "${content}"`;
                    }
                }

                return { text: content, mode: mode, columnName: col };
            }).filter(item => item.text && item.text.length > 0);
            
            if (batchItems.length > 0) {
                const results = await aiServiceRef.current.translateBatch(batchItems);
                batchItems.forEach((item, idx) => {
                    if (results[idx] && item.columnName) {
                        newProducts[productIndex][item.columnName] = results[idx];
                    }
                });
                setSyncStatus(prev => ({ ...prev, [id as string]: 'pending' }));
            }

            setProducts([...newProducts]);
            setStatus(prev => ({ ...prev, completed: i + 1 }));
            
            // Rate Limit Guard
            if (i < idsToProcess.length - 1) await new Promise(r => setTimeout(r, 5000));
        }
    } catch (err: any) {
        const msg = err.message || '';
        if (msg.includes('429')) setError("Rate Limit Exceeded (429). Wait a moment.");
        else setError("AI Optimization Error: " + msg);
    } finally {
        setStatus(prev => ({ ...prev, isProcessing: false }));
        setSuccessMsg("Optimization Cycle Finished.");
    }
  };

  // --- New Feature: Generate Blogs ---
  const handleGenerateBlogs = async () => {
    if (selectedIds.size === 0 || status.isProcessing) return;
    
    setStatus({ total: selectedIds.size * blogCount, completed: 0, isProcessing: true });
    setError(null);
    setSuccessMsg(null);
    
    let successCount = 0;
    let targetBlogTitle = "Default";

    try {
        // 1. Get available blog ID from Shopify
        const blogs = await fetchShopifyBlogs(shopifyCreds);
        
        if (blogs.length === 0) {
            throw new Error("לא נמצאו בלוגים בחנות. אנא וודא שיש לך בלוג קיים והרשאות מתאימות.");
        }

        // Prefer 'News' blog, otherwise fallback to first
        const newsBlog = blogs.find(b => b.handle === 'news' || b.title.toLowerCase() === 'news');
        const targetBlog = newsBlog || blogs[0];
        targetBlogTitle = targetBlog.title;
        
        console.log(`Using Blog: ${targetBlog.title} (ID: ${targetBlog.id})`);

        const idsToProcess = Array.from(selectedIds);

        for (const id of idsToProcess) {
            const product = products.find(p => p.id === id);
            if (!product) continue;

            // 2. Generate Blogs via AI
            // We use the online store URL or construct one if permalink is missing
            let productUrl = product.permalink;
            // Fallback for permalink if it's empty
            if (!productUrl && product.slug) {
                 let shop = shopifyCreds.shop.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
                 productUrl = `https://${shop}/products/${product.slug}`;
            }

            const blogPosts = await aiServiceRef.current.generateProductBlogs(
                product.name,
                productUrl || '#',
                product.image || '',
                blogCount
            );

            if (blogPosts.length === 0) {
                 // Throw explicit error so the user knows WHY it failed (AI didn't return content)
                 throw new Error(`AI generated 0 valid posts for product: ${product.name}. Try reducing strictness or checking AI key.`);
            }

            // 3. Upload to Shopify
            for (const post of blogPosts) {
                const created = await createShopifyArticle(shopifyCreds, targetBlog.id, {
                    title: post.title,
                    contentHtml: post.content_html,
                    tags: post.tags,
                    excerpt: post.excerpt,
                    image: product.image,
                    seo: {
                        title: post.title,
                        description: post.meta_description
                    }
                });
                
                if (created && created.id) {
                    successCount++;
                    setStatus(prev => ({ ...prev, completed: prev.completed + 1 }));
                } else {
                    console.error("Shopify article creation returned empty result", created);
                }
            }
        }
        
        if (successCount === 0) {
            throw new Error("לא נוצרו מאמרים. ייתכן שחלה שגיאה ביצירת התוכן או בחיבור ל-Shopify.");
        }

        setSuccessMsg(`${successCount} מאמרים נוצרו והועלו בהצלחה לבלוג "${targetBlogTitle}"!`);

    } catch (err: any) {
        setError("Blog Generation Error: " + err.message);
    } finally {
        setStatus(prev => ({ ...prev, isProcessing: false }));
    }
  };


  // --- Core Action: Sync to Shopify ---

  const handleSync = async (specificId?: string) => {
      const idsToSync = specificId ? [specificId] : Object.keys(syncStatus).filter(id => syncStatus[id] === 'pending');
      
      if (idsToSync.length === 0) return;

      setSuccessMsg(null);
      
      for (const id of idsToSync) {
          setSyncStatus(prev => ({ ...prev, [id]: 'syncing' }));
          
          const product = products.find(p => p.id === id);
          if (!product) continue;

          try {
              await updateShopifyProduct(shopifyCreds, id, product);
              setSyncStatus(prev => ({ ...prev, [id]: 'synced' }));
              setOriginalProducts(prev => ({ ...prev, [id]: { ...product } }));
          } catch (err: any) {
              console.error(err);
              setSyncStatus(prev => ({ ...prev, [id]: 'error' }));
              setError(`Sync failed for ID ${id}: ${err.message}`);
          }
      }
  };

  const isDirty = (id: string) => {
      return syncStatus[id] === 'pending' || syncStatus[id] === 'error';
  };

  // --- Render Helpers ---

  const filteredProducts = products.filter(p => 
      p.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const SettingsModal = () => (
      <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full">
              <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                      <Settings2 className="w-6 h-6 text-indigo-600" />
                      הגדרות AI
                  </h2>
                  <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-6 h-6" />
                  </button>
              </div>

              <div className="space-y-6">
                  <div className="flex gap-4 p-1 bg-slate-100 rounded-xl">
                      <button 
                          onClick={() => setAiConfig(p => ({...p, provider: 'gemini'}))}
                          className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${aiConfig.provider === 'gemini' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}
                      >
                          <Sparkles className="w-4 h-4" />
                          Google Gemini
                      </button>
                      <button 
                          onClick={() => setAiConfig(p => ({...p, provider: 'openai'}))}
                          className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${aiConfig.provider === 'openai' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}
                      >
                          <Cpu className="w-4 h-4" />
                          OpenAI
                      </button>
                  </div>

                  {aiConfig.provider === 'gemini' ? (
                      <div className="space-y-2">
                          <p className="text-sm text-slate-500 font-bold p-2 bg-slate-50 rounded">
                              מפתח ה-API מוגדר במערכת.
                          </p>
                      </div>
                  ) : (
                      <div className="space-y-4">
                          <div className="space-y-2">
                              <label className="text-sm font-bold text-slate-600">OpenAI API Key</label>
                              <input 
                                  type="password"
                                  value={aiConfig.openAiKey}
                                  onChange={e => setAiConfig(p => ({...p, openAiKey: e.target.value}))}
                                  placeholder="sk-..."
                                  className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 dir-ltr text-left"
                                  dir="ltr"
                              />
                          </div>
                      </div>
                  )}
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
                  <button onClick={() => setShowSettings(false)} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-colors">
                      שמור וסגור
                  </button>
              </div>
          </div>
      </div>
  );

  if (!isConnected) {
      return (
        <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center p-4 font-['Assistant']" dir="rtl">
            <div className="bg-white rounded-[2rem] shadow-2xl p-10 max-w-md w-full text-center">
                 <div className="bg-[#95bf47] w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-lime-200">
                    <ShoppingCart className="w-12 h-12 text-white" />
                 </div>
                 <h1 className="text-3xl font-black text-slate-900 mb-2">חיבור ל-Shopify</h1>
                 <p className="text-slate-500 mb-8">הזן את כתובת החנות ו-Access Token (Admin API) כדי לערוך מוצרים.</p>

                 <form onSubmit={handleShopifyConnect} className="space-y-4 text-right">
                    <div>
                        <label className="block text-sm font-bold text-slate-600 mb-1">כתובת החנות (Shop Domain)</label>
                        <input type="text" placeholder="store-name.myshopify.com" value={shopifyCreds.shop} onChange={e=>setShopifyCreds(p=>({...p, shop: e.target.value}))} className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500" dir="ltr" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-600 mb-1">Admin API Access Token</label>
                        <input type="password" placeholder="shpat_..." value={shopifyCreds.token} onChange={e=>setShopifyCreds(p=>({...p, token: e.target.value}))} className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500" dir="ltr" />
                    </div>
                    
                    {error && (
                        <div className="text-rose-600 text-sm font-bold bg-rose-50 p-4 rounded-xl border border-rose-200 whitespace-pre-wrap">
                            {error.includes("ACTIVATION_REQUIRED") ? (
                                <div className="flex flex-col gap-2 items-center text-center">
                                    <span className="text-lg">🛑 נדרשת פעולה חד-פעמית</span>
                                    <span>הדפדפן חוסם את הגישה. כדי לעקוף זאת:</span>
                                    <a 
                                        href={error.split('https')[1] ? `https${error.split('https')[1]}` : "https://cors-anywhere.herokuapp.com/corsdemo"}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="bg-rose-600 text-white px-4 py-2 rounded-lg font-black hover:bg-rose-700 transition-all shadow-lg"
                                    >
                                        לחץ כאן לשחרור החסימה
                                    </a>
                                    <span className="text-xs text-rose-500 mt-1">לאחר הלחיצה ואישור בדף שנפתח, חזור לכאן ולחץ "התחבר לחנות" שוב.</span>
                                </div>
                            ) : error}
                        </div>
                    )}

                    <button type="submit" disabled={isShopifyLoading} className="w-full bg-[#95bf47] text-white py-4 rounded-xl font-black text-lg hover:bg-[#85ab3f] transition-all flex justify-center gap-2 shadow-lg shadow-lime-200">
                        {isShopifyLoading ? <Loader2 className="animate-spin" /> : 'התחבר לחנות'}
                    </button>
                 </form>
            </div>
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-[#f1f5f9] flex flex-col font-['Assistant'] text-right" dir="rtl">
        {showSettings && <SettingsModal />}

        {/* Top Navigation Bar */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
            <div className="w-full px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="bg-[#95bf47] p-2 rounded-lg shadow-lg shadow-lime-200">
                        <Sparkles className="text-white w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900">SEO Live Editor (Shopify)</h1>
                        <div className="flex items-center gap-2 text-xs text-slate-500 font-bold">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            מחובר ל-{shopifyCreds.shop.replace('https://','')}
                        </div>
                    </div>
                </div>

                <div className="flex-1 max-w-xl mx-8 relative hidden md:block">
                     <Search className="absolute right-4 top-3.5 w-5 h-5 text-slate-400" />
                     <input 
                        type="text" 
                        placeholder="חיפוש מוצרים (שם או מק״ט)..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-100 border-none rounded-2xl py-3 pr-12 pl-4 font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500"
                     />
                </div>

                <div className="flex items-center gap-3">
                    {/* Undo/Redo Buttons */}
                    <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 mx-2">
                        <button 
                            onClick={handleUndo} 
                            disabled={historyPast.length === 0}
                            className={`p-2 rounded-lg transition-all ${historyPast.length > 0 ? 'text-slate-600 hover:bg-white hover:shadow-sm' : 'text-slate-300'}`}
                            title="Undo (Ctrl+Z)"
                        >
                            <Undo2 className="w-5 h-5" />
                        </button>
                        <button 
                            onClick={handleRedo}
                            disabled={historyFuture.length === 0}
                            className={`p-2 rounded-lg transition-all ${historyFuture.length > 0 ? 'text-slate-600 hover:bg-white hover:shadow-sm' : 'text-slate-300'}`}
                            title="Redo (Ctrl+Y)"
                        >
                            <Redo2 className="w-5 h-5" />
                        </button>
                    </div>

                    <button 
                        onClick={() => setShowSettings(true)}
                        className="p-3 bg-slate-100 rounded-xl text-slate-600 hover:bg-slate-200 transition-all"
                        title="הגדרות AI"
                    >
                        <Settings2 className="w-5 h-5" />
                    </button>
                    <button 
                        onClick={() => handleShopifyConnect(null)} 
                        className="p-3 bg-slate-100 rounded-xl text-slate-600 hover:bg-slate-200 transition-all"
                        title="רענן נתונים"
                    >
                        <RefreshCw className={`w-5 h-5 ${isShopifyLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <button 
                        onClick={handleDisconnect} 
                        className="p-3 bg-rose-50 rounded-xl text-rose-600 hover:bg-rose-100 transition-all"
                        title="התנתק"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </header>

        {/* Main Workspace */}
        <main className="flex-1 flex overflow-hidden w-full p-6 gap-6">
            
            {/* Sidebar: Configuration */}
            <aside className="w-80 shrink-0 flex flex-col gap-6 overflow-y-auto custom-scrollbar pb-20">
                {/* Status Card */}
                {status.isProcessing && (
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-indigo-100">
                        <div className="flex items-center gap-3 mb-4 text-indigo-600">
                            <Loader2 className="w-6 h-6 animate-spin" />
                            <h3 className="font-black">מעבד נתונים...</h3>
                        </div>
                        <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                            <div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${(status.completed / status.total) * 100}%` }}></div>
                        </div>
                        <div className="mt-2 text-xs font-bold text-slate-400 text-center">
                            מוצר {status.completed} מתוך {status.total}
                        </div>
                    </div>
                )}

                {/* Actions Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sticky top-0">
                    <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                        <Zap className="w-5 h-5 text-indigo-500" />
                        פעולות
                    </h3>
                    
                    <div className="space-y-3">
                        <button 
                            onClick={startOptimization}
                            disabled={selectedIds.size === 0 || status.isProcessing}
                            className={`w-full py-4 rounded-xl font-black flex items-center justify-center gap-2 transition-all shadow-lg ${selectedIds.size > 0 ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                        >
                            <Sparkles className="w-5 h-5" />
                            אופטימיזציה ל-{selectedIds.size}
                        </button>
                        
                        <div className="pt-2">
                            <div className="flex items-center justify-between mb-2 px-1">
                                <label className="text-sm font-bold text-slate-600">כמות מאמרים:</label>
                                <div className="flex bg-slate-100 rounded-lg p-1">
                                    {[1, 2, 3].map(n => (
                                        <button
                                            key={n}
                                            onClick={() => setBlogCount(n)}
                                            className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${blogCount === n ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button 
                                onClick={handleGenerateBlogs}
                                disabled={selectedIds.size === 0 || status.isProcessing}
                                className={`w-full py-4 rounded-xl font-black flex items-center justify-center gap-2 transition-all shadow-lg ${selectedIds.size > 0 ? 'bg-violet-600 text-white hover:bg-violet-700 shadow-violet-200' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                            >
                                <PenTool className="w-5 h-5" />
                                צור {blogCount} מאמרי SEO
                            </button>
                        </div>

                        <button 
                            onClick={() => handleSync()}
                            disabled={Object.values(syncStatus).filter(s => s === 'pending').length === 0}
                            className={`w-full py-4 rounded-xl font-black flex items-center justify-center gap-2 transition-all shadow-lg ${Object.values(syncStatus).filter(s => s === 'pending').length > 0 ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                        >
                            <Save className="w-5 h-5" />
                            שמור שינויים לחנות
                        </button>
                        
                        {successMsg && (
                            <div className="mt-4 p-3 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-100 animate-in fade-in">
                                {successMsg}
                            </div>
                        )}
                        {error && (
                            <div className="mt-4 p-3 bg-rose-50 text-rose-700 text-xs font-bold rounded-xl border border-rose-100">
                                {error}
                            </div>
                        )}
                    </div>
                </div>

                {/* Column Selection */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-black text-slate-800 mb-4 border-b pb-4 border-slate-100">
                        מה לשפר?
                    </h3>
                    <div className="space-y-3">
                        {allColumns.map(col => {
                            const isSel = selectedColumns.includes(col);
                            return (
                                <div key={col} className={`p-3 rounded-xl border transition-all ${isSel ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-transparent'}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <button 
                                            onClick={() => setSelectedColumns(prev => isSel ? prev.filter(c => c!==col) : [...prev, col])}
                                            className="flex items-center gap-2 text-sm font-bold text-slate-700"
                                        >
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSel ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                                                {isSel && <CheckSquare className="w-3 h-3 text-white" />}
                                            </div>
                                            {COLUMN_LABELS_HE[col] || col}
                                        </button>
                                    </div>
                                    {isSel && (
                                        <select 
                                            value={columnModes[col]} 
                                            onChange={e => setColumnModes(p => ({...p, [col]: e.target.value as OptimizationMode}))}
                                            className="w-full text-xs p-2 rounded-lg border-slate-200 bg-white"
                                        >
                                            {Object.entries(MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                        </select>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            </aside>

            {/* Product Grid */}
            <section className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                {/* Grid Header */}
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <button onClick={toggleAll} className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-indigo-600">
                            {selectedIds.size === filteredProducts.length && filteredProducts.length > 0 ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5" />}
                            בחר הכל
                        </button>
                        <span className="text-sm font-bold text-slate-400">|</span>
                        <span className="text-sm text-slate-500 font-bold">{filteredProducts.length} מוצרים</span>
                    </div>
                </div>

                {/* Table Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-sm text-right">
                        <thead className="bg-slate-50 text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 w-12"></th>
                                <th className="p-4 w-20">תמונה</th>
                                <th className="p-4">זיהוי (ID)</th>
                                <th className="p-4 w-24 text-center">ציון SEO</th>
                                {selectedColumns.map(col => (
                                    <th key={col} className="p-4 min-w-[200px] bg-slate-50">{COLUMN_LABELS_HE[col] || col}</th>
                                ))}
                                <th className="p-4 w-28 text-center">פעולות</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredProducts.map(product => {
                                const isSelected = selectedIds.has(product.id);
                                const dirty = isDirty(product.id);
                                const syncState = syncStatus[product.id];
                                const canRevert = JSON.stringify(product) !== JSON.stringify(immutableProducts[product.id]);
                                
                                const { score, issues } = calculateSeoScore(product);

                                return (
                                    <tr key={product.id} className={`group hover:bg-slate-50/80 transition-colors ${isSelected ? 'bg-indigo-50/30' : ''}`}>
                                        <td className="p-4">
                                            <button onClick={() => toggleSelection(product.id)}>
                                                {isSelected ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5 text-slate-300 group-hover:text-slate-400" />}
                                            </button>
                                        </td>
                                        <td className="p-4">
                                            <div className="w-16 h-16 bg-white rounded-lg border border-slate-200 p-1">
                                                {product.image ? (
                                                    <img src={product.image} className="w-full h-full object-cover rounded" alt="" />
                                                ) : <ImageIcon className="w-full h-full text-slate-200 p-4" />}
                                            </div>
                                        </td>
                                        <td className="p-4 align-top">
                                            <div className="font-bold text-slate-800 line-clamp-2 mb-1">{product.name}</div>
                                            <div className="text-xs text-slate-400 font-mono mb-2">{product.sku || 'No SKU'}</div>
                                            <div className="flex flex-col gap-1.5 mt-1">
                                                <div className="flex gap-2">
                                                    {product.status === 'active' ? 
                                                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">פעיל</span> :
                                                        <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold">לא פעיל</span>
                                                    }
                                                </div>
                                            </div>
                                        </td>
                                        
                                        <td className="p-4 align-top">
                                            <div className="flex flex-col items-center gap-1 group/score relative">
                                                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-sm border-4 cursor-help ${
                                                    score >= 80 ? 'border-emerald-100 bg-emerald-50 text-emerald-700' :
                                                    score >= 50 ? 'border-amber-100 bg-amber-50 text-amber-700' :
                                                    'border-rose-100 bg-rose-50 text-rose-700'
                                                }`}>
                                                    {score}
                                                </div>
                                                <span className="text-[10px] font-bold text-slate-400">Rank Math</span>
                                                
                                                {/* Issues Tooltip */}
                                                {issues.length > 0 && (
                                                    <div className="absolute top-14 z-50 w-64 p-3 bg-white rounded-xl shadow-xl border border-slate-100 opacity-0 invisible group-hover/score:opacity-100 group-hover/score:visible transition-all text-right pointer-events-none">
                                                        <div className="text-[10px] font-bold text-slate-400 mb-2 border-b pb-1">לשיפור (Missing):</div>
                                                        <ul className="list-disc list-inside space-y-1">
                                                            {issues.map((issue, idx) => (
                                                                <li key={idx} className="text-[10px] text-slate-600 leading-tight">{issue}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        </td>

                                        {selectedColumns.map(col => {
                                            const val = product[col] || '';
                                            const origVal = originalProducts[product.id]?.[col] || '';
                                            const isChanged = val !== origVal;
                                            
                                            return (
                                                <td key={col} className={`p-4 align-top max-w-xs ${isChanged ? 'bg-amber-50/50' : ''}`}>
                                                    <div className="line-clamp-3 text-slate-600 leading-relaxed text-xs whitespace-pre-line">
                                                        {val}
                                                    </div>
                                                    {isChanged && <div className="text-[10px] text-amber-600 font-bold mt-1 flex items-center gap-1"><Sparkles className="w-3 h-3"/> שונה ע"י AI</div>}
                                                </td>
                                            );
                                        })}

                                        <td className="p-4 align-middle">
                                            <div className="flex items-center justify-center gap-2">
                                                {canRevert && !syncState && (
                                                    <button 
                                                        onClick={() => handleRevert(product.id)}
                                                        className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 hover:text-slate-700 transition-all"
                                                        title="שחזר למקור"
                                                    >
                                                        <RotateCcw className="w-4 h-4" />
                                                    </button>
                                                )}

                                                {syncState === 'syncing' && <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />}
                                                {syncState === 'synced' && <CheckCircle2 className="w-6 h-6 text-emerald-500" />}
                                                {syncState === 'error' && <div title="שגיאה בסנכרון"><AlertCircle className="w-6 h-6 text-rose-500" /></div>}
                                                {(!syncState && dirty) && (
                                                    <button 
                                                        onClick={() => handleSync(product.id)}
                                                        className="bg-emerald-600 text-white p-2 rounded-lg hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all"
                                                        title="שמור שינויים לחנות"
                                                    >
                                                        <Save className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    
                    {filteredProducts.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                             <Search className="w-16 h-16 mb-4 opacity-20" />
                             <p className="font-bold text-lg">לא נמצאו מוצרים</p>
                        </div>
                    )}
                </div>
            </section>
        </main>
    </div>
  );
}
