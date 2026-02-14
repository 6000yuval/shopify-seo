
export interface ShopifyCredentials {
  shop: string; // e.g. "my-store.myshopify.com"
  token: string; // Admin API Access Token (shpat_...)
}

// --- Internal Helper for Robust Fetching ---

const robustShopifyFetch = async (creds: ShopifyCredentials, query: string, variables?: any) => {
    // 1. Sanitize Shop URL
    let shop = creds.shop.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!shop.includes('myshopify.com') && !shop.includes('.')) {
        shop += '.myshopify.com';
    }

    // 2. Token & Endpoint
    const cleanToken = creds.token.trim();
    const version = '2024-04'; // Stable version
    const endpoint = `https://${shop}/admin/api/${version}/graphql.json`;

    // 3. Execution Wrapper
    const execute = async (proxyUrl: string) => {
        const res = await fetch(proxyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Shopify-Access-Token': cleanToken
            },
            body: JSON.stringify({ query, variables })
        });

        const txt = await res.text();

        // Specific handling for Shopify's HTML 401 response vs JSON 401
        if (res.status === 401) {
             throw new Error(`Authentication Failed (401). Shopify rejected the token for ${shop}. Please ensure the token is valid for this specific shop.`);
        }
        
        if (!res.ok) {
             throw new Error(`HTTP Error ${res.status}: ${txt}`);
        }
        
        try {
            const json = JSON.parse(txt);
            
            // Top level errors (e.g. invalid query)
            if (json.errors) {
                const errorMsg = Array.isArray(json.errors) 
                    ? json.errors.map((e:any) => e.message).join(' | ') 
                    : JSON.stringify(json.errors);
                throw new Error(`Shopify API Error: ${errorMsg}`);
            }
            
            // Mutation userErrors
            const mutationKeys = Object.keys(json.data || {});
            for (const key of mutationKeys) {
                if (json.data[key]?.userErrors?.length > 0) {
                    const msgs = json.data[key].userErrors.map((e:any) => e.message).join(', ');
                    throw new Error(`Mutation Error: ${msgs}`);
                }
            }
            return json;
        } catch (e: any) {
            // Check if it's the specific "Invalid API key" HTML/Text response
            if (txt.includes("Invalid API key")) {
                 throw new Error("Shopify rejected the Access Token. Please verify it starts with 'shpat_'.");
            }
            throw new Error(`Invalid JSON Response: ${e.message}`);
        }
    };

    // Retry Strategy: 
    // We use corsproxy.io because it handles headers correctly.
    // We encode the URL to be safe.
    try {
        const targetUrl = endpoint; 
        return await execute(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`);
    } catch (error: any) {
        console.warn("Primary proxy failed, trying backup...", error.message);
        throw new Error(`Connection Failed. ${error.message}`);
    }
};

// --- Mappers ---

const mapShopifyProduct = (node: any) => {
    const seo = node.seo || {};
    const keywordMeta = node.metafields?.edges?.find((e: any) => e.node.key === 'focus_keyword' || e.node.key === 'seo_keywords');
    const keyword = keywordMeta ? keywordMeta.node.value : '';

    // Map Options
    const options = node.options || [];
    const option1 = options[0];
    const option2 = options[1];
    const option3 = options[2];

    return {
        id: node.id,
        name: node.title,
        status: node.status.toLowerCase(),
        slug: node.handle,
        description: node.descriptionHtml || '',
        short_description: seo.description || '', 
        sku: node.variants?.edges?.[0]?.node?.sku || '',
        image: node.featuredImage?.url || '',
        rank_math_title: seo.title || '',
        rank_math_description: seo.description || '',
        rank_math_focus_keyword: keyword,
        permalink: node.onlineStoreUrl || '',
        
        // Option Columns for Translation
        option1_name: option1 ? option1.name : '',
        option1_values: option1 ? option1.values.join(', ') : '',
        option2_name: option2 ? option2.name : '',
        option2_values: option2 ? option2.values.join(', ') : '',
        option3_name: option3 ? option3.name : '',
        option3_values: option3 ? option3.values.join(', ') : ''
    };
};

// --- Exports ---

export const fetchShopifyProducts = async (creds: ShopifyCredentials): Promise<any[]> => {
  const query = `
    {
      products(first: 50) {
        edges {
          node {
            id
            title
            handle
            status
            descriptionHtml
            onlineStoreUrl
            featuredImage { url }
            variants(first: 1) {
              edges { node { sku } }
            }
            options {
              name
              values
            }
            seo {
              title
              description
            }
            metafields(first: 10, namespace: "custom") {
              edges {
                node {
                  key
                  value
                  namespace
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await robustShopifyFetch(creds, query);
  return data.data.products.edges.map((e: any) => mapShopifyProduct(e.node));
};

export const updateShopifyProduct = async (creds: ShopifyCredentials, productId: string, data: any): Promise<boolean> => {
    const mutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            title
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const metafields = [];
    if (data.rank_math_focus_keyword) {
        metafields.push({
            namespace: "custom",
            key: "focus_keyword",
            value: data.rank_math_focus_keyword,
            type: "single_line_text_field"
        });
    }

    const variables = {
        input: {
            id: productId,
            title: data.name,
            descriptionHtml: data.description,
            handle: data.slug,
            seo: {
                title: data.rank_math_title,
                description: data.rank_math_description || data.short_description
            },
            metafields: metafields.length > 0 ? metafields : undefined
        }
    };

    await robustShopifyFetch(creds, mutation, variables);
    return true;
};

export const fetchShopifyBlogs = async (creds: ShopifyCredentials): Promise<{id: string, title: string, handle: string}[]> => {
    const query = `
    {
      blogs(first: 20) {
        edges {
          node {
            id
            title
            handle
          }
        }
      }
    }
    `;
    
    const data = await robustShopifyFetch(creds, query);
    return data.data?.blogs?.edges?.map((e:any) => e.node) || [];
};

export const createShopifyArticle = async (creds: ShopifyCredentials, blogId: string, article: {
    title: string, 
    contentHtml: string, 
    tags: string[], 
    excerpt: string, 
    image?: string,
    seo?: { title?: string, description?: string }
}) => {
    const mutation = `
      mutation articleCreate($article: ArticleCreateInput!) {
        articleCreate(article: $article) {
          article {
            id
            handle
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    let imageUrl = article.image || "";
    if (imageUrl) {
        if (imageUrl.startsWith('//')) {
            imageUrl = 'https:' + imageUrl;
        }
        if (imageUrl.startsWith('http')) {
            try {
               const urlObj = new URL(imageUrl);
               imageUrl = urlObj.origin + urlObj.pathname;
            } catch(e) {}
        } else {
            imageUrl = "";
        }
    }

    const imageInput = imageUrl 
        ? { url: imageUrl, altText: article.title } 
        : undefined;

    const variables = {
        article: {
            blogId: blogId,
            title: article.title || "Untitled SEO Article", 
            body: article.contentHtml || "<p>Content generation failed.</p>",
            summary: article.excerpt || "",
            tags: article.tags || [],
            image: imageInput,
            author: { name: "SEO Editor" },
            isPublished: true,
            seo: {
                title: article.seo?.title || article.title,
                description: article.seo?.description || article.excerpt
            }
        }
    };

    const data = await robustShopifyFetch(creds, mutation, variables);
    
    if (!data.data?.articleCreate?.article) {
        console.error("Shopify articleCreate missing article object. Data:", data);
        throw new Error("Shopify accepted the request but returned no Article object. Check permissions.");
    }

    return data.data.articleCreate.article;
};
