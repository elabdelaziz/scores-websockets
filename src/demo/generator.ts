/**
 * Demo Event Generator
 *
 * Generates simulated live commentary events for demo matches.
 * This allows production users to experience the websocket flow
 * without needing external seed scripts.
 */

import { db } from "../db/db.ts";
import { matches, commentary, type Match } from "../db/schema.ts";
import { getMatchStatus } from "../utils/match-status.ts";

export interface DemoSession {
  matchId: number;
  match: Match;
  intervalId: NodeJS.Timeout | null;
  eventCount: number;
  maxEvents: number;
  startedAt: Date;
  isActive: boolean;
}

// Demo templates for different sports
const DEMO_TEMPLATES = {
  football: {
    eventTypes: ["kickoff", "goal", "yellow_card", "red_card", "substitution", "corner", "free_kick", "penalty", "halftime", "fulltime"],
    teams: [
      { home: "Manchester United", away: "Liverpool" },
      { home: "Real Madrid", away: "Barcelona" },
      { home: "Bayern Munich", away: "Dortmund" },
    ],
    periods: ["1st Half", "2nd Half", "Extra Time", "Penalties"],
    generateMessage: (eventType: string, team: string, minute: number): string => {
      const messages: Record<string, string[]> = {
        kickoff: [`Kickoff! ${team} starts the match!`, `The referee blows the whistle. ${team} kicks off!`],
        goal: [
          `⚽ GOAL! ${team} scores in the ${minute}'! Incredible finish!`,
          `⚽ GOOOAL! ${team} finds the back of the net!`,
          `⚽ Brilliant goal by ${team}! ${minute}' on the clock!`,
        ],
        yellow_card: [`🟨 Yellow card for ${team} in the ${minute}'`, `Booking for ${team} at ${minute}'`],
        red_card: [`🟥 Red card! ${team} down to 10 men in the ${minute}'!`],
        substitution: [`🔄 Substitution for ${team} at ${minute}'`],
        corner: [`Corner kick awarded to ${team} in the ${minute}'`],
        free_kick: [`Free kick for ${team} just outside the box at ${minute}'`],
        penalty: [`⚽ PENALTY! ${team} has a chance from the spot in the ${minute}'!`],
        halftime: [`HT: The referee blows for halftime. An exciting first half!`],
        fulltime: [`FT: That's the final whistle! What a match!`],
      };
      const options = messages[eventType] || [`${eventType} event for ${team} at ${minute}'`];
      return options[Math.floor(Math.random() * options.length)];
    },
  },
  cricket: {
    eventTypes: ["boundary", "six", "wicket", "over", "milestone", "partnership", "drinks", "innings_break"],
    teams: [
      { home: "India", away: "Australia" },
      { home: "England", away: "South Africa" },
      { home: "Pakistan", away: "New Zealand" },
    ],
    periods: ["1st Innings", "2nd Innings", "3rd Innings", "4th Innings"],
    generateMessage: (eventType: string, team: string, minute: number): string => {
      const messages: Record<string, string[]> = {
        boundary: [`🏏 FOUR! Beautifully driven to the boundary by ${team}!`, `🏏 Cracking shot! ${team} gets another boundary!`],
        six: [`🏏 SIX! Massive hit from ${team}! Into the crowd!`, `🏏 MAXIMUM! ${team} clears the ropes!`],
        wicket: [`🎯 WICKET! ${team} loses a wicket! Big moment in the match!`],
        over: [`End of the over. ${team} looking solid.`],
        milestone: [`🏆 ${team} reaches a milestone! 50/100 runs!`],
        partnership: [`Strong partnership building for ${team}.`],
        drinks: [`🥤 Drinks break called. Players refresh.`],
        innings_break: [`📊 Innings break! Teams switch roles.`],
      };
      const options = messages[eventType] || [`${eventType} event for ${team}`];
      return options[Math.floor(Math.random() * options.length)];
    },
  },
  basketball: {
    eventTypes: ["basket", "three_pointer", "free_throw", "foul", "timeout", "quarter_end", "game_end"],
    teams: [
      { home: "Lakers", away: "Celtics" },
      { home: "Warriors", away: "Nets" },
      { home: "Bulls", away: "Heat" },
    ],
    periods: ["Q1", "Q2", "Q3", "Q4", "OT"],
    generateMessage: (eventType: string, team: string, minute: number): string => {
      const messages: Record<string, string[]> = {
        basket: [`🏀 ${team} scores! Nice inside finish!`, `🏀 Easy bucket for ${team}!`],
        three_pointer: [`🎯 THREE! ${team} from downtown!`, `🏀 Splash! ${team} drains the three!`],
        free_throw: [`🏀 Free throw made by ${team}.`],
        foul: [`⚠️ Foul called on ${team}.`],
        timeout: [`⏸️ Timeout called by ${team}.`],
        quarter_end: [`📊 End of quarter!`],
        game_end: [`🏆 That's the game! Final buzzer sounds!`],
      };
      const options = messages[eventType] || [`${eventType} event for ${team}`];
      return options[Math.floor(Math.random() * options.length)];
    },
  },
};

type SportType = keyof typeof DEMO_TEMPLATES;

