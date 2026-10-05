// Monta todas las rutas de Better Auth bajo /api/auth/*
// (por ejemplo /api/auth/sign-in/email o /api/auth/get-session).
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
