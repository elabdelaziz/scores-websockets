import { Router } from "express";
import {
  createDemoMatch,
  startDemoSession,
  stopDemoSession,
  getActiveDemoSessions,
  getSupportedSports,
  getDemoTemplate,
  type DemoSession,
} from "../demo/index.ts";
import { z } from "zod";

const demoSessions = new Map<number, DemoSession>();

// Validation schemas
const startDemoSchema = z.object({
  sport: z.enum(["football", "cricket", "basketball"]).optional().default("football"),
  customTeams: z
    .object({
      home: z.string().min(1),
      away: z.string().min(1),
    })
    .optional(),
  durationMinutes: z.number().int().min(1).max(300).optional(),
  eventIntervalMs: z.number().int().min(1000).max(60000).optional(),
  maxEvents: z.number().int().min(1).max(500).optional(),
});

const stopDemoSchema = z.object({
  matchId: z.number().int().positive(),
});

export const demoRouter = Router({ mergeParams: true });

/**
 * POST /demo/start
 * Create and start a new demo match with live commentary events
 */
demoRouter.post("/start", async (req, res) => {
  const parsed = startDemoSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid demo configuration",
      details: parsed.error.issues,
    });
  }

  // Check if broadcast function is available
  if (!req.app.locals.broadcastCommentary) {
    return res.status(503).json({
      error: "WebSocket broadcast not available",
      message: "Demo mode requires active WebSocket server",
    });
  }

  try {
    // Create demo match
    const session = await createDemoMatch(parsed.data.sport, {
      customTeams: parsed.data.customTeams,
      durationMinutes: parsed.data.durationMinutes,
      eventIntervalMs: parsed.data.eventIntervalMs,
      maxEvents: parsed.data.maxEvents,
    });

    // Start generating events
    const activeSession = startDemoSession(
      session,
      req.app.locals.broadcastCommentary,
      {
        eventIntervalMs: parsed.data.eventIntervalMs,
      }
    );

    demoSessions.set(activeSession.matchId, activeSession);

    return res.status(201).json({
      message: "Demo match started",
      match: {
        id: activeSession.matchId,
        sport: activeSession.match.sport,
        homeTeam: activeSession.match.homeTeam,
        awayTeam: activeSession.match.awayTeam,
        homeScore: activeSession.match.homeScore,
        awayScore: activeSession.match.awayScore,
        status: activeSession.match.status,
        startTime: activeSession.match.startTime,
        endTime: activeSession.match.endTime,
      },
      demo: {
        maxEvents: activeSession.maxEvents,
        startedAt: activeSession.startedAt,
        isActive: activeSession.isActive,
      },
    });
  } catch (error) {
    console.error("Failed to start demo:", error);
    return res.status(500).json({
      error: "Failed to start demo match",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /demo/stop
 * Stop a running demo session
 */
demoRouter.post("/stop", async (req, res) => {
  const parsed = stopDemoSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request",
      details: parsed.error.issues,
    });
  }

  const session = demoSessions.get(parsed.data.matchId);

  if (!session) {
    return res.status(404).json({
      error: "Demo session not found",
      matchId: parsed.data.matchId,
    });
  }

  const stoppedSession = stopDemoSession(session);
  demoSessions.delete(parsed.data.matchId);

  return res.json({
    message: "Demo session stopped",
    matchId: stoppedSession.matchId,
    eventsGenerated: stoppedSession.eventCount,
    duration: Date.now() - stoppedSession.startedAt.getTime(),
  });
});

/**
 * GET /demo/sessions
 * List all active demo sessions
 */
demoRouter.get("/sessions", (req, res) => {
  const sessions = getActiveDemoSessions();

  return res.json({
    count: sessions.length,
    sessions: sessions.map((s) => ({
      matchId: s.matchId,
      sport: s.match.sport,
      homeTeam: s.match.homeTeam,
      awayTeam: s.match.awayTeam,
      eventCount: s.eventCount,
      maxEvents: s.maxEvents,
      isActive: s.isActive,
      startedAt: s.startedAt,
    })),
  });
});

/**
 * GET /demo/sports
 * List all supported sports for demo mode
 */
demoRouter.get("/sports", (req, res) => {
  const sports = getSupportedSports();

  const sportDetails = sports.map((sport) => {
    const template = getDemoTemplate(sport);
    return {
      name: sport,
      eventTypes: template?.eventTypes || [],
      periods: template?.periods || [],
      sampleTeams: template?.teams || [],
    };
  });

  return res.json({
    count: sports.length,
    sports: sportDetails,
  });
});
