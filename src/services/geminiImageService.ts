import { GoogleGenAI } from '@google/genai';

/**
 * Gemini Image Generation Service (Nano Banana / Nano Banana Pro)
 *
 * Optional image generation for featured images using Google's Gemini
 * image generation models. Gated behind ENABLE_IMAGES=true.
 */
export class GeminiImageService {
  private client: GoogleGenAI;
  private modelName: string;

  constructor() {
    const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_AI_STUDIO_API_KEY environment variable is required');
    }

    this.client = new GoogleGenAI({ apiKey });
    this.modelName = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.0-flash-preview-image-generation';
  }

  /**
   * Generate an image from a text prompt
   * Returns the image as a Buffer
   */
  async generateImage(prompt: string): Promise<Buffer> {
    const enhancedPrompt = this.enhancePrompt(prompt);

    try {
      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: enhancedPrompt,
        config: {
          responseModalities: ['image', 'text'],
        },
      });

      // Find the image part in the response
      const parts = response.candidates?.[0]?.content?.parts;
      if (!parts) {
        throw new Error('No content parts in response');
      }

      const imagePart = parts.find(p => p.inlineData?.data);
      if (!imagePart?.inlineData?.data) {
        throw new Error('No image data found in response');
      }

      return Buffer.from(imagePart.inlineData.data, 'base64');
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Image generation failed: ${error.message}`);
      }
      throw new Error(`Image generation failed: ${String(error)}`);
    }
  }

  /**
   * Enhance the prompt with quality-improving prefixes
   */
  private enhancePrompt(prompt: string): string {
    const qualityPrefix = 'Professional editorial photography, 8K resolution, 16:9 aspect ratio, perfect lighting, ';
    const qualitySuffix = ', magazine quality, no text overlays, no watermarks';

    // Don't double-enhance if prompt already contains quality indicators
    if (prompt.toLowerCase().includes('8k') || prompt.toLowerCase().includes('professional')) {
      return prompt;
    }

    return `${qualityPrefix}${prompt}${qualitySuffix}`;
  }

  /**
   * Test the API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.models.generateContent({
        model: this.modelName.replace('-image-generation', ''),
        contents: 'ping',
      });
      return !!response.candidates;
    } catch (error) {
      console.error('Gemini connection test failed:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * Get the configured model name
   */
  getModel(): string {
    return this.modelName;
  }
}
