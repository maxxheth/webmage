/**
 * Context for the pipeline, holding input, output, and shared memory
 */
export type Context<T = any> = {
  input: T;
  output?: any;
  memory: any;
  error?: Error;
};

/**
 * A single step in the pipeline
 */
export type Step<T = any> = (ctx: Context<T>) => Promise<Context<T>>;

/**
 * Composable functional pipeline for processing data through discrete steps
 */
export class Pipeline<T = any> {
  private current: () => Promise<Context<T>>;

  constructor(ctx: Context<T> | (() => Promise<Context<T>>)) {
    if (typeof ctx === 'function') {
      this.current = ctx;
    } else {
      this.current = async () => ctx;
    }
  }

  /**
   * Chain a new step to the pipeline
   */
  pipe(step: Step<T>): Pipeline<T> {
    const next = async () => {
      const ctx = await this.current();
      
      // If there's already an error, skip subsequent steps
      if (ctx.error) return ctx;
      
      try {
        return await step(ctx);
      } catch (error) {
        return {
          ...ctx,
          error: error instanceof Error ? error : new Error(String(error))
        };
      }
    };
    
    return new Pipeline<T>(next);
  }

  /**
   * Run the pipeline and return the final context
   */
  async run(): Promise<Context<T>> {
    return this.current();
  }
}
