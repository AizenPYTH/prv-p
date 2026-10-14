import handler from "@/amaz/api/extract.js";
import { adaptNodeHandler } from "@/lib/nodeHandler";

export const maxDuration = 60;
export const POST = adaptNodeHandler(handler);
