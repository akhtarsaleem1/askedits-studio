import config from "../../../config/default.js"

/**
 * In-memory render job queue with concurrency control.
 * Jobs are processed in FIFO order with configurable max concurrent jobs.
 */

const queue = []
const activeJobs = new Map()
const completedJobs = new Map()
const MAX_COMPLETED_HISTORY = 100

let maxConcurrency = config.renderQueue?.maxConcurrency ?? 2

/**
 * Create a render job descriptor.
 */
function createJob({ jobId, assetId, settings, executor, onProgress }) {
  return {
    jobId,
    assetId,
    settings,
    executor,
    onProgress,
    status: "queued",
    progress: 0,
    priority: 0,
    error: null,
    result: null,
    queuedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null
  }
}

/**
 * Try to start the next job(s) in the queue.
 */
async function drain() {
  while (activeJobs.size < maxConcurrency && queue.length > 0) {
    // Sort queue by priority (higher priority first)
    queue.sort((a, b) => b.priority - a.priority)

    const job = queue.shift()
    if (!job) break

    job.status = "processing"
    job.startedAt = new Date().toISOString()
    activeJobs.set(job.jobId, job)

    // Execute in background
    executeJob(job)
  }
}

/**
 * Execute a single render job.
 */
async function executeJob(job) {
  try {
    const result = await job.executor((pct) => {
      job.progress = pct
      job.onProgress?.(pct)
    })

    job.status = "ready"
    job.progress = 100
    job.result = result
    job.completedAt = new Date().toISOString()
  } catch (error) {
    job.status = error.name === "AbortError" ? "cancelled" : "failed"
    job.error = error.message
    job.completedAt = new Date().toISOString()
    console.error(`[render-queue] Job ${job.jobId} failed: ${error.message}`)
  } finally {
    activeJobs.delete(job.jobId)

    // Move to completed history
    completedJobs.set(job.jobId, job)
    if (completedJobs.size > MAX_COMPLETED_HISTORY) {
      const oldest = completedJobs.keys().next().value
      completedJobs.delete(oldest)
    }

    // Process next job
    drain()
  }
}

/**
 * Enqueue a new render job.
 *
 * @param {object} options
 * @param {string} options.jobId - Unique job ID
 * @param {string} options.assetId - Asset being rendered
 * @param {object} options.settings - Render settings
 * @param {function} options.executor - Async function(onProgress) that performs the render
 * @param {function} [options.onProgress] - Progress callback
 * @param {number} [options.priority] - Higher = processed sooner (default: 0)
 * @returns {object} Job descriptor
 */
export function enqueueRenderJob({ jobId, assetId, settings, executor, onProgress, priority = 0 }) {
  const maxQueueSize = config.renderQueue?.maxQueueSize ?? 50

  if (queue.length >= maxQueueSize) {
    throw new Error(`Render queue is full (${maxQueueSize} jobs). Please wait for some jobs to complete.`)
  }

  const job = createJob({ jobId, assetId, settings, executor, onProgress })
  job.priority = priority

  queue.push(job)
  console.log(`[render-queue] Enqueued job ${jobId} for asset ${assetId} (queue: ${queue.length}, active: ${activeJobs.size})`)

  // Start processing if we have capacity
  drain()

  return {
    jobId: job.jobId,
    status: job.status,
    position: queue.indexOf(job) + 1,
    queuedAt: job.queuedAt
  }
}

/**
 * Get the status of a specific job.
 */
export function getJobStatus(jobId) {
  // Check active
  const active = activeJobs.get(jobId)
  if (active) {
    return serializeJob(active)
  }

  // Check queued
  const queued = queue.find(j => j.jobId === jobId)
  if (queued) {
    return serializeJob(queued)
  }

  // Check completed
  const completed = completedJobs.get(jobId)
  if (completed) {
    return serializeJob(completed)
  }

  return null
}

/**
 * Get full queue status.
 */
export function getQueueStatus() {
  return {
    maxConcurrency,
    activeCount: activeJobs.size,
    queuedCount: queue.length,
    completedCount: completedJobs.size,
    active: Array.from(activeJobs.values()).map(serializeJob),
    queued: queue.map(serializeJob),
    recentCompleted: Array.from(completedJobs.values())
      .slice(-10)
      .reverse()
      .map(serializeJob)
  }
}

/**
 * Cancel a queued job (cannot cancel active jobs).
 */
export function cancelJob(jobId) {
  const idx = queue.findIndex(j => j.jobId === jobId)
  if (idx === -1) {
    return false
  }

  const [removed] = queue.splice(idx, 1)
  removed.status = "cancelled"
  removed.completedAt = new Date().toISOString()
  completedJobs.set(removed.jobId, removed)

  console.log(`[render-queue] Cancelled job ${jobId}`)
  return true
}

/**
 * Prioritize a queued job (move to front of queue).
 */
export function prioritizeJob(jobId) {
  const job = queue.find(j => j.jobId === jobId)
  if (!job) return false

  job.priority = Math.max(...queue.map(j => j.priority), 0) + 1
  console.log(`[render-queue] Prioritized job ${jobId} (priority: ${job.priority})`)
  return true
}

/**
 * Update max concurrency at runtime.
 */
export function setMaxConcurrency(n) {
  maxConcurrency = Math.max(1, Math.min(n, 8))
  console.log(`[render-queue] Max concurrency set to ${maxConcurrency}`)
  drain()
}

function serializeJob(job) {
  return {
    jobId: job.jobId,
    assetId: job.assetId,
    status: job.status,
    progress: job.progress,
    priority: job.priority,
    error: job.error,
    queuedAt: job.queuedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt
  }
}
