import arcjet, { detectBot, shield, slidingWindow } from "@arcjet/node";
import { type Request, type Response, type NextFunction } from "express";

const arcjetKey = process.env.ARCJET_KEY;
const arcjetMode: "LIVE" | "DRY_RUN" =
  process.env.ARCJET_MODE === "DRY_RUN" ? "DRY_RUN" : "LIVE";

if (!arcjetKey) {
  throw new Error("ARCJET_KEY is not set");
}

export const httpArcjet = arcjet({
  key: arcjetKey,
  rules: [
    shield({ mode: arcjetMode }),
    detectBot({
      mode: arcjetMode,
      allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:PREVIEW"],
    }),
    slidingWindow({
      mode: arcjetMode,
      interval: "10s",
      max: 50,
    }),
  ],
});

export const wsArcjet = arcjet({
  key: arcjetKey,
  rules: [
    shield({ mode: arcjetMode }),
    detectBot({
      mode: arcjetMode,
      allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:PREVIEW"],
    }),
    slidingWindow({
      mode: arcjetMode,
      interval: "2s",
      max: 5,
    }),
  ],
});

export function securityMiddleware() {
  return async function (req: Request, res: Response, next: NextFunction) {
    if (!httpArcjet) {
      return next();
    }

    try {
      const decision = await httpArcjet.protect(req);
      if (decision.isDenied()) {
        if (decision.reason.isRateLimit()) {
          return res.status(429).json({
            message: "Too many requests",
          });
        }
        return res.status(403).json({
          message: "Forbidden",
        });
      }
    } catch (error) {
      console.error("Arcjet failed");
      return res.status(503).json({
        message: "Service Unavailable",
      });
    }

    next();
  };
}
