import { AsyncLocalStorage } from "node:async_hooks";

// The existing runner operation owns its child driver requests, including calls
// nested in Judge/HITL/fanout. Async context keeps parallel executions separate.
export const operationContext = new AsyncLocalStorage();
