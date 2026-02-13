import axios, { type AxiosInstance, type AxiosError } from 'axios';
import https from 'https';
import FormData from 'form-data';
import type {
  WPPost,
  WPMedia,
  WPCategory,
  WPTag,
  SlimSeoMeta,
  CreatePostPayload,
  UpdatePostPayload,
} from '../types/wordpress.js';

/**
 * WordPress REST API client for managing posts, media, taxonomies,
 * and Slim SEO meta fields.
 */
export class WordPressService {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.WP_BASE_URL!;
    const username = process.env.WP_USERNAME?.trim() || '';
    const password = process.env.WP_APP_PASSWORD?.trim() || '';

    if (!this.baseUrl || !username || !password) {
      throw new Error('WP_BASE_URL, WP_USERNAME, and WP_APP_PASSWORD are required');
    }

    this.client = axios.create({
      baseURL: `${this.baseUrl}/wp-json/wp/v2`,
      auth: { username, password },
      headers: {
        'User-Agent': 'Webmage-SEO-Village/1.0',
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
      timeout: 30000,
    });
  }

  // =============================================================================
  // Connection Tests
  // =============================================================================

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/users/me');
      console.log(`  ✓ Connected to WordPress as: ${response.data.name} (ID: ${response.data.id})`);
      return true;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          console.error('  ❌ WordPress Authentication Failed: [401] Unauthorized');
        } else {
          console.error(`  ❌ WordPress Connection Failed: [${error.response?.status}] ${error.response?.data?.message || error.message}`);
        }
      } else {
        console.error('  ❌ WordPress Connection Failed:', error instanceof Error ? error.message : String(error));
      }
      return false;
    }
  }

  // =============================================================================
  // Post CRUD
  // =============================================================================

  /**
   * Fetch all posts, handling pagination automatically
   */
  async getAllPosts(postType = 'posts'): Promise<WPPost[]> {
    const allPosts: WPPost[] = [];
    let page = 1;
    const perPage = 100;

    console.log(`  Fetching ${postType} from WordPress...`);

    while (true) {
      try {
        const response = await this.client.get<WPPost[]>(`/${postType}`, {
          params: {
            page,
            per_page: perPage,
            _fields: 'id,title,content,excerpt,slug,status,featured_media,categories,tags,acf,meta',
          },
        });

        allPosts.push(...response.data);

        const totalPages = parseInt(response.headers['x-wp-totalpages'] || '1', 10);
        if (page >= totalPages) break;
        page++;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 400) break;
        throw this.handleError(error, `Failed to fetch ${postType}`);
      }
    }

    console.log(`  Found ${allPosts.length} ${postType}`);
    return allPosts;
  }

  /**
   * Get a single post by ID
   */
  async getPost(id: number, postType = 'posts'): Promise<WPPost> {
    try {
      const response = await this.client.get<WPPost>(`/${postType}/${id}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error, `Failed to fetch ${postType} ${id}`);
    }
  }

  /**
   * Create a new post
   */
  async createPost(payload: CreatePostPayload, postType = 'posts'): Promise<WPPost> {
    try {
      const response = await this.client.post<WPPost>(`/${postType}`, payload);
      return response.data;
    } catch (error) {
      throw this.handleError(error, `Failed to create ${postType}`);
    }
  }

  /**
   * Update an existing post
   */
  async updatePost(id: number, payload: UpdatePostPayload, postType = 'posts'): Promise<WPPost> {
    try {
      const response = await this.client.post<WPPost>(`/${postType}/${id}`, payload);
      return response.data;
    } catch (error) {
      throw this.handleError(error, `Failed to update ${postType} ${id}`);
    }
  }

  // =============================================================================
  // Media
  // =============================================================================

  /**
   * Upload an image to the WordPress Media Library
   */
  async uploadMedia(imageBuffer: Buffer, filename: string, altText?: string): Promise<number> {
    const form = new FormData();
    form.append('file', imageBuffer, {
      filename,
      contentType: 'image/jpeg',
    });

    if (altText) {
      form.append('alt_text', altText);
    }

    try {
      const response = await this.client.post<WPMedia>('/media', form, {
        headers: { ...form.getHeaders() },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      return response.data.id;
    } catch (error) {
      throw this.handleError(error, 'Failed to upload media');
    }
  }

  /**
   * Get media details by ID
   */
  async getMedia(id: number): Promise<WPMedia | null> {
    if (id === 0) return null;
    try {
      const response = await this.client.get<WPMedia>(`/media/${id}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) return null;
      throw this.handleError(error, `Failed to fetch media ${id}`);
    }
  }

  // =============================================================================
  // Categories & Tags (for silo management)
  // =============================================================================

  /**
   * Fetch all categories
   */
  async getCategories(): Promise<WPCategory[]> {
    try {
      const response = await this.client.get<WPCategory[]>('/categories', {
        params: { per_page: 100 },
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to fetch categories');
    }
  }

  /**
   * Create a new category (optionally nested under a parent)
   */
  async createCategory(name: string, parent?: number, description?: string): Promise<WPCategory> {
    try {
      const response = await this.client.post<WPCategory>('/categories', {
        name,
        parent: parent || 0,
        description: description || '',
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error, `Failed to create category "${name}"`);
    }
  }

  /**
   * Find or create a category by name
   */
  async findOrCreateCategory(name: string, parent?: number): Promise<WPCategory> {
    const existing = await this.getCategories();
    const match = existing.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (match) return match;
    return this.createCategory(name, parent);
  }

  /**
   * Fetch all tags
   */
  async getTags(): Promise<WPTag[]> {
    try {
      const response = await this.client.get<WPTag[]>('/tags', {
        params: { per_page: 100 },
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to fetch tags');
    }
  }

  /**
   * Create a new tag
   */
  async createTag(name: string): Promise<WPTag> {
    try {
      const response = await this.client.post<WPTag>('/tags', { name });
      return response.data;
    } catch (error) {
      throw this.handleError(error, `Failed to create tag "${name}"`);
    }
  }

  /**
   * Find or create tags by name, returns array of tag IDs
   */
  async findOrCreateTags(names: string[]): Promise<number[]> {
    const existing = await this.getTags();
    const ids: number[] = [];

    for (const name of names) {
      const match = existing.find(t => t.name.toLowerCase() === name.toLowerCase());
      if (match) {
        ids.push(match.id);
      } else {
        const created = await this.createTag(name);
        ids.push(created.id);
      }
    }

    return ids;
  }

  // =============================================================================
  // Slim SEO Meta
  // =============================================================================

  /**
   * Read Slim SEO meta fields for a post.
   * Slim SEO stores data in the `slim_seo` post_meta key as a serialized array.
   */
  async getSlimSeoMeta(postId: number): Promise<SlimSeoMeta> {
    try {
      const post = await this.client.get<WPPost>(`/posts/${postId}`, {
        params: { _fields: 'meta' },
      });
      const meta = post.data.meta as Record<string, unknown> | undefined;
      const slimSeo = meta?.['slim_seo'] as Record<string, unknown> | undefined;

      return {
        title: slimSeo?.['title'] as string | undefined,
        description: slimSeo?.['description'] as string | undefined,
        facebook_image: slimSeo?.['facebook_image'] as string | undefined,
        twitter_image: slimSeo?.['twitter_image'] as string | undefined,
        noindex: slimSeo?.['noindex'] as boolean | undefined,
        canonical: slimSeo?.['canonical'] as string | undefined,
      };
    } catch (error) {
      throw this.handleError(error, `Failed to read Slim SEO meta for post ${postId}`);
    }
  }

  /**
   * Update Slim SEO meta fields for a post
   */
  async updateSlimSeoMeta(postId: number, seoMeta: SlimSeoMeta): Promise<void> {
    try {
      await this.client.post(`/posts/${postId}`, {
        meta: {
          slim_seo: seoMeta,
        },
      });
    } catch (error) {
      throw this.handleError(error, `Failed to update Slim SEO meta for post ${postId}`);
    }
  }

  // =============================================================================
  // Content Helpers
  // =============================================================================

  /**
   * Check if a post has meaningful content
   */
  hasContent(post: WPPost): boolean {
    const content = post.content?.rendered?.trim() || '';
    const stripped = content.replace(/<[^>]*>/g, '').trim();
    return stripped.length > 50;
  }

  /**
   * Check if a post has a featured image
   */
  hasFeaturedImage(post: WPPost): boolean {
    return post.featured_media > 0;
  }

  // =============================================================================
  // Error Handler
  // =============================================================================

  private handleError(error: unknown, context: string): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ message?: string }>;
      const status = axiosError.response?.status;
      const message = axiosError.response?.data?.message || axiosError.message;
      return new Error(`${context}: [${status}] ${message}`);
    }
    return new Error(`${context}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
