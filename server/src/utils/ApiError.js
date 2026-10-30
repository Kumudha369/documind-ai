// One error type for every "expected" failure so responses stay consistent:
// { error: { code, message, details? } }
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Please log in to continue.') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have access to this resource.') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Resource not found.') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(message) {
    return new ApiError(409, 'CONFLICT', message);
  }
  static unprocessable(message, details) {
    return new ApiError(422, 'UNPROCESSABLE', message, details);
  }
}
