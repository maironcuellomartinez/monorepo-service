// core/domain/errors/servicenow.errors.ts
import { DomainError } from './domain-error';

export class IssueTypeNotFoundError extends DomainError {
  readonly code = 'ISSUE_TYPE_NOT_FOUND';

  constructor(id: string) {
    super(`Issue type ${id} not found`);
  }
}

export class ServiceNowProfileNotFoundError extends DomainError {
  readonly code = 'SERVICENOW_PROFILE_NOT_FOUND';

  constructor(id: string) {
    super(`ServiceNow profile ${id} not found`);
  }
}

export class ServiceNowProfileAlreadyExistsError extends DomainError {
  readonly code = 'SERVICENOW_PROFILE_ALREADY_EXISTS';

  constructor(snowCompanySysId: string) {
    super(
      `Ya existe un perfil de ServiceNow para el sys_id ${snowCompanySysId}`,
    );
  }
}
