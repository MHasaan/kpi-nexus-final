import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Thrown by ApprovalGateService when a mutation is captured by an active
 * approval workflow. Maps to HTTP 202 Accepted — the change was not applied but
 * a pending ApprovalRequest was recorded; the caller polls / an approver acts.
 */
export class ApprovalRequiredException extends HttpException {
  constructor(
    public readonly requestId: string,
    message = 'Change requires approval; a request has been created',
  ) {
    super({ code: 'APPROVAL_REQUIRED', message, requestId }, HttpStatus.ACCEPTED);
  }
}
