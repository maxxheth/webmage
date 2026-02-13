import { z } from 'zod';
import { OllamaService } from '../../services/ollamaService.js';

const ImagePromptSchema = z.object({
  prompt: z.string(),
  altText: z.string(),
  filename: z.string(),
});

const SYSTEM_PROMPT = `You are an expert at creating image generation prompts for SEO-focused blog post featured images. Your prompts should produce professional, high-quality images that complement the content and work well as social sharing images.`;

/**
 * Image Prompt Generation Chain
 *
 * Generates image prompts or placeholder HTML depending on ENABLE_IMAGES config.
 * When images are enabled, produces detailed prompts suitable for AI image generation.
 * When disabled, produces descriptive placeholder divs.
 */
export class ImagePromptChain {
  private ollama: OllamaService;
  private imagesEnabled: boolean;

  constructor(ollama: OllamaService) {
    this.ollama = ollama;
    this.imagesEnabled = process.env.ENABLE_IMAGES === 'true';
  }

  /**
   * Generate an image prompt for a post's featured image
   */
  async generatePrompt(
    postTitle: string,
    postExcerpt: string,
    businessNiche: string
  ): Promise<{ prompt: string; altText: string; filename: string }> {
    if (!this.imagesEnabled) {
      return this.createPlaceholder(postTitle, businessNiche);
    }

    const userPrompt = `Generate an image prompt for a blog post featured image.

## Post Details
- Title: "${postTitle}"
- Excerpt: "${postExcerpt}"
- Business Niche: ${businessNiche}

## Requirements
- prompt: Detailed image generation prompt (8K, professional photography style, 16:9 aspect ratio)
- altText: SEO-optimized alt text for the image (include the keyword naturally)
- filename: kebab-case filename without extension (e.g., "professional-lawn-care-dallas")

The image should be professional, eye-catching, and relevant to the content.
Avoid text overlays, logos, or watermarks in the prompt.`;

    return this.ollama.generateStructured(userPrompt, ImagePromptSchema, SYSTEM_PROMPT);
  }

  /**
   * Create a placeholder when image generation is disabled
   */
  private createPlaceholder(
    postTitle: string,
    businessNiche: string
  ): { prompt: string; altText: string; filename: string } {
    const slug = postTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    return {
      prompt: `[IMAGE PLACEHOLDER] Featured image for "${postTitle}" - ${businessNiche}`,
      altText: `${postTitle} - ${businessNiche}`,
      filename: slug,
    };
  }

  /**
   * Generate placeholder HTML for embedding in content
   */
  createPlaceholderHtml(altText: string): string {
    return `<div class="image-placeholder" style="background:#f0f0f0;padding:60px 20px;text-align:center;border:2px dashed #ccc;border-radius:8px;margin:20px 0;">
  <p style="color:#666;font-size:14px;">📷 ${altText}</p>
</div>`;
  }
}
