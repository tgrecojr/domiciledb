import type { ReportItem, ReportRoom } from "@/lib/report";

/**
 * Explicit pagination for the proof packet. react-pdf's auto-pagination of a
 * single Page with hundreds of children is O(n²) and overflows yoga past ~80
 * items, so we bound each physical page to a fixed number of item blocks —
 * render time stays linear and never crashes. Pure (no JSX) so it's unit-tested.
 */
export const ITEMS_PER_PAGE = 10;

export interface PageChunk {
  room: ReportRoom;
  items: ReportItem[];
  continued: boolean;
}

export function paginateRooms(rooms: ReportRoom[]): PageChunk[] {
  const chunks: PageChunk[] = [];
  for (const room of rooms) {
    if (room.items.length === 0) continue;
    for (let i = 0; i < room.items.length; i += ITEMS_PER_PAGE) {
      chunks.push({
        room,
        items: room.items.slice(i, i + ITEMS_PER_PAGE),
        continued: i > 0,
      });
    }
  }
  return chunks;
}
