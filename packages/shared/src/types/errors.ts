// Error codes and error response types for the platform

/** Application error codes */
export enum ErrorCode {
  // Authentication errors (2xxx)
  INVALID_CREDENTIALS = 'AUTH_2001',
  TOKEN_EXPIRED = 'AUTH_2002',
  REFRESH_TOKEN_INVALID = 'AUTH_2003',
  ACCOUNT_LOCKED = 'AUTH_2004',
  SESSION_EXPIRED = 'AUTH_2005',

  // Authorization errors (3xxx)
  FORBIDDEN = 'AUTHZ_3001',
  TENANT_ACCESS_DENIED = 'AUTHZ_3002',
  ROLE_INSUFFICIENT = 'AUTHZ_3003',
  INVALID_TENANT = 'AUTHZ_3004',

  // Validation errors (4xxx)
  VALIDATION_FAILED = 'VAL_4001',
  INVALID_INPUT = 'VAL_4002',
  INVALID_FORMAT = 'VAL_4003',
  FIELD_TOO_LONG = 'VAL_4004',
  FIELD_REQUIRED = 'VAL_4005',

  // Resource errors (5xxx)
  NOT_FOUND = 'RES_5001',
  ALREADY_EXISTS = 'RES_5002',
  CONFLICT = 'RES_5003',

  // Guest errors (6xxx)
  GUEST_NOT_FOUND = 'GUEST_6001',
  GUEST_DUPLICATE_NAME = 'GUEST_6002',
  QR_CODE_INVALID = 'GUEST_6003',
  QR_CODE_INACTIVE = 'GUEST_6004',

  // Check-in errors (7xxx)
  ALREADY_CHECKED_IN = 'CHECKIN_7001',
  INVALID_QR = 'CHECKIN_7002',
  SCANNER_LIMIT_REACHED = 'CHECKIN_7003',
  WRONG_EVENT_QR = 'CHECKIN_7004',

  // RSVP errors (8xxx)
  RSVP_GUEST_COUNT_EXCEEDED = 'RSVP_8001',
  RSVP_INVALID_ATTENDANCE = 'RSVP_8002',

  // CMS errors (9xxx)
  SECTION_NOT_FOUND = 'CMS_9001',
  INVALID_SECTION_TYPE = 'CMS_9002',
  SORT_ORDER_CONFLICT = 'CMS_9003',

  // File upload errors (10xxx)
  FILE_TOO_LARGE = 'UPLOAD_10001',
  INVALID_FILE_FORMAT = 'UPLOAD_10002',
  MALWARE_DETECTED = 'UPLOAD_10003',
  UPLOAD_FAILED = 'UPLOAD_10004',

  // Rate limiting (11xxx)
  RATE_LIMIT_EXCEEDED = 'RATE_11001',

  // Notification errors (12xxx)
  NOTIFICATION_FAILED = 'NOTIF_12001',
  CONTACT_MISSING = 'NOTIF_12002',

  // Server errors (99xxx)
  INTERNAL_ERROR = 'SRV_99001',
  SERVICE_UNAVAILABLE = 'SRV_99002',
}

/** Structured error detail for validation failures */
export interface ValidationErrorDetail {
  field: string;
  message: string;
  code: string;
}

/** Standard API error response */
export interface ApiError {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: ValidationErrorDetail[];
  };
}

/** HTTP status code mapping for error codes */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  [ErrorCode.INVALID_CREDENTIALS]: 401,
  [ErrorCode.TOKEN_EXPIRED]: 401,
  [ErrorCode.REFRESH_TOKEN_INVALID]: 401,
  [ErrorCode.ACCOUNT_LOCKED]: 423,
  [ErrorCode.SESSION_EXPIRED]: 401,

  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.TENANT_ACCESS_DENIED]: 403,
  [ErrorCode.ROLE_INSUFFICIENT]: 403,
  [ErrorCode.INVALID_TENANT]: 403,

  [ErrorCode.VALIDATION_FAILED]: 400,
  [ErrorCode.INVALID_INPUT]: 400,
  [ErrorCode.INVALID_FORMAT]: 400,
  [ErrorCode.FIELD_TOO_LONG]: 400,
  [ErrorCode.FIELD_REQUIRED]: 400,

  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.ALREADY_EXISTS]: 409,
  [ErrorCode.CONFLICT]: 409,

  [ErrorCode.GUEST_NOT_FOUND]: 404,
  [ErrorCode.GUEST_DUPLICATE_NAME]: 409,
  [ErrorCode.QR_CODE_INVALID]: 400,
  [ErrorCode.QR_CODE_INACTIVE]: 400,

  [ErrorCode.ALREADY_CHECKED_IN]: 409,
  [ErrorCode.INVALID_QR]: 404,
  [ErrorCode.SCANNER_LIMIT_REACHED]: 403,
  [ErrorCode.WRONG_EVENT_QR]: 404,

  [ErrorCode.RSVP_GUEST_COUNT_EXCEEDED]: 400,
  [ErrorCode.RSVP_INVALID_ATTENDANCE]: 400,

  [ErrorCode.SECTION_NOT_FOUND]: 404,
  [ErrorCode.INVALID_SECTION_TYPE]: 400,
  [ErrorCode.SORT_ORDER_CONFLICT]: 409,

  [ErrorCode.FILE_TOO_LARGE]: 413,
  [ErrorCode.INVALID_FILE_FORMAT]: 415,
  [ErrorCode.MALWARE_DETECTED]: 422,
  [ErrorCode.UPLOAD_FAILED]: 500,

  [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,

  [ErrorCode.NOTIFICATION_FAILED]: 500,
  [ErrorCode.CONTACT_MISSING]: 400,

  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
};
