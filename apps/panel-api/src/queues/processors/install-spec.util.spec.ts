import { buildInstallSpec } from './install-spec.util';

/**
 * buildInstallSpec env derivation — specifically that SERVER_MEMORY (-Xmx) is
 * system-managed from the server's ACTUAL RAM allocation, never the frozen
 * template default or a stale stored value. A stale value here is how a server
 * resized to 14GB kept launching a 3GB JVM heap.
 */
describe('buildInstallSpec SERVER_MEMORY', () => {
  const baseServer = (over: Record<string, unknown> = {}) =>
    ({
      id: 'srv-1',
      shortId: 'aabbccdd',
      deployMethod: 'DOCKER',
      startupCommand: 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar server.jar',
      dockerImage: 'eclipse-temurin:21-jre',
      environment: {},
      cpuCores: 4,
      memoryMb: 14096,
      swapMb: 0,
      diskMb: 10240,
      ioWeight: null,
      allocations: [],
      variables: [],
      template: {
        startupCommand: 'java -jar server.jar',
        startupDetect: '',
        stopCommand: 'stop',
        dockerImages: { Default: 'eclipse-temurin:21-jre' },
        installScript: null,
        configFiles: null,
        supportsWorkshop: false,
        workshopAppId: null,
        variables: [
          {
            envName: 'SERVER_MEMORY',
            defaultValue: '3072',
            userEditable: false,
          },
          { envName: 'MAX_PLAYERS', defaultValue: '20', userEditable: true },
        ],
      },
      ...over,
    }) as never;

  it('derives SERVER_MEMORY from the RAM allocation, not the template default', () => {
    const spec = buildInstallSpec(baseServer());
    // 14096MB allocation - 2048MB headroom (15% capped) = 12048MB heap.
    expect(spec.environment.SERVER_MEMORY).toBe('12048');
    expect(spec.environment.MAX_PLAYERS).toBe('20');
  });

  it('overrides a stale stored value/environment too', () => {
    const spec = buildInstallSpec(
      baseServer({
        environment: { SERVER_MEMORY: '3072' },
        variables: [{ envName: 'SERVER_MEMORY', value: '4096' }],
      }),
    );
    expect(spec.environment.SERVER_MEMORY).toBe('12048');
  });

  it('leaves a user-editable SERVER_MEMORY alone', () => {
    const server = baseServer();
    (server as { template: { variables: { userEditable: boolean }[] } }).template.variables[0].userEditable = true;
    const spec = buildInstallSpec(server);
    expect(spec.environment.SERVER_MEMORY).toBe('3072'); // template default kept
  });

  it('does not inject SERVER_MEMORY for templates without the variable', () => {
    const server = baseServer();
    (server as { template: { variables: unknown[] } }).template.variables = [];
    const spec = buildInstallSpec(server);
    expect(spec.environment.SERVER_MEMORY).toBeUndefined();
  });
});
