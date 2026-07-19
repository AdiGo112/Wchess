# 01-Auth — API Design

## Endpoints

| Method | Path           | Auth     | Description                          |
|--------|----------------|----------|--------------------------------------|
| POST   | /auth/register | None     | Create new user account              |
| POST   | /auth/login    | None     | Login, returns access + refresh token |
| POST   | /auth/refresh  | None     | Exchange refresh token for new tokens |
| POST   | /auth/logout   | JWT      | Revoke current refresh token         |
| GET    | /auth/me       | JWT      | Return current user profile          |

## DTOs

```typescript
// register.dto.ts
export class RegisterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

// login.dto.ts
export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

// refresh.dto.ts
export class RefreshDto {
  @IsString()
  refreshToken: string;
}
```

## Response shapes

```typescript
// POST /auth/register — 201 Created
{
  user: {
    id: string;           // UUID
    username: string;
    email: string;
    rating: number;       // default 1200
    createdAt: string;    // ISO 8601
  }
}

// POST /auth/login — 200 OK
{
  accessToken: string;   // JWT, 15m
  refreshToken: string;  // opaque hex, 7d
  user: {
    id: string;
    username: string;
    email: string;
    rating: number;
  }
}

// POST /auth/refresh — 200 OK
{
  accessToken: string;
  refreshToken: string;  // new token (rotation)
}

// POST /auth/logout — 204 No Content
(empty body)

// GET /auth/me — 200 OK
{
  id: string;
  username: string;
  email: string;
  rating: number;
  createdAt: string;
}
```

## Error codes

| Status | Code                    | When                                             |
|--------|-------------------------|--------------------------------------------------|
| 400    | VALIDATION_ERROR        | Missing or malformed fields                      |
| 401    | INVALID_CREDENTIALS     | Wrong email or password on login                 |
| 401    | TOKEN_EXPIRED           | Access token is expired                          |
| 401    | REFRESH_TOKEN_INVALID   | Refresh token not found, expired, or revoked     |
| 409    | EMAIL_ALREADY_EXISTS    | Email already registered                         |
| 409    | USERNAME_ALREADY_EXISTS | Username already taken                           |

## JWT payload structure

```typescript
interface JwtPayload {
  sub: string;      // userId (UUID)
  username: string;
  iat: number;      // issued at (Unix timestamp)
  exp: number;      // expiry (Unix timestamp, iat + 900)
}
```
