
export interface ShopifyCredentials {
  shop: string;
  token: string;
}

// ===============================
// LOCAL VITE PROXY CONFIG
// ===============================

// We point to the local proxy defined in vite.config.ts
const PROXY_URL = "/api/graphql";

// ===============================
// ROBUST FETCH (VIA LOCAL PROXY)
// ===============================

const robustShopifyFetch = async (creds: ShopifyCredentials, query: string, variables?: any) => {
  // Setup Timeout to prevent "stuck" UI
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds max

  try {
      // 1. Send request to our local Vite proxy
      // The vite.config.ts router handles the redirection to the specific shop
      const res = await fetch(PROXY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // 2. Send the Token HERE so Shopify receives it
          "X-Shopify-Access-Token": creds.token,
          // 3. Send the Shop Domain so Vite knows where to route the request
          "X-Shop-Domain": creds.shop
        },
        body: JSON.stringify({
          query,
          variables
        }),
        signal: controller.signal
      });

      // Clear timeout if response received
      clearTimeout(timeoutId);

      const json = await res.json();

      if (!res.ok) {
        throw new Error(`HTTP Error ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
      }

      // 4. Handle GraphQL Errors (Shopify specific)
      if (json.errors) {
        const msg = Array.isArray(json.errors)
          ? json.errors.map((e:any) => e.message).join(" | ")
          : String(json.errors);
        throw new Error(`Shopify API Error: ${msg}`);
      }

      return json;

  } catch (error: any) {
      if (error.name === 'AbortError') {
          throw new Error("Connection timed out. Please check your internet or the Shop Domain.");
      }
      throw error;
  } finally {
      clearTimeout(timeoutId);
  }
};

// ===============================
// MAPPERS
// ===============================

const mapShopifyProduct = (node: any) => {
  const seo = node.seo || {};
  
  // Find Metafields
  const keywordMeta = node.metafields?.edges?.find(
    (e: any) => e.node.key === "focus_keyword" || e.node.key === "seo_keywords"
  );
  const bulletsMeta = node.metafields?.edges?.find(
    (e: any) => e.node.key === "selling_bullets_a"
  );

  const keyword = keywordMeta ? keywordMeta.node.value : "";
  
  // Handle Selling Bullets (List Type)
  let bullets = "";
  if (bulletsMeta && bulletsMeta.node.value) {
      try {
          // Check if it's a JSON array string (Shopify List type)
          const parsed = JSON.parse(bulletsMeta.node.value);
          if (Array.isArray(parsed)) {
              // Convert array ["Item 1", "Item 2"] to "• Item 1\n• Item 2" for the editor
              bullets = parsed.map(b => b.replace(/^•\s*/, '')).map(b => `• ${b}`).join("\n");
          } else {
              bullets = String(bulletsMeta.node.value);
          }
      } catch (e) {
          // Fallback if not JSON
          bullets = String(bulletsMeta.node.value);
      }
  }

  const options = node.options || [];
  
  return {
    id: node.id,
    name: node.title,
    status: node.status.toLowerCase(),
    slug: node.handle,
    description: node.descriptionHtml || "",
    short_description: seo.description || "",
    sku: node.variants?.edges?.[0]?.node?.sku || "",
    image: node.featuredImage?.url || "",
    rank_math_title: seo.title || "",
    rank_math_description: seo.description || "",
    rank_math_focus_keyword: keyword,
    selling_bullets: bullets,
    permalink: node.onlineStoreUrl || "",
    
    // Map Option Names & Values
    // Note: We store IDs to allow updating names later
    option1_id: options[0] ? options[0].id : "",
    option1_name: options[0] ? options[0].name : "",
    option1_values: options[0] ? options[0].values.join(", ") : "",
    
    option2_id: options[1] ? options[1].id : "",
    option2_name: options[1] ? options[1].name : "",
    option2_values: options[1] ? options[1].values.join(", ") : "",
    
    option3_id: options[2] ? options[2].id : "",
    option3_name: options[2] ? options[2].name : "",
    option3_values: options[2] ? options[2].values.join(", ") : ""
  };
};

// ===============================
// EXPORTS
// ===============================

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
              id
              name
              values
            }
            seo {
              title
              description
            }
            metafields(first: 20, namespace: "custom") {
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

export const updateShopifyProduct = async (
  creds: ShopifyCredentials,
  productId: string,
  data: any
): Promise<boolean> => {
  // 1. Update Main Product Fields (Title, Desc, Handle, SEO, Metafields)
  const productMutation = `
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
  
  // SEO Keyword
  if (data.rank_math_focus_keyword) {
    metafields.push({
      namespace: "custom",
      key: "focus_keyword",
      value: data.rank_math_focus_keyword,
      type: "single_line_text_field"
    });
  }

  // Selling Bullets - Handle as List
  if (data.selling_bullets) {
    // 1. Clean the input string (remove existing bullets, split by newline)
    const rawLines = data.selling_bullets.split('\n');
    const cleanList = rawLines
        .map((line: string) => line.replace(/^•\s*/, '').trim()) // Remove '• ' and whitespace
        .filter((line: string) => line.length > 0); // Remove empty lines

    // 2. Prepare for Shopify: JSON Stringify for value, correct type for schema
    metafields.push({
      namespace: "custom",
      key: "selling_bullets_a",
      value: JSON.stringify(cleanList), // Must be a stringified JSON array
      type: "list.single_line_text_field"
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
      metafields: metafields.length > 0 ? metafields : undefined,
      redirectNewHandle: true
    }
  };

  await robustShopifyFetch(creds, productMutation, variables);

  // 2. Update Option Names (if IDs are present)
  // We do this via separate mutations because productUpdate doesn't support renaming options directly via list
  const optionMutation = `
    mutation productOptionUpdate($productId: ID!, $optionId: ID!, $name: String!) {
      productOptionUpdate(productId: $productId, optionId: $optionId, name: $name) {
        userErrors {
          field
          message
        }
      }
    }
  `;

  // Helper to update one option
  const updateOptionName = async (optId: string, newName: string) => {
    if (!optId || !newName) return;
    try {
        await robustShopifyFetch(creds, optionMutation, {
            productId: productId,
            optionId: optId,
            name: newName
        });
    } catch (e) {
        console.warn(`Failed to update option ${optId} name to ${newName}`, e);
    }
  };

  if (data.option1_id && data.option1_name) await updateOptionName(data.option1_id, data.option1_name);
  if (data.option2_id && data.option2_name) await updateOptionName(data.option2_id, data.option2_name);
  if (data.option3_id && data.option3_name) await updateOptionName(data.option3_id, data.option3_name);

  return true;
};

export const fetchShopifyBlogs = async (creds: ShopifyCredentials) => {
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
  return data.data?.blogs?.edges?.map((e: any) => e.node) || [];
};

export const createShopifyArticle = async (
  creds: ShopifyCredentials,
  blogId: string,
  article: {
    title: string;
    contentHtml: string;
    tags: string[];
    excerpt: string;
    image?: string;
    seo?: { title?: string; description?: string };
  }
) => {
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

  // Map image if exists
  let imageInput = undefined;
  if (article.image) {
      imageInput = { url: article.image, altText: article.title };
  }

  const variables = {
    article: {
      blogId,
      title: article.title,
      body: article.contentHtml,
      summary: article.excerpt,
      tags: article.tags || [],
      isPublished: true,
      author: { name: "צוות Kleerix" }, // Required field
      image: imageInput
    }
  };

  const data = await robustShopifyFetch(creds, mutation, variables);

  if (!data.data?.articleCreate?.article) {
     // Check for userErrors
     if (data.data?.articleCreate?.userErrors?.length > 0) {
         const msgs = data.data.articleCreate.userErrors.map((e:any) => e.message).join(', ');
         throw new Error(`Shopify API Validation Error: ${msgs}`);
     }
     throw new Error("Shopify accepted request but returned no Article object.");
  }

  return data.data.articleCreate.article;
};
