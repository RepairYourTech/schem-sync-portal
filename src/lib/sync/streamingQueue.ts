import { Logger } from "../logger";

/**
 * A streaming queue for files that have been cleaned and are ready for upsync.
 * Enables parallel processing: cloud phase consumes files as shield clears them.
 */
export class StreamingFileQueue {
    private queue: string[] = [];
    private pendingFiles: Set<string> = new Set();
    private isComplete = false;
    private drainResolvers: (() => void)[] = [];

    /**
     * Add a cleaned file to the queue for upsync.
     */
    push(file: string) {
        this.queue.push(file);
        // Wake up any waiting drainers
        while (this.drainResolvers.length > 0) {
            const resolver = this.drainResolvers.pop();
            resolver?.();
        }
    }

    /**
     * Mark a file as pending shield clearance.
     * File is held until shield verification completes.
     */
    markPending(file: string) {
        this.pendingFiles.add(file);
        Logger.debug("SYNC", `File marked pending shield clearance: ${file}`);
    }

    /**
     * Clear pending files that have passed shield verification.
     * Moves verified files from pending to the actual queue.
     */
    clearPending(files: string[]) {
        for (const file of files) {
            if (this.pendingFiles.has(file)) {
                this.pendingFiles.delete(file);
                this.queue.push(file);
                Logger.debug("SYNC", `File cleared for upsync: ${file}`);
            }
        }
        // Wake up any waiting drainers
        while (this.drainResolvers.length > 0) {
            const resolver = this.drainResolvers.pop();
            resolver?.();
        }
    }

    /**
     * Get count of files pending shield clearance.
     */
    getPendingCount(): number {
        return this.pendingFiles.size;
    }

    /**
     * Mark the queue as complete (no more files will be added).
     */
    markComplete() {
        if (this.pendingFiles.size > 0) {
            Logger.warn("SYNC", `Queue marked complete with ${this.pendingFiles.size} files still pending! These will never be upsynced.`);
        }
        this.isComplete = true;
        Logger.debug("SYNC", "Queue marked complete");
        // Wake up drainers so they can exit
        while (this.drainResolvers.length > 0) {
            const resolver = this.drainResolvers.pop();
            resolver?.();
        }
    }

    /**
     * Check if queue has more items or is still receiving.
     */
    hasMore(): boolean {
        return !this.isComplete || this.queue.length > 0;
    }

    /**
     * Drain the queue in batches. Yields batches of files as they become available.
     * Completes when the queue is marked complete AND empty.
     * 
     * @param batchSize Maximum files per batch
     */
    async *drain(batchSize = 50): AsyncGenerator<string[], void, unknown> {
        while (this.hasMore()) {
            if (this.queue.length > 0) {
                const batch = this.queue.splice(0, batchSize);
                Logger.debug("SYNC", `Yielding batch of ${batch.length} files`);
                yield batch;
            } else if (!this.isComplete) {
                // Wait for more files or completion
                await new Promise<void>(resolve => {
                    this.drainResolvers.push(resolve);
                });
            }
        }
    }

    /**
     * Get current queue length (for progress tracking).
     */
    get length(): number {
        return this.queue.length;
    }
}
