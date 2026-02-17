
export interface ShopifyCredentials {
  shop: string;
  token: string;
}

// ===============================
// CLOUD RUN PROXY CONFIG
// ===============================

const PROXY_URL = "https://shopify-proxy-1021730791396.us-west1.run.app/graphql";
const PROXY_KEY = "abc123"; // change if you updated it in Cloud Run

// ===============================
// ROBUST FETCH (VIA CLOUD RUN)
// ===============================

const robustShopifyFetch = async (_creds: ShopifyCredentials, query: string, variables?: any) => {
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Proxy-Key": PROXY_KEY
    },
    body: JSON.stringify({
      apiVersion: "2024-04",
      query,
      variables
    })
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(`Proxy HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  }

  if (json.errors) {
    const msg = Array.isArray(json.errors)
      ? json.errors.map((e:any) => e.message).join(" | ")
      : String(json.errors);
    throw new Error(`Shopify API Error: ${msg}`);
  }

  return json;
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
  const bullets = bulletsMeta ? bulletsMeta.node.value : "";

  const options = node.options || [];
  const option1 = options[0];
  const option2 = options[1];
  const option3 = options[2];

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
    selling_bullets: bullets, // New mapped field
    permalink: node.onlineStoreUrl || "",
    
    // Map Option Names & Values
    // Note: We store IDs to allow updating names later
    option1_id: option1 ? option1.id : "",
    option1_name: option1 ? option1.name : "",
    option1_values: option1 ? option1.values.join(", ") : "",
    
    option2_id: option2 ? option2.id : "",
    option2_name: option2 ? option2.name : "",
    option2_values: option2 ? option2.values.join(", ") : "",
    
    option3_id: option3 ? option3.id : "",
    option3_name: option3 ? option3.name : "",
    option3_values: option3 ? option3.values.join(", ") : ""
  };
};

// ===============================
// EXPORTS
// ===============================

export const fetchShopifyProducts = async (_creds: ShopifyCredentials): Promise<any[]> => {
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

  const data = await robustShopifyFetch(_creds, query);
  return data.data.products.edges.map((e: any) => mapShopifyProduct(e.node));
};

export const updateShopifyProduct = async (
  _creds: ShopifyCredentials,
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

  // Selling Bullets
  if (data.selling_bullets) {
    // We treat it as multi_line_text_field (string with newlines)
    // If your theme expects a list, this might need to be "list.single_line_text_field" and value as JSON string array.
    // Based on common practices for "bullets text block", multi_line is safest default.
    metafields.push({
      namespace: "custom",
      key: "selling_bullets_a",
      value: data.selling_bullets,
      type: "multi_line_text_field"
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
      // options: [] -- REMOVED: Cannot pass options here in this API version
    }
  };

  await robustShopifyFetch(_creds, productMutation, variables);

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
        await robustShopifyFetch(_creds, optionMutation, {
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

export const fetchShopifyBlogs = async (_creds: ShopifyCredentials) => {
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

  const data = await robustShopifyFetch(_creds, query);
  return data.data?.blogs?.edges?.map((e: any) => e.node) || [];
};

export const createShopifyArticle = async (
  _creds: ShopifyCredentials,
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
  // FIX: Shopify ArticleImageInput expects 'url', NOT 'src'.
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
      // seo: ... removed as it is not supported in ArticleCreateInput in this API version
    }
  };

  const data = await robustShopifyFetch(_creds, mutation, variables);

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
