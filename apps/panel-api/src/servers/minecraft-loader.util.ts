/**
 * The unified "minecraft" egg supports several server loaders. Each launches
 * differently, so when a customer picks a loader the panel swaps the server's
 * startup command to the matching (already-validated) invocation. The install
 * script branches on the LOADER env var; the allocated port is written into
 * server.properties for every loader, with paper additionally honouring --port.
 */
export const MINECRAFT_LOADERS = [
  'vanilla',
  'paper',
  'fabric',
  'forge',
  'neoforge',
] as const;

export type MinecraftLoader = (typeof MINECRAFT_LOADERS)[number];

export function isMinecraftLoader(v: string): v is MinecraftLoader {
  return (MINECRAFT_LOADERS as readonly string[]).includes(v);
}

const JVM = 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -Dterminal.jline=false -Dterminal.ansi=true';

/** Loader → startup command (with {{SERVER_MEMORY}}/{{SERVER_PORT}} placeholders). */
export const LOADER_STARTUP: Record<MinecraftLoader, string> = {
  // Vanilla reads server.properties for the port (no --port flag).
  vanilla: `${JVM} -jar {{SERVER_JARFILE}} nogui`,
  // Paper honours --port (and we also write server.properties).
  paper: `${JVM} -jar {{SERVER_JARFILE}} --port {{SERVER_PORT}} --nogui`,
  // Fabric launches its generated server-launch jar; port via server.properties.
  fabric: `${JVM} -jar fabric-server-launch.jar nogui`,
  // Forge/NeoForge launch via generated arg files; port via server.properties.
  forge: `${JVM} @user_jvm_args.txt @unix_args.txt nogui`,
  neoforge: `${JVM} @user_jvm_args.txt @unix_args.txt nogui`,
};
