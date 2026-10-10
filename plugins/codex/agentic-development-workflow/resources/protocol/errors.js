export class ProtocolError extends Error {
  constructor(code, message, details = null, options = undefined) {
    super(message, options);
    this.name = 'ProtocolError';
    this.code = code;
    this.details = details;
  }
}

export class ContractError extends ProtocolError {
  constructor(message, details = null, options = undefined) {
    super('CONTRACT_INVALID', message, details, options);
    this.name = 'ContractError';
  }
}

export class CompatibilityError extends ProtocolError {
  constructor(message, details = null, options = undefined) {
    super('MODEL_INCOMPATIBLE', message, details, options);
    this.name = 'CompatibilityError';
  }
}

export class TransitionRejectedError extends ProtocolError {
  constructor(message, details = null, options = undefined) {
    super('TRANSITION_REJECTED', message, details, options);
    this.name = 'TransitionRejectedError';
  }
}
