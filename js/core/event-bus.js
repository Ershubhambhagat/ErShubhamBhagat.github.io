/**
 * js/core/event-bus.js - the only cross-module channel in the application.
 *
 * Sections must not import each other. When one has to react to something
 * another did (search narrowed the page, theme changed, favourites changed),
 * it subscribes here instead.
 *
 * Contract events (.build/CONTRACT.md):
 *   data:loaded       - every dataset is loaded and the sections have consumed it
 *   search:query      - Global Search published a query
 *   theme:changed     - Theme Studio applied a different theme
 *   bookmarks:changed - a bookmark was added or removed
 *   modal:close       - a dialog closed (emitted by js/core/modal-manager.js)
 *
 * Deliberately absent: wildcards, async dispatch and event history. They would
 * add ordering rules nobody needs yet, and a subscriber that misses an event
 * before it registers is a bug the caller should see, not one a replay hides.
 */

/**
 * event name -> Set of handlers.
 *
 * A Set (not an array) makes `off()` idempotent: subscribing the same function
 * twice cannot leave a duplicate behind that fires twice per emit.
 */
const handlerMap = new Map();

/**
 * Validates the event name once, in one place, so a typo surfaces at the call
 * site with the offending string instead of silently never firing.
 *
 * @param {string} event
 * @returns {string} The same name, for chaining.
 */
function assertEventName(event) {
  if (typeof event !== "string" || event.trim() === "") {
    throw new TypeError("Event name must be a non-empty string.");
  }

  return event;
}

/**
 * Subscribes a handler to one event.
 *
 * @param {string} event - Event name, e.g. "theme:changed".
 * @param {(detail: any) => void} handler
 * @returns {() => void} Unsubscribe function. Use it in cleanup paths instead
 *   of remembering to call off() with the same pair; it cannot drift.
 */
export function on(event, handler) {
  assertEventName(event);

  if (typeof handler !== "function") {
    throw new TypeError(`Handler for "${event}" must be a function.`);
  }

  let handlers = handlerMap.get(event);

  if (!handlers) {
    handlers = new Set();
    handlerMap.set(event, handlers);
  }

  handlers.add(handler);

  return () => off(event, handler);
}

/**
 * Removes one handler, or every handler when `handler` is omitted.
 *
 * Removing an event's last handler deletes the map entry so the bus does not
 * accumulate empty sets for events that are no longer used.
 *
 * @param {string} event
 * @param {(detail: any) => void} [handler]
 * @returns {boolean} True when at least one handler was removed.
 */
export function off(event, handler) {
  assertEventName(event);

  const handlers = handlerMap.get(event);

  if (!handlers) {
    return false;
  }

  if (typeof handler === "undefined") {
    handlerMap.delete(event);
    return true;
  }

  const removed = handlers.delete(handler);

  if (handlers.size === 0) {
    handlerMap.delete(event);
  }

  return removed;
}

/**
 * Calls every handler subscribed to `event`.
 *
 * Handlers run synchronously, in subscription order, against a copy of the set:
 * a handler that subscribes or unsubscribes during dispatch cannot change who
 * else receives this emit, which keeps one misbehaving subscriber from
 * swallowing the event for the rest.
 *
 * Each handler is isolated. Reacting to an event is optional work - a broken
 * theme listener must not stop the bookmark listener - so a throw is logged and
 * dispatch continues. Errors are never swallowed silently: they appear in the
 * console with the event name attached.
 *
 * @param {string} event
 * @param {any} [detail] - Passed to every handler as its only argument.
 * @returns {number} How many handlers ran, including those that threw.
 */
export function emit(event, detail) {
  assertEventName(event);

  const handlers = handlerMap.get(event);

  if (!handlers || handlers.size === 0) {
    return 0;
  }

  const snapshot = [...handlers];

  for (const handler of snapshot) {
    try {
      handler(detail);
    } catch (error) {
      console.error(`Event handler for "${event}" failed:`, error);
    }
  }

  return snapshot.length;
}
