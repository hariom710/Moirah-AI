// stream-guard.ts — pure request-correlation check for streamed AI events.
//
// Extracted from the overlay's IPC listeners so the stale-event rejection is
// unit-tested against the exact predicate used in production
// (tests/stream-guard.test.ts).
//
// WHY THIS MATTERS: AI responses stream as many chunk events plus a terminal
// done/error event. If the user asks a second question (or cancels) while the
// first is still in flight, events from the abandoned request keep arriving.
// Without correlation the old response would keep appending into the new
// answer. Every streamed event carries the requestId of the request that
// produced it; events whose id does not match the currently active request
// must be dropped.

/**
 * True only for events belonging to the currently active request.
 *
 * An empty activeRequestId means no request is in flight (e.g. right after a
 * completed stream clears it), so every event is rejected in that state —
 * late chunks from a finished request can never resurrect the UI.
 */
export function isCurrentStreamEvent(incomingRequestId: string, activeRequestId: string): boolean {
  if (!activeRequestId) return false
  return incomingRequestId === activeRequestId
}