// Active demo sessions
const activeSessions = new Map<number, DemoSession>();

/**
 * Create a new demo match
 */
export async function createDemoMatch(
  sport: SportType = "football",
  options: {
    customTeams?: { home: string; away: string };
    durationMinutes?: number;
    eventIntervalMs?: number;
    maxEvents?: number;
  } = {}
): Promise<DemoSession> {
  const template = DEMO_TEMPLATES[sport];
  if (!template) {
    throw new Error(`Unsupported sport: ${sport}`);
  }

  const teams = options.customTeams || template.teams[Math.floor(Math.random() * template.teams.length)];
  const now = new Date();
  const durationMinutes = options.durationMinutes || 90;
  const startTime = new Date(now.getTime() - 5 * 60 * 1000); // Started 5 minutes ago
  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

  // Create match in database
  const [match] = await db
    .insert(matches)
    .values({
      sport,
      homeTeam: teams.home,
      awayTeam: teams.away,
      status: "live",
      startTime,
      endTime,
      homeScore: 0,
      awayScore: 0,
    })
    .returning();

  const session: DemoSession = {
    matchId: match.id,
    match,
    intervalId: null,
    eventCount: 0,
    maxEvents: options.maxEvents || 50,
    startedAt: now,
    isActive: false,
  };

  return session;
}

/**
 * Start generating demo events for a match
 */
export function startDemoSession(
  session: DemoSession,
  broadcastCommentary: (matchId: number, data: unknown) => void,
  options: {
    eventIntervalMs?: number;
    onUpdateScore?: (matchId: number, homeScore: number, awayScore: number) => Promise<void>;
  } = {}
): DemoSession {
  if (session.isActive) {
    return session;
  }

  const sport = session.match.sport as SportType;
  const template = DEMO_TEMPLATES[sport];
  const intervalMs = options.eventIntervalMs || 5000; // Default: 5 seconds between events

  let homeScore = session.match.homeScore;
  let awayScore = session.match.awayScore;

  session.isActive = true;
  session.intervalId = setInterval(async () => {
    if (session.eventCount >= session.maxEvents) {
      stopDemoSession(session);
      return;
    }

    // Generate random event
    const eventType = template.eventTypes[Math.floor(Math.random() * template.eventTypes.length)];
    const team = Math.random() < 0.5 ? session.match.homeTeam : session.match.awayTeam;
    const minute = Math.min(90, Math.floor(session.eventCount * 2) + Math.floor(Math.random() * 5));
    const period = template.periods[Math.floor(Math.random() * template.periods.length)];

    const message = template.generateMessage(eventType, team, minute);

    // Check for scoring events
    let homeDelta = 0;
    let awayDelta = 0;

    if (sport === "football" && eventType === "goal") {
      if (team === session.match.homeTeam) {
        homeDelta = 1;
      } else {
        awayDelta = 1;
      }
    } else if (sport === "cricket" && (eventType === "boundary" || eventType === "six")) {
      const runs = eventType === "six" ? 6 : 4;
      if (team === session.match.homeTeam) {
        homeDelta = runs;
      } else {
        awayDelta = runs;
      }
    } else if (sport === "basketball") {
      let points = 2;
      if (eventType === "three_pointer") points = 3;
      else if (eventType === "free_throw") points = 1;
      
      if (team === session.match.homeTeam) {
        homeDelta = points;
      } else {
        awayDelta = points;
      }
    }

    homeScore += homeDelta;
    awayScore += awayDelta;

    // Create commentary entry
    const [commentaryEntry] = await db
      .insert(commentary)
      .values({
        matchId: session.matchId,
        minute,
        sequence: session.eventCount + 1,
        period,
        eventType,
        actor: team,
        team,
        message,
        metadata: { homeScore, awayScore },
      })
      .returning();

    // Broadcast via websocket
    broadcastCommentary(session.matchId, commentaryEntry);

    // Update score if scoring event
    if (homeDelta > 0 || awayDelta > 0) {
      if (options.onUpdateScore) {
        await options.onUpdateScore(session.matchId, homeScore, awayScore);
      }
    }

    session.eventCount++;
    session.match.homeScore = homeScore;
    session.match.awayScore = awayScore;
  }, intervalMs);

  activeSessions.set(session.matchId, session);
  return session;
}

/**
 * Stop a demo session
 */
export function stopDemoSession(session: DemoSession): DemoSession {
  if (session.intervalId) {
    clearInterval(session.intervalId);
    session.intervalId = null;
  }
  session.isActive = false;
  activeSessions.delete(session.matchId);
  return session;
}

/**
 * Get all active demo sessions
 */
export function getActiveDemoSessions(): DemoSession[] {
  return Array.from(activeSessions.values());
}

/**
 * Get a specific demo session
 */
export function getDemoSession(matchId: number): DemoSession | undefined {
  return activeSessions.get(matchId);
}

/**
 * Get supported sports
 */
export function getSupportedSports(): string[] {
  return Object.keys(DEMO_TEMPLATES);
}

/**
 * Get demo template for a sport
 */
export function getDemoTemplate(sport: string) {
  return DEMO_TEMPLATES[sport as SportType];
}
