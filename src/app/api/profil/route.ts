import handler from "@/amaz/api/profil.js";
import { adaptNodeHandler } from "@/lib/nodeHandler";

export const maxDuration = 60;
export const POST = adaptNodeHandler(handler);
