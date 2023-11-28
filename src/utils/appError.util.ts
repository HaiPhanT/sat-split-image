export class AppError extends Error {
  constructor(
    message?: string,
    private _errorCode = 'INTERNAL_SERVER_ERROR',
    private _httpStatusCode: number = 500,
    private _details?: unknown,
  ) {
    super(message);
  }

  get errorCode() {
    return this._errorCode;
  }

  get httpStatusCode() {
    return this._httpStatusCode;
  }

  get details() {
    return this._details;
  }
}
