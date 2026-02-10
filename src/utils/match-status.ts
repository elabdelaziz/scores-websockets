import { MATCH_STATUS } from "../validation/matches.ts";
import type { Match } from "../db/schema.ts";

export type MatchStatus = (typeof MATCH_STATUS)[keyof typeof MATCH_STATUS];

export function getMatchStatus(
  startTime: Date,
  endTime: Date | null,
  now = new Date(),
): MatchStatus {
  const start = new Date(startTime);
  if (!endTime) return MATCH_STATUS.LIVE;
  const end = new Date(endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return MATCH_STATUS.SCHEDULED;
  }

  if (now < start) {
    return MATCH_STATUS.SCHEDULED;
  }

  if (now >= end) {
    return MATCH_STATUS.FINISHED;
  }

  return MATCH_STATUS.LIVE;
}

export async function syncMatchStatus(
  match: Match,
  updateStatus: (status: MatchStatus) => Promise<any> | any,
): Promise<MatchStatus> {
  const nextStatus = getMatchStatus(match.startTime, match.endTime);
  if (!nextStatus) {
    return match.status as MatchStatus;
  }
  if (match.status !== nextStatus) {
    await updateStatus(nextStatus);
    (match as any).status = nextStatus;
  }
  return match.status as MatchStatus;
}
