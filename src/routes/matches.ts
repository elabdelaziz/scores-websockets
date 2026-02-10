import { Router } from "express";
import { createMatchSchema } from "../validation/matches.ts";
import { matches } from "../db/schema.ts";
import { db } from "../db/db.ts";
import { getMatchStatus } from "../utils/match-status.ts";
import { listMatchesQuerySchema } from "../validation/matches.ts";
import { desc } from "drizzle-orm";

const MAX_LIMIT = 100;
export const matchRouter = Router();

matchRouter.get("/", async (req, res) => {
  const parsed = listMatchesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid query parameters",
      details: parsed.error.issues,
    });
  }
  const limit = Math.min(parsed.data.limit ?? 50, MAX_LIMIT);

  try {
    const data = await db
      .select()
      .from(matches)
      .orderBy(desc(matches.startTime))
      .limit(limit);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      error: "failed to fetch matches",
    });
  }
});

matchRouter.post("/", async (req, res) => {
  const parsedData = createMatchSchema.safeParse(req.body);

  if (!parsedData.success) {
    return res.status(400).json({
      message: "Invalid match data",
      details: parsedData.error.issues,
    });
  }

  const { startTime, endTime, homeScore, awayScore } = parsedData.data;

  try {
    const [event] = await db
      .insert(matches)
      .values({
        ...parsedData.data,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        homeScore: homeScore ?? 0,
        awayScore: awayScore ?? 0,
        status: getMatchStatus(new Date(startTime), new Date(endTime)),
      })
      .returning();
    return res.status(201).json(event);
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      details: JSON.stringify(error),
    });
  }
});
