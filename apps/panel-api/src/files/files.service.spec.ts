import {
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FilesService } from './files.service';

/**
 * Direct file upload proxies raw bytes to the agent's jailed file manager,
 * rejecting empties and anything past the agent's 32 MiB signed-body cap
 * before it can silently truncate into a signature failure.
 */
describe('FilesService.upload', () => {
  const node = { id: 'node-1', name: 'node-1' };
  let prisma: any;
  let agent: any;
  let service: FilesService;

  beforeEach(() => {
    prisma = {
      server: {
        findFirst: jest.fn().mockResolvedValue({ id: 'srv-1', node }),
      },
    };
    agent = { uploadFileBytes: jest.fn().mockResolvedValue(undefined) };
    service = new FilesService(prisma, agent as any);
  });

  it('streams the bytes to the agent and echoes the result', async () => {
    const bytes = Buffer.from('hello world');
    const res = await service.upload('srv-1', '/mods/foo.jar', bytes);
    expect(res).toEqual({
      status: 'uploaded',
      path: '/mods/foo.jar',
      bytes: bytes.length,
    });
    expect(agent.uploadFileBytes).toHaveBeenCalledWith(
      node,
      'srv-1',
      '/mods/foo.jar',
      bytes,
    );
  });

  it('rejects a missing destination path', async () => {
    await expect(
      service.upload('srv-1', '', Buffer.from('x')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(agent.uploadFileBytes).not.toHaveBeenCalled();
  });

  it('rejects an empty / non-buffer body', async () => {
    await expect(
      service.upload('srv-1', '/a.txt', Buffer.alloc(0)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.upload('srv-1', '/a.txt', {} as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(agent.uploadFileBytes).not.toHaveBeenCalled();
  });

  it('rejects a file over the 32 MiB cap before hitting the agent', async () => {
    const tooBig = Buffer.alloc(32 * 1024 * 1024 + 1);
    await expect(
      service.upload('srv-1', '/big.zip', tooBig),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(agent.uploadFileBytes).not.toHaveBeenCalled();
    expect(prisma.server.findFirst).not.toHaveBeenCalled();
  });
});
