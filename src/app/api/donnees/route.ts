import handler from "@/amaz/api/donnees.js";
import { adaptNodeHandler } from "@/lib/nodeHandler";

export const maxDuration = 30;
const route = adaptNodeHandler(handler);
export const GET = route;
export const PUT = route;
