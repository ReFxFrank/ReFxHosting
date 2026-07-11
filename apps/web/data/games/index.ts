import type { GameContent } from "@/lib/game-content";
import americanTruckSimulator from "./american-truck-simulator";
import arkSurvivalEvolved from "./ark-survival-evolved";
import armaReforger from "./arma-reforger";
import arma3 from "./arma3";
import conanExiles from "./conan-exiles";
import cs2 from "./cs2";
import dayz from "./dayz";
import enshrouded from "./enshrouded";
import fivem from "./fivem";
import garrysMod from "./garrys-mod";
import insurgencySandstorm from "./insurgency-sandstorm";
import killingFloor2 from "./killing-floor-2";
import minecraft from "./minecraft";
import minecraftFabric from "./minecraft-fabric";
import minecraftForge from "./minecraft-forge";
import minecraftNeoforge from "./minecraft-neoforge";
import minecraftPaper from "./minecraft-paper";
import mordhau from "./mordhau";
import palworld from "./palworld";
import projectZomboid from "./project-zomboid";
import rust from "./rust";
import satisfactory from "./satisfactory";
import sevenDaysToDie from "./seven-days-to-die";
import sonsOfTheForest from "./sons-of-the-forest";
import squad from "./squad";
import teamFortress2 from "./team-fortress-2";
import theForest from "./the-forest";
import theIsle from "./the-isle";
import unturned from "./unturned";
import valheim from "./valheim";

/**
 * Registry mapping template slug → editorial content for /games/[slug].
 * Static imports so content ships in the build — regenerate the import list
 * when a game module is added under this folder.
 */
const MODULES: GameContent[] = [
  americanTruckSimulator,
  arkSurvivalEvolved,
  armaReforger,
  arma3,
  conanExiles,
  cs2,
  dayz,
  enshrouded,
  fivem,
  garrysMod,
  insurgencySandstorm,
  killingFloor2,
  minecraft,
  minecraftFabric,
  minecraftForge,
  minecraftNeoforge,
  minecraftPaper,
  mordhau,
  palworld,
  projectZomboid,
  rust,
  satisfactory,
  sevenDaysToDie,
  sonsOfTheForest,
  squad,
  teamFortress2,
  theForest,
  theIsle,
  unturned,
  valheim,
];

const REGISTRY = new Map(MODULES.map((m) => [m.slug, m]));

export function getGameContent(slug: string): GameContent | undefined {
  return REGISTRY.get(slug);
}
