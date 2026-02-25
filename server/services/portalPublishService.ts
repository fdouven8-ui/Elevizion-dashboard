import { db } from "../db";
import { screens } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

export async function publishAssetToScreens(opts: {
  assetId: string;
  yodeckMediaId: number;
  screenIds: string[];
  correlationId: string;
}): Promise<{
  ok: boolean;
  touchedPlaylists: string[];
  pushedPlayers: string[];
  errors: string[];
}> {
  const { assetId, yodeckMediaId, screenIds, correlationId } = opts;
  const LOG = "[PortalPublish]";
  const touchedPlaylists: string[] = [];
  const pushedPlayers: string[] = [];
  const errors: string[] = [];

  console.log(`${LOG} ${correlationId} START assetId=${assetId} yodeckMediaId=${yodeckMediaId} targetScreens=${screenIds.length}`);

  const targetScreens = await db.select({
    id: screens.id,
    name: screens.name,
    playlistId: screens.playlistId,
    yodeckPlayerId: screens.yodeckPlayerId,
  })
    .from(screens)
    .where(inArray(screens.id, screenIds));

  if (targetScreens.length === 0) {
    console.warn(`${LOG} ${correlationId} NO_SCREENS_FOUND for ids=[${screenIds.join(",")}]`);
    return { ok: false, touchedPlaylists, pushedPlayers, errors: ["Geen schermen gevonden"] };
  }

  const { repairScreen } = await import("./screenPlaylistService");

  for (const screen of targetScreens) {
    try {
      if (!screen.yodeckPlayerId) {
        console.warn(`${LOG} ${correlationId} SKIP screen=${screen.name} reason=no_yodeck_player`);
        errors.push(`${screen.name}: geen Yodeck player gekoppeld`);
        continue;
      }

      console.log(`${LOG} ${correlationId} SYNC screen=${screen.name} playlistId=${screen.playlistId} playerId=${screen.yodeckPlayerId}`);

      const result = await repairScreen(screen.id);

      if (result.ok) {
        if (screen.playlistId) touchedPlaylists.push(screen.playlistId);
        pushedPlayers.push(screen.yodeckPlayerId);
        console.log(`${LOG} ${correlationId} OK screen=${screen.name} items=${result.itemCount} ads=${result.adsCount}`);
      } else {
        errors.push(`${screen.name}: ${result.errorReason || "sync mislukt"}`);
        console.warn(`${LOG} ${correlationId} FAIL screen=${screen.name} error=${result.errorReason}`);
      }
    } catch (err: any) {
      errors.push(`${screen.name}: ${err.message}`);
      console.error(`${LOG} ${correlationId} ERROR screen=${screen.name} error=${err.message}`);
    }
  }

  const ok = errors.length === 0 && touchedPlaylists.length > 0;
  console.log(`${LOG} ${correlationId} DONE ok=${ok} playlists=${touchedPlaylists.length} players=${pushedPlayers.length} errors=${errors.length}`);

  return { ok, touchedPlaylists, pushedPlayers, errors };
}
