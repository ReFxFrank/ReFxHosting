import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JOB, QUEUE, TransferJob } from '../queue.constants';
import { TransfersService } from '../../servers/transfers.service';

/**
 * Runs an admin-initiated server transfer between nodes off the request path.
 * All of the orchestration (snapshot → provision dest → restore → repoint →
 * delete source) and its rollback live in TransfersService.runTransfer; this
 * worker just invokes it and lets the service record terminal state. Mirrors
 * the reinstall/provisioning processors.
 */
@Processor(QUEUE.TRANSFER)
export class TransferProcessor extends WorkerHost {
  private readonly logger = new Logger(TransferProcessor.name);

  constructor(private readonly transfers: TransfersService) {
    super();
  }

  async process(job: Job<TransferJob>): Promise<void> {
    if (job.name !== JOB.TRANSFER) return;
    const { transferId } = job.data;
    this.logger.log(`transfer ${transferId}`);
    // runTransfer captures its own failures (recording FAILED + rolling back),
    // so it does not throw; nothing here to retry.
    await this.transfers.runTransfer(transferId);
  }
}
